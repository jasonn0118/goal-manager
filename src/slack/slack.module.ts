import { Module } from '@nestjs/common';
import { SlackService } from './slack.service';
import { GoalsModule } from '../goals/goals.module';
import { AiModule } from '../ai/ai.module';
import { FocusModule } from '../focus/focus.module';

@Module({
  imports: [GoalsModule, AiModule, FocusModule],
  providers: [SlackService],
  exports: [SlackService],
})
export class SlackModule {}
