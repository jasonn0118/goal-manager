import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@notionhq/client';
import { Goal } from '../goals/goals.service';
import { CreateGoalDto } from '../goals/dto/create-goal.dto';
import { mapPageToGoal, mapStatusToNotion, mapPriorityToNotion } from './notion.mapper';

@Injectable()
export class NotionService {
  private readonly logger = new Logger(NotionService.name);
  private readonly client: Client;
  private readonly goalsDbId: string;
  private readonly sessionsDbId: string;
  private readonly dailyPlansDbId: string;

  constructor(private configService: ConfigService) {
    this.client = new Client({ auth: this.configService.get<string>('NOTION_API_KEY') });
    this.goalsDbId = this.configService.get<string>('NOTION_GOALS_DB_ID')!;
    this.sessionsDbId = this.configService.get<string>('NOTION_SESSIONS_DB_ID')!;
    this.dailyPlansDbId = this.configService.get<string>('NOTION_DAILY_PLANS_DB_ID') ?? '';
  }

  async getAllGoals(): Promise<Goal[]> {
    try {
      const response = await this.client.databases.query({ database_id: this.goalsDbId });
      return response.results.map(mapPageToGoal);
    } catch (err) {
      this.logger.error('Failed to fetch all goals', err);
      return [];
    }
  }

  async getGoalsByHorizon(_horizon: string): Promise<Goal[]> {
    // Horizon is not a property in this Notion DB — return all goals as fallback
    return this.getAllGoals();
  }

  async getActiveGoals(): Promise<Goal[]> {
    try {
      // Status is Notion's native "status" type, not "select"
      const response = await this.client.databases.query({
        database_id: this.goalsDbId,
        filter: {
          or: [
            { property: 'Status', status: { equals: 'Not started' } },
            { property: 'Status', status: { equals: 'In progress' } },
          ],
        },
      });
      return response.results.map(mapPageToGoal);
    } catch (err) {
      this.logger.error('Failed to fetch active goals', err);
      return [];
    }
  }

  async createGoal(data: CreateGoalDto): Promise<Goal> {
    try {
      const properties: Record<string, any> = {
        'Project name': { title: [{ text: { content: data.title } }] },
        Status: { status: { name: mapStatusToNotion(data.status ?? 'not_started') } },
        Priority: { select: { name: mapPriorityToNotion(data.priority ?? 'medium') } },
      };

      if (data.startDate) {
        properties['Start date'] = { date: { start: data.startDate } };
      }
      if (data.endDate) {
        properties['End date'] = { date: { start: data.endDate } };
      }

      const page = await this.client.pages.create({
        parent: { database_id: this.goalsDbId },
        properties,
      });

      return mapPageToGoal(page as any);
    } catch (err) {
      this.logger.error('Failed to create goal', err);
      throw err;
    }
  }

  async updateGoal(notionPageId: string, data: Partial<Goal>): Promise<Goal> {
    try {
      const properties: Record<string, any> = {};

      if (data.title) {
        properties['Project name'] = { title: [{ text: { content: data.title } }] };
      }
      if (data.status) {
        properties['Status'] = { status: { name: mapStatusToNotion(data.status) } };
      }
      if (data.priority) {
        properties['Priority'] = { select: { name: mapPriorityToNotion(data.priority) } };
      }
      if (data.startDate !== undefined) {
        properties['Start date'] = { date: data.startDate ? { start: data.startDate } : null };
      }
      if (data.endDate !== undefined) {
        properties['End date'] = { date: data.endDate ? { start: data.endDate } : null };
      }
      // Progress is a formula field (read-only) — skip it

      const page = await this.client.pages.update({ page_id: notionPageId, properties });
      return mapPageToGoal(page as any);
    } catch (err) {
      this.logger.error(`Failed to update goal ${notionPageId}`, err);
      throw err;
    }
  }

  async markGoalDone(notionPageId: string): Promise<Goal> {
    return this.updateGoal(notionPageId, { status: 'done' });
  }

  async archiveGoal(notionPageId: string): Promise<void> {
    try {
      await this.client.pages.update({ page_id: notionPageId, archived: true });
    } catch (err) {
      this.logger.error(`Failed to archive goal ${notionPageId}`, err);
      throw err;
    }
  }

  async createDailyPlanRows(goalId: string, goalTitle: string, days: { date: string; plannedHours: number; tasks: string }[]): Promise<void> {
    if (!this.dailyPlansDbId) {
      this.logger.warn('NOTION_DAILY_PLANS_DB_ID is not set — skipping daily plan creation');
      return;
    }
    for (const day of days) {
      try {
        await this.client.pages.create({
          parent: { database_id: this.dailyPlansDbId },
          properties: {
            Name: { title: [{ text: { content: `${day.date} · ${goalTitle}` } }] },
            Date: { date: { start: day.date } },
            Projects: { relation: [{ id: goalId }] },
            'Planned Hours': { number: day.plannedHours },
            Tasks: { rich_text: [{ text: { content: day.tasks } }] },
            Status: { status: { name: 'Not started' } },
          },
        });
      } catch (err) {
        this.logger.error(`Failed to create daily plan row for ${day.date}`, err);
      }
    }
  }

  async getDailyPlansForDate(date: string): Promise<{ id: string; date: string; tasks: string; plannedHours: number; status: string }[]> {
    if (!this.dailyPlansDbId) return [];
    try {
      const response = await this.client.databases.query({
        database_id: this.dailyPlansDbId,
        filter: { property: 'Date', date: { equals: date } },
      });
      return response.results.map((page: any) => ({
        id: page.id,
        date: page.properties['Date']?.date?.start ?? date,
        tasks: page.properties['Tasks']?.rich_text?.map((t: any) => t.plain_text).join('') ?? '',
        plannedHours: page.properties['Planned Hours']?.number ?? 0,
        status: page.properties['Status']?.status?.name ?? 'Not started',
      }));
    } catch (err) {
      this.logger.error(`Failed to fetch daily plans for ${date}`, err);
      return [];
    }
  }

  async getUpcomingDailyPlans(fromDate: string): Promise<{ id: string; date: string; tasks: string; plannedHours: number; status: string }[]> {
    if (!this.dailyPlansDbId) return [];
    try {
      const response = await this.client.databases.query({
        database_id: this.dailyPlansDbId,
        filter: { property: 'Date', date: { on_or_after: fromDate } },
        sorts: [{ property: 'Date', direction: 'ascending' }],
      });
      return response.results.map((page: any) => ({
        id: page.id,
        date: page.properties['Date']?.date?.start ?? '',
        tasks: page.properties['Tasks']?.rich_text?.map((t: any) => t.plain_text).join('') ?? '',
        plannedHours: page.properties['Planned Hours']?.number ?? 0,
        status: page.properties['Status']?.status?.name ?? 'Not started',
      }));
    } catch (err) {
      this.logger.error('Failed to fetch upcoming daily plans', err);
      return [];
    }
  }

  async updateDailyPlanRow(pageId: string, status: string): Promise<void> {
    try {
      await this.client.pages.update({
        page_id: pageId,
        properties: { Status: { status: { name: status } } },
      });
    } catch (err) {
      this.logger.error(`Failed to update daily plan row ${pageId}`, err);
      throw err;
    }
  }

  async addSessionLog(goalId: string, duration: number, outcome: string): Promise<void> {
    try {
      await this.client.pages.create({
        parent: { database_id: this.sessionsDbId },
        properties: {
          Goal: { relation: [{ id: goalId }] },
          Date: { date: { start: new Date().toISOString().split('T')[0] } },
          Duration: { number: duration },
          Outcome: { rich_text: [{ text: { content: outcome } }] },
        },
      });
    } catch (err) {
      this.logger.error(`Failed to log session for goal ${goalId}`, err);
    }
  }
}
