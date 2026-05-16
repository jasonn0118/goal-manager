import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { Goal } from '../goals/goals.service';
import { buildSystemPrompt } from './ai.prompts';

const MAX_HISTORY = 20;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic;
  private readonly history = new Map<string, MessageParam[]>();

  constructor(private configService: ConfigService) {
    this.client = new Anthropic({ apiKey: this.configService.get<string>('ANTHROPIC_API_KEY') });
  }

  async chat(userId: string, userMessage: string, goals: Goal[], todayPlans: { id: string; tasks: string; plannedHours: number; status: string }[] = [], calendarEvents: { id: string; title: string; start: string; end: string; description?: string }[] = []): Promise<string> {
    const messages = this.history.get(userId) ?? [];

    messages.push({ role: 'user', content: userMessage });

    if (messages.length > MAX_HISTORY) {
      messages.splice(0, messages.length - MAX_HISTORY);
    }

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: buildSystemPrompt(goals, todayPlans, calendarEvents),
        messages,
      });

      const assistantText =
        response.content.find((c) => c.type === 'text')?.text ?? 'Sorry, I could not generate a response.';

      messages.push({ role: 'assistant', content: assistantText });
      if (messages.length > MAX_HISTORY) {
        messages.splice(0, messages.length - MAX_HISTORY);
      }
      this.history.set(userId, messages);

      return assistantText;
    } catch (err) {
      this.logger.error(`Claude API error for user ${userId}`, err);
      return 'Sorry, I ran into an error. Please try again in a moment.';
    }
  }

  clearHistory(userId: string): void {
    this.history.delete(userId);
  }
}
