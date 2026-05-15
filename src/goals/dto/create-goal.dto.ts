import { IsString, IsOptional, IsIn, IsDateString, IsNumber, Min, Max } from 'class-validator';

export class CreateGoalDto {
  @IsString()
  title: string;

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
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
