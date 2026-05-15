import { Injectable, Logger } from '@nestjs/common';
import { NotionService } from '../notion/notion.service';

interface ActiveSession {
  goalId: string;
  startTime: Date;
}

@Injectable()
export class FocusService {
  private readonly logger = new Logger(FocusService.name);
  private readonly sessions = new Map<string, ActiveSession>();

  constructor(private readonly notionService: NotionService) {}

  startSession(userId: string, goalId: string): void {
    this.sessions.set(userId, { goalId, startTime: new Date() });
    this.logger.log(`Focus session started for user ${userId} on goal ${goalId}`);
  }

  async endSession(userId: string, outcome: string): Promise<number | null> {
    const session = this.sessions.get(userId);
    if (!session) return null;

    const durationMs = Date.now() - session.startTime.getTime();
    const durationMinutes = Math.round(durationMs / 60000);

    this.sessions.delete(userId);

    await this.notionService.addSessionLog(session.goalId, durationMinutes, outcome);
    this.logger.log(`Focus session ended for user ${userId}: ${durationMinutes} min`);

    return durationMinutes;
  }

  getActiveSession(userId: string): ActiveSession | undefined {
    return this.sessions.get(userId);
  }
}
