import { NotionService } from './notion.service';
import { ConfigService } from '@nestjs/config';

const mockQuery = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockBlocksList = jest.fn();
const mockBlocksAppend = jest.fn();
const mockBlocksDelete = jest.fn();

jest.mock('@notionhq/client', () => ({
  Client: jest.fn().mockImplementation(() => ({
    databases: { query: mockQuery },
    pages: { create: mockCreate, update: mockUpdate },
    blocks: {
      children: { list: mockBlocksList, append: mockBlocksAppend },
      delete: mockBlocksDelete,
    },
  })),
}));

function makeConfigService(): ConfigService {
  return {
    get: jest.fn().mockImplementation((key: string) => {
      const env: Record<string, string> = {
        NOTION_API_KEY: 'test-key',
        NOTION_GOALS_DB_ID: 'goals-db',
        NOTION_SESSIONS_DB_ID: 'sessions-db',
        NOTION_DAILY_PLANS_DB_ID: 'daily-db',
      };
      return env[key];
    }),
  } as unknown as ConfigService;
}

function makeNotionPage(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    properties: {
      'Project name': { title: [{ plain_text: 'Test Goal' }] },
      Status: { status: { name: 'Not started' } },
      Priority: { select: { name: 'Medium' } },
      'Start date': {},
      'End date': {},
      'Start value': {},
      'End value': {},
      Progress: {},
      Description: { rich_text: [] },
      ...overrides,
    },
  };
}

describe('NotionService', () => {
  let service: NotionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotionService(makeConfigService());
  });

  describe('getAllGoals', () => {
    it('returns mapped goals from the database query', async () => {
      mockQuery.mockResolvedValue({ results: [makeNotionPage('page-1')] });
      const goals = await service.getAllGoals();
      expect(goals).toHaveLength(1);
      expect(goals[0].id).toBe('page-1');
      expect(goals[0].title).toBe('Test Goal');
    });

    it('returns an empty array when the query throws', async () => {
      mockQuery.mockRejectedValue(new Error('Notion error'));
      const goals = await service.getAllGoals();
      expect(goals).toEqual([]);
    });
  });

  describe('getActiveGoals', () => {
    it('queries with a status filter and returns mapped results', async () => {
      mockQuery.mockResolvedValue({ results: [makeNotionPage('page-2')] });
      const goals = await service.getActiveGoals();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.objectContaining({ or: expect.any(Array) }),
        }),
      );
      expect(goals).toHaveLength(1);
    });

    it('returns an empty array when the query throws', async () => {
      mockQuery.mockRejectedValue(new Error('Notion error'));
      const goals = await service.getActiveGoals();
      expect(goals).toEqual([]);
    });
  });

  describe('createGoal', () => {
    it('creates a page with required properties and returns a mapped goal', async () => {
      mockCreate.mockResolvedValue(makeNotionPage('new-page'));
      const goal = await service.createGoal({ title: 'New Goal', status: 'not_started', priority: 'medium' });
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          parent: { database_id: 'goals-db' },
          properties: expect.objectContaining({
            'Project name': expect.any(Object),
            Status: expect.any(Object),
            Priority: expect.any(Object),
          }),
        }),
      );
      expect(goal.id).toBe('new-page');
    });

    it('writes description to both the property and the page body', async () => {
      mockCreate.mockResolvedValue(makeNotionPage('new-page'));
      await service.createGoal({ title: 'Goal', status: 'not_started', priority: 'medium', description: 'Details' });
      const call = mockCreate.mock.calls[0][0];
      expect(call.properties['Description']).toBeDefined();
      expect(call.children).toHaveLength(1);
    });
  });

  describe('updateGoal', () => {
    it('updates goal properties and replaces page body when description is provided', async () => {
      mockUpdate.mockResolvedValue(makeNotionPage('page-1'));
      mockBlocksList.mockResolvedValue({ results: [{ id: 'block-1' }] });
      mockBlocksAppend.mockResolvedValue({});

      await service.updateGoal('page-1', { status: 'in_progress', description: 'New description' });

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockBlocksList).toHaveBeenCalledWith({ block_id: 'page-1' });
      expect(mockBlocksDelete).toHaveBeenCalledWith({ block_id: 'block-1' });
      expect(mockBlocksAppend).toHaveBeenCalled();
    });

    it('does not touch page body when description is not in the update', async () => {
      mockUpdate.mockResolvedValue(makeNotionPage('page-1'));
      await service.updateGoal('page-1', { status: 'done' });
      expect(mockBlocksList).not.toHaveBeenCalled();
    });
  });

  describe('archiveGoal', () => {
    it('archives the Notion page', async () => {
      mockUpdate.mockResolvedValue({});
      await service.archiveGoal('page-1');
      expect(mockUpdate).toHaveBeenCalledWith({ page_id: 'page-1', archived: true });
    });
  });

  describe('createDailyPlanRows', () => {
    it('creates one Notion page per day with the correct properties', async () => {
      mockCreate.mockResolvedValue({});
      const days = [
        { date: '2024-01-15', plannedHours: 2, tasks: 'Work on feature' },
        { date: '2024-01-16', plannedHours: 3, tasks: 'Review and test' },
      ];
      await service.createDailyPlanRows('goal-1', 'My Goal', days);
      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(mockCreate.mock.calls[0][0].properties['Name']).toEqual({
        title: [{ text: { content: '2024-01-15 · My Goal' } }],
      });
      expect(mockCreate.mock.calls[0][0].properties['Projects']).toEqual({
        relation: [{ id: 'goal-1' }],
      });
    });

    it('skips creation when NOTION_DAILY_PLANS_DB_ID is not configured', async () => {
      const noDbConfig = {
        get: jest.fn().mockImplementation((key: string) =>
          key === 'NOTION_DAILY_PLANS_DB_ID' ? undefined : 'some-value',
        ),
      } as unknown as ConfigService;
      const svc = new NotionService(noDbConfig);
      await svc.createDailyPlanRows('goal-1', 'Goal', [{ date: '2024-01-15', plannedHours: 2, tasks: 'Work' }]);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('getDailyPlansForDate', () => {
    it('returns plans matching the given date', async () => {
      mockQuery.mockResolvedValue({
        results: [
          {
            id: 'plan-1',
            properties: {
              Date: { date: { start: '2024-01-15' } },
              Tasks: { rich_text: [{ plain_text: 'Build feature' }] },
              'Planned Hours': { number: 3 },
              Status: { status: { name: 'Not started' } },
            },
          },
        ],
      });
      const plans = await service.getDailyPlansForDate('2024-01-15');
      expect(plans).toHaveLength(1);
      expect(plans[0].tasks).toBe('Build feature');
      expect(plans[0].plannedHours).toBe(3);
    });

    it('returns empty array when daily plans DB is not configured', async () => {
      const noDbConfig = {
        get: jest.fn().mockImplementation((key: string) =>
          key === 'NOTION_DAILY_PLANS_DB_ID' ? undefined : 'some-value',
        ),
      } as unknown as ConfigService;
      const svc = new NotionService(noDbConfig);
      const plans = await svc.getDailyPlansForDate('2024-01-15');
      expect(plans).toEqual([]);
    });
  });

  describe('deleteDailyPlanRow', () => {
    it('archives the daily plan page', async () => {
      mockUpdate.mockResolvedValue({});
      await service.deleteDailyPlanRow('plan-1');
      expect(mockUpdate).toHaveBeenCalledWith({ page_id: 'plan-1', archived: true });
    });
  });

  describe('updateDailyPlanRow', () => {
    it('throws when the initial pages.update call fails', async () => {
      mockUpdate.mockRejectedValue(new Error('Notion API down'));
      await expect(service.updateDailyPlanRow('plan-1', 'Done')).rejects.toThrow('Notion API down');
    });

    it('updates the Status property on the plan row', async () => {
      mockUpdate.mockResolvedValue({
        id: 'plan-1',
        properties: { Projects: { relation: [] } },
      });
      await service.updateDailyPlanRow('plan-1', 'Done');
      expect(mockUpdate).toHaveBeenCalledWith({
        page_id: 'plan-1',
        properties: { Status: { status: { name: 'Done' } } },
      });
    });

    it('recalculates and updates the linked goal status when all rows are Done', async () => {
      mockUpdate.mockResolvedValue({
        id: 'plan-1',
        properties: { Projects: { relation: [{ id: 'goal-1' }] } },
      });
      mockQuery.mockResolvedValue({
        results: [
          { id: 'plan-1', properties: { Status: { status: { name: 'Done' } } } },
          { id: 'plan-2', properties: { Status: { status: { name: 'Done' } } } },
        ],
      });

      await service.updateDailyPlanRow('plan-1', 'Done');

      // Second update call should be for the goal
      expect(mockUpdate).toHaveBeenCalledTimes(2);
      expect(mockUpdate.mock.calls[1][0]).toEqual({
        page_id: 'goal-1',
        properties: { Status: { status: { name: 'Done' } } },
      });
    });

    it('sets goal to In progress when some rows are done but not all', async () => {
      mockUpdate.mockResolvedValue({
        id: 'plan-1',
        properties: { Projects: { relation: [{ id: 'goal-1' }] } },
      });
      mockQuery.mockResolvedValue({
        results: [
          { id: 'plan-1', properties: { Status: { status: { name: 'Done' } } } },
          { id: 'plan-2', properties: { Status: { status: { name: 'Not started' } } } },
        ],
      });

      await service.updateDailyPlanRow('plan-1', 'Done');

      expect(mockUpdate.mock.calls[1][0]).toEqual({
        page_id: 'goal-1',
        properties: { Status: { status: { name: 'In progress' } } },
      });
    });
  });
});
