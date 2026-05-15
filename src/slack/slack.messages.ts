import { Logger } from '@nestjs/common';
import { App } from '@slack/bolt';
import { GoalsService } from '../goals/goals.service';
import { AiService } from '../ai/ai.service';

const logger = new Logger('SlackMessages');

function extractFirstJson(str: string): { json: any; end: number } | null {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '{') { if (start === -1) start = i; depth++; }
    else if (str[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try { return { json: JSON.parse(str.slice(start, i + 1)), end: i + 1 }; } catch { return null; }
      }
    }
  }
  return null;
}

function parseActions(response: string): { cleanText: string; actions: any[] } {
  const marker = 'ACTION:';
  const actions: any[] = [];
  let text = response;

  while (text.includes(marker)) {
    const idx = text.indexOf(marker);
    const result = extractFirstJson(text.slice(idx + marker.length).trimStart());
    if (!result) break;

    let start = text.indexOf('{', idx), end = -1, depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) { end = i + 1; break; }
    }
    if (end === -1) break;

    text = (text.slice(0, idx) + text.slice(end)).replace(/\n?---\n?/g, '\n').trim();
    actions.push(result.json);
  }

  return { cleanText: text, actions };
}

export function registerMessageHandlers(
  app: App,
  goalsService: GoalsService,
  aiService: AiService,
) {
  async function handleMessage(userId: string, text: string, say: (msg: any) => Promise<any>) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const calendarEndDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const [goals, upcomingPlans, calendarEvents] = await Promise.all([
        goalsService.getActiveGoals(),
        goalsService.getUpcomingDailyPlans(today),
        goalsService.getUpcomingCalendarEvents(today, calendarEndDate),
      ]);
      const response = await aiService.chat(userId, text, goals, upcomingPlans, calendarEvents);
      const { cleanText, actions } = parseActions(response);

      let actionError: string | null = null;
      for (const action of actions) {
        actionError = await executeAction(action, goalsService);
        if (actionError) break;
      }

      const finalText = actionError
        ? `${cleanText}\n\n⚠️ Action failed: ${actionError}`
        : cleanText;
      await say(finalText);
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

async function executeAction(action: any, goalsService: GoalsService): Promise<string | null> {
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
      case 'create_daily_plan':
        await goalsService.createDailyPlan(action.goalId, action.days, action.workStart ?? '09:00', action.workEnd ?? '18:00');
        break;
      case 'update_daily_plan':
        await goalsService.updateDailyPlanRow(action.planRowId, action.status);
        break;
      case 'delete_daily_plan':
        await goalsService.deleteDailyPlanRow(action.planRowId);
        break;
      case 'create_calendar_event':
        await goalsService.createCalendarEvent(action.title, action.start, action.end, action.description, action.color);
        break;
      case 'update_calendar_event':
        await goalsService.updateCalendarEvent(action.eventId, action.fields);
        break;
      case 'delete_calendar_event':
        await goalsService.deleteCalendarEvent(action.eventId);
        break;
      default:
        logger.warn(`Unknown action type: ${action.type}`);
    }
    return null;
  } catch (err: any) {
    logger.error(`Failed to execute action ${action.type}`, err);
    return err?.message ?? 'Unknown error';
  }
}
