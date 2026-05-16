import { Injectable } from '@nestjs/common';
import { NotionService } from '../notion/notion.service';
import { CalendarService } from '../calendar/calendar.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';

export interface Goal {
  id: string;
  notionPageId: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'blocked' | 'done';
  priority: 'high' | 'medium' | 'low';
  horizon: 'daily' | 'sprint' | 'long_term';
  startDate?: string;
  endDate?: string;
  startValue?: number;
  endValue?: number;
  progress: number;
  description?: string;
}

@Injectable()
export class GoalsService {
  constructor(
    private readonly notionService: NotionService,
    private readonly calendarService: CalendarService,
  ) {}

  getAllGoals(): Promise<Goal[]> {
    return this.notionService.getAllGoals();
  }

  getActiveGoals(): Promise<Goal[]> {
    return this.notionService.getActiveGoals();
  }

  getGoalsByHorizon(horizon: string): Promise<Goal[]> {
    return this.notionService.getGoalsByHorizon(horizon);
  }

  createGoal(dto: CreateGoalDto): Promise<Goal> {
    return this.notionService.createGoal(dto);
  }

  updateGoal(notionPageId: string, dto: UpdateGoalDto): Promise<Goal> {
    return this.notionService.updateGoal(notionPageId, dto);
  }

  markGoalDone(notionPageId: string): Promise<Goal> {
    return this.notionService.markGoalDone(notionPageId);
  }

  archiveGoal(notionPageId: string): Promise<void> {
    return this.notionService.archiveGoal(notionPageId);
  }

  async createDailyPlan(
    goalId: string,
    days: { date: string; plannedHours: number; tasks: string }[],
    workStart: string,
    workEnd: string,
  ): Promise<void> {
    const goals = await this.notionService.getAllGoals();
    const goal = goals.find((g) => g.notionPageId === goalId);
    const title = goal?.title ?? 'Project';
    await this.notionService.createDailyPlanRows(goalId, title, days);
    await this.calendarService.scheduleDailyPlan(title, days, workStart, workEnd);
  }

  getDailyPlansForDate(date: string) {
    return this.notionService.getDailyPlansForDate(date);
  }

  getUpcomingDailyPlans(fromDate: string) {
    return this.notionService.getUpcomingDailyPlans(fromDate);
  }

  updateDailyPlanRow(pageId: string, status: string): Promise<void> {
    return this.notionService.updateDailyPlanRow(pageId, status);
  }

  deleteDailyPlanRow(pageId: string): Promise<void> {
    return this.notionService.deleteDailyPlanRow(pageId);
  }

  createCalendarEvent(title: string, start: string, end: string, description?: string, color?: string) {
    return this.calendarService.createEventFromStrings(title, start, end, description, color);
  }

  getUpcomingCalendarEvents(startDate: string, endDate: string): Promise<{ id: string; title: string; start: string; end: string; description?: string }[] | null> {
    return this.calendarService.getUpcomingEvents(startDate, endDate);
  }

  updateCalendarEvent(eventId: string, fields: { title?: string; start?: string; end?: string; description?: string }) {
    return this.calendarService.updateEvent(eventId, fields);
  }

  deleteCalendarEvent(eventId: string) {
    return this.calendarService.deleteEvent(eventId);
  }

  async findGoalByTitle(title: string): Promise<Goal | undefined> {
    const goals = await this.notionService.getAllGoals();
    const lower = title.toLowerCase();
    return goals.find((g) => g.title.toLowerCase().includes(lower));
  }
}
