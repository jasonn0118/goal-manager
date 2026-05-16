import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';
import { GoalsService } from '../goals/goals.service';
import { AiService } from '../ai/ai.service';

const DIGEST_USER_ID = 'scheduler';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly slackClient: WebClient;
  private readonly digestChannel: string;

  constructor(
    private configService: ConfigService,
    private goalsService: GoalsService,
    private aiService: AiService,
  ) {
    this.slackClient = new WebClient(this.configService.get<string>('SLACK_BOT_TOKEN'));
    this.digestChannel = this.configService.get<string>('SLACK_DIGEST_CHANNEL') ?? '';
  }

  @Cron('0 8 * * *', { timeZone: 'America/Vancouver' })
  async morningDigest() {
    if (!this.digestChannel) return;
    this.logger.log('Running morning digest cron');

    try {
      const goals = await this.goalsService.getActiveGoals();
      const message = await this.aiService.chat(
        DIGEST_USER_ID,
        'Good morning! Please give a brief, energizing focus message for today based on my active goals. Keep it under 3 sentences.',
        goals,
      );

      await this.slackClient.chat.postMessage({
        channel: this.digestChannel,
        text: `☀️ *Morning Digest*\n\n${message}`,
      });
    } catch (err) {
      this.logger.error('Morning digest failed', err);
    }
  }

  @Cron('0 18 * * *', { timeZone: 'America/Vancouver' })
  async eveningCheckin() {
    if (!this.digestChannel) return;
    this.logger.log('Running evening check-in cron');

    try {
      const today = new Date().toISOString().split('T')[0];
      const plans = await this.goalsService.getDailyPlansForDate(today);

      let text: string;
      if (plans.length > 0) {
        const taskLines = plans
          .map((p) => `• *${p.tasks}* (${p.plannedHours}h planned) — currently: ${p.status}`)
          .join('\n');
        text = `🌙 *Evening Check-in*\n\nHere's what was planned for today:\n${taskLines}\n\nHow did it go? Reply with *done*, *in progress*, or *skipped* for each task.`;
      } else {
        text = '🌙 *Evening Check-in*\n\nHow did your day go? What goals did you make progress on? Use `/review` for a full summary or just tell me about your wins!';
      }

      await this.slackClient.chat.postMessage({ channel: this.digestChannel, text });
    } catch (err) {
      this.logger.error('Evening check-in failed', err);
    }
  }

  @Cron('0 9 * * 1', { timeZone: 'America/Vancouver' })
  async weeklyReview() {
    if (!this.digestChannel) return;
    this.logger.log('Running weekly review cron');

    try {
      const goals = await this.goalsService.getAllGoals();
      const message = await this.aiService.chat(
        DIGEST_USER_ID,
        'It\'s the start of a new week! Please give me a comprehensive weekly goal summary — what was completed last week, what\'s in progress, what\'s blocked, and what I should prioritize this week.',
        goals,
      );

      await this.slackClient.chat.postMessage({
        channel: this.digestChannel,
        text: `📅 *Weekly Review*\n\n${message}`,
      });
    } catch (err) {
      this.logger.error('Weekly review failed', err);
    }
  }
}
