import { Logger } from '@nestjs/common';
import { App } from '@slack/bolt';
import { GoalsService } from '../goals/goals.service';
import { AiService } from '../ai/ai.service';

const logger = new Logger('SlackMessages');

function parseAction(response: string): { cleanText: string; action: any | null } {
  const actionMarker = 'ACTION:';
  const idx = response.indexOf(actionMarker);
  if (idx === -1) return { cleanText: response.trim(), action: null };

  const cleanText = response.slice(0, idx).trim();
  try {
    const action = JSON.parse(response.slice(idx + actionMarker.length).trim());
    return { cleanText, action };
  } catch {
    return { cleanText, action: null };
  }
}

export function registerMessageHandlers(
  app: App,
  goalsService: GoalsService,
  aiService: AiService,
) {
  async function handleMessage(userId: string, text: string, say: (msg: any) => Promise<any>) {
    try {
      const goals = await goalsService.getActiveGoals();
      const response = await aiService.chat(userId, text, goals);
      const { cleanText, action } = parseAction(response);

      if (action) {
        await executeAction(action, goalsService);
      }

      await say(cleanText);
    } catch (err) {
      logger.error('Error handling message', err);
      await say('Sorry, something went wrong. Please try again.');
    }
  }

  app.event('app_mention', async ({ event, say }) => {
    const text = (event as any).text.replace(/<@[^>]+>/g, '').trim();
    await handleMessage(event.user!, text, say);
  });

  app.message(async ({ message, say }) => {
    const msg = message as any;
    if (!msg.text || msg.bot_id) return;
    await handleMessage(msg.user, msg.text, say);
  });
}

async function executeAction(action: any, goalsService: GoalsService) {
  try {
    switch (action.type) {
      case 'update_goal':
        await goalsService.updateGoal(action.goalId, action.fields);
        break;
      case 'create_goal':
        await goalsService.createGoal(action.fields);
        break;
      case 'delete_goal':
        await goalsService.archiveGoal(action.goalId);
        break;
      default:
        logger.warn(`Unknown action type: ${action.type}`);
    }
  } catch (err) {
    logger.error(`Failed to execute action ${action.type}`, err);
  }
}
