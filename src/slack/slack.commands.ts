import { Logger } from '@nestjs/common';
import { App } from '@slack/bolt';
import { GoalsService, Goal } from '../goals/goals.service';
import { AiService } from '../ai/ai.service';
import { FocusService } from '../focus/focus.service';

const logger = new Logger('SlackCommands');

function formatGoalsList(goals: Goal[]): any {
  if (goals.length === 0) {
    return { text: 'No active goals found. Use `/goal-add [title]` to create one!' };
  }

  const priorityEmoji: Record<Goal['priority'], string> = {
    high: '🔴',
    medium: '🟡',
    low: '🟢',
  };

  const statusEmoji: Record<Goal['status'], string> = {
    not_started: '⬜',
    in_progress: '🔄',
    blocked: '🚫',
    done: '✅',
  };

  const blocks: any[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🎯 Your Goals', emoji: true },
    },
  ];

  for (const goal of goals) {
    const due = goal.endDate ? ` · Due: ${goal.endDate}` : '';
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${statusEmoji[goal.status]} ${priorityEmoji[goal.priority]} *${goal.title}*\n` +
          `Progress: ${goal.progress}% · ${goal.horizon}${due}`,
      },
    });
  }

  return { blocks };
}

export function registerCommandHandlers(
  app: App,
  goalsService: GoalsService,
  aiService: AiService,
  focusService: FocusService,
) {
  app.command('/goal-list', async ({ ack, say }) => {
    await ack();
    try {
      const goals = await goalsService.getActiveGoals();
      await say(formatGoalsList(goals));
    } catch (err) {
      logger.error('Error in /goal-list', err);
      await say('Failed to fetch goals. Check your Notion config.');
    }
  });

  app.command('/goal-add', async ({ ack, say, command }) => {
    await ack();
    const title = command.text.trim();
    if (!title) {
      await say('Usage: `/goal-add [goal title]`');
      return;
    }
    try {
      const goal = await goalsService.createGoal({ title });
      await say(`✅ Goal created: *${goal.title}*`);
    } catch (err) {
      logger.error('Error in /goal-add', err);
      await say('Failed to create goal. Please try again.');
    }
  });

  app.command('/focus', async ({ ack, say, command }) => {
    await ack();
    const query = command.text.trim();
    const userId = command.user_id;

    if (!query) {
      await say('Usage: `/focus [goal title or id]`');
      return;
    }

    try {
      const goal = await goalsService.findGoalByTitle(query);
      if (!goal) {
        await say(`Could not find a goal matching *${query}*. Try \`/goal-list\` to see your goals.`);
        return;
      }

      await goalsService.updateGoal(goal.notionPageId, { status: 'in_progress' });
      focusService.startSession(userId, goal.notionPageId);
      await say(`🎯 Focus session started for *${goal.title}*! Use \`/done\` when finished.`);
    } catch (err) {
      logger.error('Error in /focus', err);
      await say('Failed to start focus session.');
    }
  });

  app.command('/done', async ({ ack, say, command }) => {
    await ack();
    const query = command.text.trim();
    const userId = command.user_id;

    try {
      const activeSession = focusService.getActiveSession(userId);
      if (activeSession) {
        const duration = await focusService.endSession(userId, query || 'Completed via /done');
        await say(`✅ Focus session ended! Duration: *${duration} min*`);
        return;
      }

      if (!query) {
        await say('Usage: `/done [goal title]` or end your active focus session.');
        return;
      }

      const goal = await goalsService.findGoalByTitle(query);
      if (!goal) {
        await say(`Could not find a goal matching *${query}*.`);
        return;
      }

      await goalsService.markGoalDone(goal.notionPageId);
      await say(`🎉 Marked *${goal.title}* as done! Great work!`);
    } catch (err) {
      logger.error('Error in /done', err);
      await say('Failed to mark goal as done.');
    }
  });

  app.command('/review', async ({ ack, say, command }) => {
    await ack();
    try {
      const goals = await goalsService.getAllGoals();
      const summary = await aiService.chat(
        command.user_id,
        'Please give me a progress review of all my goals — what I\'ve accomplished, what needs attention, and what I should focus on next.',
        goals,
      );
      await say(summary);
    } catch (err) {
      logger.error('Error in /review', err);
      await say('Failed to generate review.');
    }
  });
}
