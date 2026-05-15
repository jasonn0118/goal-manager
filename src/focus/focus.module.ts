import { Module } from '@nestjs/common';
import { FocusService } from './focus.service';
import { NotionModule } from '../notion/notion.module';

@Module({
  imports: [NotionModule],
  providers: [FocusService],
  exports: [FocusService],
})
export class FocusModule {}
