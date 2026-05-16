import { GoalsService } from './goals.service';
import { NotionService } from '../notion/notion.service';
import { CalendarService } from '../calendar/calendar.service';
import { Goal } from './goals.service';

const mockGoal: Goal = {
  id: 'goal-1',
  notionPageId: 'goal-1',
  title: 'Build a feature',
  status: 'not_started',
  priority: 'high',
  horizon: 'sprint',
  progress: 0,
};

describe('GoalsService', () => {
  let service: GoalsService;
  let notionService: jest.Mocked<NotionService>;
  let calendarService: jest.Mocked<CalendarService>;

  beforeEach(() => {
    notionService = {
      getAllGoals: jest.fn().mockResolvedValue([mockGoal]),
      getActiveGoals: jest.fn().mockResolvedValue([mockGoal]),
      getGoalsByHorizon: jest.fn().mockResolvedValue([mockGoal]),
      createGoal: jest.fn().mockResolvedValue(mockGoal),
      updateGoal: jest.fn().mockResolvedValue(mockGoal),
      markGoalDone: jest.fn().mockResolvedValue({ ...mockGoal, status: 'done' }),
      archiveGoal: jest.fn().mockResolvedValue(undefined),
      createDailyPlanRows: jest.fn().mockResolvedValue(undefined),
      getDailyPlansForDate: jest.fn().mockResolvedValue([]),
      getUpcomingDailyPlans: jest.fn().mockResolvedValue([]),
      updateDailyPlanRow: jest.fn().mockResolvedValue(undefined),
      deleteDailyPlanRow: jest.fn().mockResolvedValue(undefined),
      addSessionLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotionService>;

    calendarService = {
      scheduleDailyPlan: jest.fn().mockResolvedValue(undefined),
      createEventFromStrings: jest.fn().mockResolvedValue(undefined),
      getUpcomingEvents: jest.fn().mockResolvedValue([]),
      updateEvent: jest.fn().mockResolvedValue(undefined),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CalendarService>;

    service = new GoalsService(notionService, calendarService);
  });

  it('getAllGoals delegates to NotionService', async () => {
    const result = await service.getAllGoals();
    expect(result).toEqual([mockGoal]);
    expect(notionService.getAllGoals).toHaveBeenCalledTimes(1);
  });

  it('getActiveGoals delegates to NotionService', async () => {
    const result = await service.getActiveGoals();
    expect(result).toEqual([mockGoal]);
    expect(notionService.getActiveGoals).toHaveBeenCalledTimes(1);
  });

  it('createGoal delegates to NotionService with the DTO', async () => {
    const dto = { title: 'New Goal', status: 'not_started' as const, priority: 'medium' as const };
    const result = await service.createGoal(dto);
    expect(result).toEqual(mockGoal);
    expect(notionService.createGoal).toHaveBeenCalledWith(dto);
  });

  it('updateGoal delegates to NotionService with pageId and fields', async () => {
    await service.updateGoal('goal-1', { status: 'in_progress' });
    expect(notionService.updateGoal).toHaveBeenCalledWith('goal-1', { status: 'in_progress' });
  });

  it('archiveGoal delegates to NotionService', async () => {
    await service.archiveGoal('goal-1');
    expect(notionService.archiveGoal).toHaveBeenCalledWith('goal-1');
  });

  describe('createDailyPlan', () => {
    const days = [{ date: '2024-01-01', plannedHours: 2, tasks: 'Task description' }];

    it('creates Notion rows and schedules calendar events', async () => {
      await service.createDailyPlan('goal-1', days, '09:00', '17:00');
      expect(notionService.createDailyPlanRows).toHaveBeenCalledWith('goal-1', 'Build a feature', days);
      expect(calendarService.scheduleDailyPlan).toHaveBeenCalledWith('Build a feature', days, '09:00', '17:00');
    });

    it('uses "Project" as fallback title when goal is not found', async () => {
      notionService.getAllGoals.mockResolvedValue([]);
      await service.createDailyPlan('unknown-id', days, '09:00', '17:00');
      expect(notionService.createDailyPlanRows).toHaveBeenCalledWith('unknown-id', 'Project', days);
      expect(calendarService.scheduleDailyPlan).toHaveBeenCalledWith('Project', days, '09:00', '17:00');
    });
  });

  describe('findGoalByTitle', () => {
    it('returns a goal on partial case-insensitive title match', async () => {
      const result = await service.findGoalByTitle('build');
      expect(result).toEqual(mockGoal);
    });

    it('returns undefined when no title matches', async () => {
      const result = await service.findGoalByTitle('nonexistent xyz');
      expect(result).toBeUndefined();
    });
  });

  it('updateDailyPlanRow delegates to NotionService', async () => {
    await service.updateDailyPlanRow('plan-1', 'Done');
    expect(notionService.updateDailyPlanRow).toHaveBeenCalledWith('plan-1', 'Done');
  });

  it('deleteDailyPlanRow delegates to NotionService', async () => {
    await service.deleteDailyPlanRow('plan-1');
    expect(notionService.deleteDailyPlanRow).toHaveBeenCalledWith('plan-1');
  });

  it('createCalendarEvent delegates to CalendarService', async () => {
    await service.createCalendarEvent('Meeting', '2024-01-15T10:00:00', '2024-01-15T11:00:00', 'Notes', 'banana');
    expect(calendarService.createEventFromStrings).toHaveBeenCalledWith(
      'Meeting', '2024-01-15T10:00:00', '2024-01-15T11:00:00', 'Notes', 'banana',
    );
  });

  it('getUpcomingCalendarEvents delegates to CalendarService', async () => {
    await service.getUpcomingCalendarEvents('2024-01-01', '2024-03-01');
    expect(calendarService.getUpcomingEvents).toHaveBeenCalledWith('2024-01-01', '2024-03-01');
  });

  it('updateCalendarEvent delegates to CalendarService', async () => {
    await service.updateCalendarEvent('evt-1', { title: 'New Name' });
    expect(calendarService.updateEvent).toHaveBeenCalledWith('evt-1', { title: 'New Name' });
  });

  it('deleteCalendarEvent delegates to CalendarService', async () => {
    await service.deleteCalendarEvent('evt-1');
    expect(calendarService.deleteEvent).toHaveBeenCalledWith('evt-1');
  });
});
