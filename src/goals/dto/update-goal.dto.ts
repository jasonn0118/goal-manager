import { IsString, IsOptional, IsIn, IsDateString, IsNumber, Min, Max } from 'class-validator';

export class UpdateGoalDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsIn(['not_started', 'in_progress', 'blocked', 'done'])
  status?: 'not_started' | 'in_progress' | 'blocked' | 'done';

  @IsOptional()
  @IsIn(['high', 'medium', 'low'])
  priority?: 'high' | 'medium' | 'low';

  @IsOptional()
  @IsIn(['daily', 'sprint', 'long_term'])
  horizon?: 'daily' | 'sprint' | 'long_term';

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  lastAdjusted?: string;
}
