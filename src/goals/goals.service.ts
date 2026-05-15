import { Injectable, NotFoundException } from '@nestjs/common';
import { NotionService } from '../notion/notion.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';

export interface Goal {
  id: string;
  notionPageId: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'blocked' | 'done';
  priority: 'high' | 'medium' | 'low';
  horizon: 'daily' | 'sprint' | 'long_term';
  dueDate?: string;
  progress: number;
  notes?: string;
  lastAdjusted?: string;
}

@Injectable()
export class GoalsService {
  constructor(private readonly notionService: NotionService) {}

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

  async findGoalByTitle(title: string): Promise<Goal | undefined> {
    const goals = await this.notionService.getAllGoals();
    const lower = title.toLowerCase();
    return goals.find((g) => g.title.toLowerCase().includes(lower));
  }
}
