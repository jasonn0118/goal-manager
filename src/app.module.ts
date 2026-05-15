import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { NotionModule } from './notion/notion.module';
import { GoalsModule } from './goals/goals.module';
import { AiModule } from './ai/ai.module';
import { SlackModule } from './slack/slack.module';
import { FocusModule } from './focus/focus.module';
import { SchedulerModule } from './scheduler/scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    NotionModule,
    GoalsModule,
    AiModule,
    FocusModule,
    SlackModule,
    SchedulerModule,
  ],
})
export class AppModule {}
