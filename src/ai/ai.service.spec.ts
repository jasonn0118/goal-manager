import { AiService } from './ai.service';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { Goal } from '../goals/goals.service';

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: jest.fn() },
  })),
}));

const mockGoals: Goal[] = [
  {
    id: 'g1',
    notionPageId: 'g1',
    title: 'Learn NestJS',
    status: 'in_progress',
    priority: 'high',
    horizon: 'sprint',
    progress: 0.3,
  },
];

describe('AiService', () => {
  let service: AiService;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    const configService = {
      get: jest.fn().mockReturnValue('test-api-key'),
    } as unknown as ConfigService;
    service = new AiService(configService);
    mockCreate = (Anthropic as unknown as jest.Mock).mock.results[0].value.messages.create;
  });

  describe('chat', () => {
    it('returns the text from the assistant response', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Great job on your goals!' }],
      });
      const result = await service.chat('user-1', 'How am I doing?', mockGoals);
      expect(result).toBe('Great job on your goals!');
    });

    it('calls Claude with goals embedded in the system prompt', async () => {
      mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      await service.chat('user-1', 'hello', mockGoals);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-6',
          system: expect.stringContaining('Learn NestJS'),
          messages: expect.arrayContaining([{ role: 'user', content: 'hello' }]),
        }),
      );
    });

    it('returns a fallback error message when the API throws', async () => {
      mockCreate.mockRejectedValue(new Error('API error'));
      const result = await service.chat('user-1', 'hello', mockGoals);
      expect(result).toContain('error');
    });

    it('accumulates conversation history across multiple calls', async () => {
      mockCreate
        .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Reply 1' }] })
        .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Reply 2' }] });

      await service.chat('user-1', 'First message', mockGoals);
      await service.chat('user-1', 'Second message', mockGoals);

      // The messages array is passed by reference; check specific entries rather than length
      // (the assistant reply gets appended to the same array after the API call)
      const messagesOnSecondCall = mockCreate.mock.calls[1][0].messages;
      expect(messagesOnSecondCall[0]).toEqual({ role: 'user', content: 'First message' });
      expect(messagesOnSecondCall[1]).toEqual({ role: 'assistant', content: 'Reply 1' });
      expect(messagesOnSecondCall[2]).toEqual({ role: 'user', content: 'Second message' });
    });

    it('trims history to MAX_HISTORY (20) messages before calling the API', async () => {
      mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      // 11 turns: turn 1's user message should be trimmed from the history by turn 11
      for (let i = 0; i < 11; i++) {
        await service.chat('trim-user', `Message ${i}`, mockGoals);
      }
      const lastCallMessages = mockCreate.mock.calls[10][0].messages;
      const hasFirstMessage = lastCallMessages.some(
        (m: any) => m.role === 'user' && m.content === 'Message 0',
      );
      expect(hasFirstMessage).toBe(false);
    });

    it('maintains separate history per user', async () => {
      mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      await service.chat('user-a', 'Hello from A', mockGoals);
      await service.chat('user-b', 'Hello from B', mockGoals);

      const callA = mockCreate.mock.calls[0][0].messages;
      const callB = mockCreate.mock.calls[1][0].messages;
      expect(callA[0].content).toBe('Hello from A');
      expect(callB[0].content).toBe('Hello from B');
      // Each user's first call should not contain messages from the other user
      const callAHasB = callA.some((m: any) => m.content === 'Hello from B');
      expect(callAHasB).toBe(false);
    });
  });

  describe('clearHistory', () => {
    it('resets the conversation so the next call starts fresh', async () => {
      mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      await service.chat('user-1', 'First message', mockGoals);

      service.clearHistory('user-1');
      await service.chat('user-1', 'Fresh start', mockGoals);

      const messagesAfterClear = mockCreate.mock.calls[1][0].messages;
      expect(messagesAfterClear[0].content).toBe('Fresh start');
      // The prior "First message" must not appear — history was cleared
      const hasOldMessage = messagesAfterClear.some((m: any) => m.content === 'First message');
      expect(hasOldMessage).toBe(false);
    });
  });
});
