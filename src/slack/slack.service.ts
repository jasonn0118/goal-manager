import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, LogLevel } from '@slack/bolt';
import { GoalsService } from '../goals/goals.service';
import { AiService } from '../ai/ai.service';
import { FocusService } from '../focus/focus.service';
import { registerCommandHandlers } from './slack.commands';
import { registerMessageHandlers } from './slack.messages';

@Injectable()
export class SlackService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlackService.name);
  private app: App;

  constructor(
    private configService: ConfigService,
    private goalsService: GoalsService,
    private aiService: AiService,
    private focusService: FocusService,
  ) {
    this.app = new App({
      token: this.configService.get<string>('SLACK_BOT_TOKEN'),
      signingSecret: this.configService.get<string>('SLACK_SIGNING_SECRET'),
      socketMode: true,
      appToken: this.configService.get<string>('SLACK_APP_TOKEN'),
      logLevel: LogLevel.WARN,
    });
  }

  async onModuleInit() {
    registerCommandHandlers(this.app, this.goalsService, this.aiService, this.focusService);
    registerMessageHandlers(this.app, this.goalsService, this.aiService);

    await this.app.start();
    this.logger.log('Slack Bolt app started in Socket Mode');
  }

  async onModuleDestroy() {
    await this.app.stop();
    this.logger.log('Slack Bolt app stopped');
  }

  getApp(): App {
    return this.app;
  }
}
