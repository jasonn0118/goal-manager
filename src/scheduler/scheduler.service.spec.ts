import { SchedulerService } from './scheduler.service';
import { GoalsService } from '../goals/goals.service';
import { AiService } from '../ai/ai.service';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';

jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    chat: { postMessage: jest.fn().mockResolvedValue({ ok: true }) },
  })),
}));

const mockGoal = {
  id: 'g1',
  notionPageId: 'g1',
  title: 'Test Goal',
  status: 'in_progress' as const,
  priority: 'high' as const,
  horizon: 'sprint' as const,
  progress: 0,
};

function makeConfigService(channel = 'C123'): ConfigService {
  return {
    get: jest.fn().mockImplementation((key: string) => {
      const map: Record<string, string> = {
        SLACK_BOT_TOKEN: 'xoxb-test',
        SLACK_DIGEST_CHANNEL: channel,
      };
      return map[key];
    }),
  } as unknown as ConfigService;
}

describe('SchedulerService', () => {
  let service: SchedulerService;
  let mockPostMessage: jest.Mock;
  let goalsService: jest.Mocked<GoalsService>;
  let aiService: jest.Mocked<AiService>;

  beforeEach(() => {
    jest.clearAllMocks();

    goalsService = {
      getAllGoals: jest.fn().mockResolvedValue([mockGoal]),
      getActiveGoals: jest.fn().mockResolvedValue([mockGoal]),
      getGoalsByHorizon: jest.fn().mockResolvedValue([mockGoal]),
      getDailyPlansForDate: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<GoalsService>;

    aiService = {
      chat: jest.fn().mockResolvedValue('Here is your digest!'),
    } as unknown as jest.Mocked<AiService>;

    service = new SchedulerService(makeConfigService(), goalsService, aiService);
    mockPostMessage = (WebClient as jest.Mock).mock.results[0].value.chat.postMessage;
  });

  describe('morningDigest', () => {
    it('fetches active goals once and posts a morning message to the digest channel', async () => {
      await service.morningDigest();
      expect(goalsService.getActiveGoals).toHaveBeenCalledTimes(1);
      expect(goalsService.getGoalsByHorizon).not.toHaveBeenCalled();
      expect(aiService.chat).toHaveBeenCalled();
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C123',
          text: expect.stringContaining('Morning Digest'),
        }),
      );
    });

    it('does nothing when SLACK_DIGEST_CHANNEL is not configured', async () => {
      const svc = new SchedulerService(makeConfigService(''), goalsService, aiService);
      await svc.morningDigest();
      expect(goalsService.getGoalsByHorizon).not.toHaveBeenCalled();
    });
  });

  describe('eveningCheckin', () => {
    it('posts a task-specific message listing today\'s planned tasks when plans exist', async () => {
      goalsService.getDailyPlansForDate.mockResolvedValue([
        { id: 'p1', date: '2024-01-15', tasks: 'Build auth module', plannedHours: 3, status: 'Not started' },
      ]);
      await service.eveningCheckin();
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Build auth module'),
        }),
      );
    });

    it('posts a generic check-in message when no plans exist for today', async () => {
      goalsService.getDailyPlansForDate.mockResolvedValue([]);
      await service.eveningCheckin();
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Evening Check-in'),
        }),
      );
    });

    it('does nothing when SLACK_DIGEST_CHANNEL is not configured', async () => {
      const svc = new SchedulerService(makeConfigService(''), goalsService, aiService);
      await svc.eveningCheckin();
      expect(goalsService.getDailyPlansForDate).not.toHaveBeenCalled();
    });
  });

  describe('weeklyReview', () => {
    it('fetches all goals and posts a weekly review message', async () => {
      await service.weeklyReview();
      expect(goalsService.getAllGoals).toHaveBeenCalled();
      expect(aiService.chat).toHaveBeenCalled();
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C123',
          text: expect.stringContaining('Weekly Review'),
        }),
      );
    });

    it('does nothing when SLACK_DIGEST_CHANNEL is not configured', async () => {
      const svc = new SchedulerService(makeConfigService(''), goalsService, aiService);
      await svc.weeklyReview();
      expect(goalsService.getAllGoals).not.toHaveBeenCalled();
    });
  });
});
