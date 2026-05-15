import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { GoalsModule } from '../goals/goals.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [GoalsModule, AiModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
