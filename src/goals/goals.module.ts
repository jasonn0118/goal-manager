import { Module } from '@nestjs/common';
import { GoalsService } from './goals.service';
import { GoalsController } from './goals.controller';
import { NotionModule } from '../notion/notion.module';
import { CalendarModule } from '../calendar/calendar.module';

@Module({
  imports: [NotionModule, CalendarModule],
  providers: [GoalsService],
  controllers: [GoalsController],
  exports: [GoalsService],
})
export class GoalsModule {}
