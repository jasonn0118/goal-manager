import { CalendarService } from './calendar.service';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
      })),
    },
    calendar: jest.fn().mockReturnValue({
      freebusy: {
        query: jest.fn().mockResolvedValue({ data: { calendars: { primary: { busy: [] } } } }),
      },
      events: {
        insert: jest.fn().mockResolvedValue({}),
        list: jest.fn().mockResolvedValue({ data: { items: [] } }),
        get: jest.fn().mockResolvedValue({
          data: { start: { timeZone: 'UTC' }, end: { timeZone: 'UTC' } },
        }),
        patch: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
    }),
  },
}));

function makeConfigService(withRefreshToken = true): ConfigService {
  return {
    get: jest.fn().mockImplementation((key: string) => {
      const env: Record<string, string | undefined> = {
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
        GOOGLE_REFRESH_TOKEN: withRefreshToken ? 'refresh-token' : undefined,
      };
      return env[key];
    }),
  } as unknown as ConfigService;
}

describe('CalendarService', () => {
  let service: CalendarService;
  let calendarApi: any;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CalendarService(makeConfigService());
    calendarApi = (google.calendar as jest.Mock).mock.results[0].value;
  });

  describe('toDateTime (via getBusySlots timeMin/timeMax)', () => {
    it('interprets work hours as America/Vancouver time, not server local time', async () => {
      // January 15 — Vancouver is PST (UTC-8), so 09:00 Vancouver = 17:00 UTC
      calendarApi.freebusy.query.mockResolvedValue({
        data: { calendars: { primary: { busy: [] } } },
      });
      await service.getBusySlots('2024-01-15', '09:00', '17:00');
      const { timeMin, timeMax } = calendarApi.freebusy.query.mock.calls[0][0].requestBody;
      expect(timeMin).toBe('2024-01-15T17:00:00.000Z'); // 09:00 PST = 17:00 UTC
      expect(timeMax).toBe('2024-01-16T01:00:00.000Z'); // 17:00 PST = 01:00 UTC next day
    });

    it('handles summer time (PDT = UTC-7) correctly', async () => {
      // July 15 — Vancouver is PDT (UTC-7), so 09:00 Vancouver = 16:00 UTC
      calendarApi.freebusy.query.mockResolvedValue({
        data: { calendars: { primary: { busy: [] } } },
      });
      await service.getBusySlots('2024-07-15', '09:00', '17:00');
      const { timeMin, timeMax } = calendarApi.freebusy.query.mock.calls[0][0].requestBody;
      expect(timeMin).toBe('2024-07-15T16:00:00.000Z'); // 09:00 PDT = 16:00 UTC
      expect(timeMax).toBe('2024-07-16T00:00:00.000Z'); // 17:00 PDT = 00:00 UTC next day
    });
  });

  describe('findFreeSlots (pure logic)', () => {
    it('returns one slot covering the full needed duration when no busy periods exist', () => {
      const slots = service.findFreeSlots([], '09:00', '17:00', '2024-01-15', 4);
      const totalMs = slots.reduce((sum, s) => sum + s.end.getTime() - s.start.getTime(), 0);
      expect(totalMs).toBe(4 * 3_600_000);
    });

    it('returns two slots that skip a busy period in the middle', () => {
      const busy = [
        { start: new Date('2024-01-15T10:00:00'), end: new Date('2024-01-15T11:00:00') },
      ];
      const slots = service.findFreeSlots(busy, '09:00', '17:00', '2024-01-15', 2);
      const totalMs = slots.reduce((sum, s) => sum + s.end.getTime() - s.start.getTime(), 0);
      expect(totalMs).toBe(2 * 3_600_000);
      // First gap is 09:00–10:00 (1h) — slot should start at 09:00
      expect(slots[0].start.getHours()).toBe(9);
    });

    it('returns no slots when the entire work day is busy', () => {
      const busy = [
        { start: new Date('2024-01-15T09:00:00'), end: new Date('2024-01-15T17:00:00') },
      ];
      const slots = service.findFreeSlots(busy, '09:00', '17:00', '2024-01-15', 4);
      expect(slots).toHaveLength(0);
    });

    it('caps total scheduled time at the available free time', () => {
      const slots = service.findFreeSlots([], '09:00', '10:00', '2024-01-15', 8);
      const totalMs = slots.reduce((sum, s) => sum + s.end.getTime() - s.start.getTime(), 0);
      expect(totalMs).toBe(1 * 3_600_000); // only 1h available
    });
  });

  describe('getBusySlots', () => {
    it('returns mapped Interval objects from the freebusy API', async () => {
      calendarApi.freebusy.query.mockResolvedValue({
        data: {
          calendars: {
            primary: {
              busy: [{ start: '2024-01-15T10:00:00Z', end: '2024-01-15T11:00:00Z' }],
            },
          },
        },
      });
      const slots = await service.getBusySlots('2024-01-15', '09:00', '17:00');
      expect(slots).toHaveLength(1);
      expect(slots[0].start).toBeInstanceOf(Date);
      expect(slots[0].end).toBeInstanceOf(Date);
    });

    it('returns an empty array when the API call throws', async () => {
      calendarApi.freebusy.query.mockRejectedValue(new Error('API error'));
      const slots = await service.getBusySlots('2024-01-15', '09:00', '17:00');
      expect(slots).toEqual([]);
    });
  });

  describe('createEvent', () => {
    it('inserts an event with a 🎯 prefix in the summary', async () => {
      await service.createEvent('My Task', 'Details', new Date('2024-01-15T09:00:00Z'), new Date('2024-01-15T11:00:00Z'));
      expect(calendarApi.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({ summary: '🎯 My Task' }),
        }),
      );
    });

    it('sets colorId when a known color name is provided', async () => {
      await service.createEvent('Task', '', new Date(), new Date(), 'tomato');
      const body = calendarApi.events.insert.mock.calls[0][0].requestBody;
      expect(body.colorId).toBe('11');
    });

    it('omits colorId when color is undefined', async () => {
      await service.createEvent('Task', '', new Date(), new Date());
      const body = calendarApi.events.insert.mock.calls[0][0].requestBody;
      expect(body.colorId).toBeUndefined();
    });

    it.each([
      ['banana', '5'],
      ['peacock', '7'],
      ['grape', '3'],
      ['blueberry', '9'],
    ])('resolves color "%s" to colorId "%s"', async (colorName, expectedId) => {
      await service.createEvent('Task', '', new Date(), new Date(), colorName);
      const body = calendarApi.events.insert.mock.calls[0][0].requestBody;
      expect(body.colorId).toBe(expectedId);
    });
  });

  describe('createEventFromStrings', () => {
    it('parses ISO strings and creates an event with the correct color', async () => {
      await service.createEventFromStrings(
        'Meeting', '2024-01-15T10:00:00', '2024-01-15T11:00:00', 'Notes', 'banana',
      );
      expect(calendarApi.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            summary: '🎯 Meeting',
            description: 'Notes',
            colorId: '5',
          }),
        }),
      );
    });
  });

  describe('getUpcomingEvents', () => {
    it('returns mapped event objects', async () => {
      calendarApi.events.list.mockResolvedValue({
        data: {
          items: [
            {
              id: 'evt-1',
              summary: 'Team Standup',
              start: { dateTime: '2024-01-15T09:00:00Z' },
              end: { dateTime: '2024-01-15T09:30:00Z' },
              description: 'Daily sync',
            },
          ],
        },
      });
      const events = await service.getUpcomingEvents('2024-01-15', '2024-02-14');
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        id: 'evt-1',
        title: 'Team Standup',
        start: '2024-01-15T09:00:00Z',
        end: '2024-01-15T09:30:00Z',
        description: 'Daily sync',
      });
    });

    it('returns empty array when no refresh token is configured', async () => {
      const noTokenService = new CalendarService(makeConfigService(false));
      const events = await noTokenService.getUpcomingEvents('2024-01-15', '2024-02-14');
      expect(events).toEqual([]);
    });

    it('returns empty array on API error', async () => {
      calendarApi.events.list.mockRejectedValue(new Error('Network error'));
      const events = await service.getUpcomingEvents('2024-01-15', '2024-02-14');
      expect(events).toEqual([]);
    });

    it('uses "(no title)" for events without a summary', async () => {
      calendarApi.events.list.mockResolvedValue({
        data: { items: [{ id: 'e1', start: { date: '2024-01-15' }, end: { date: '2024-01-15' } }] },
      });
      const events = await service.getUpcomingEvents('2024-01-15', '2024-02-14');
      expect(events[0].title).toBe('(no title)');
    });
  });

  describe('updateEvent', () => {
    it('patches only the provided fields', async () => {
      await service.updateEvent('evt-1', { title: 'New Title', color: 'grape' });
      const patch = calendarApi.events.patch.mock.calls[0][0].requestBody;
      expect(patch.summary).toBe('New Title');
      expect(patch.colorId).toBe('3');
      expect(patch.start).toBeUndefined();
      expect(patch.end).toBeUndefined();
    });

    it('patches start and end datetimes when provided', async () => {
      await service.updateEvent('evt-1', { start: '2024-01-15T10:00:00Z', end: '2024-01-15T11:00:00Z' });
      const patch = calendarApi.events.patch.mock.calls[0][0].requestBody;
      expect(patch.start.dateTime).toBe('2024-01-15T10:00:00Z');
      expect(patch.end.dateTime).toBe('2024-01-15T11:00:00Z');
    });
  });

  describe('deleteEvent', () => {
    it('calls events.delete with the correct eventId and calendarId', async () => {
      await service.deleteEvent('evt-1');
      expect(calendarApi.events.delete).toHaveBeenCalledWith(
        expect.objectContaining({ calendarId: 'primary', eventId: 'evt-1' }),
      );
    });
  });

  describe('scheduleDailyPlan', () => {
    it('skips all calendar calls when no refresh token is configured', async () => {
      const noTokenService = new CalendarService(makeConfigService(false));
      await noTokenService.scheduleDailyPlan(
        'Goal', [{ date: '2024-01-15', plannedHours: 2, tasks: 'Work' }], '09:00', '17:00',
      );
      expect(calendarApi.events.insert).not.toHaveBeenCalled();
    });

    it('creates calendar events for each free slot', async () => {
      calendarApi.freebusy.query.mockResolvedValue({
        data: { calendars: { primary: { busy: [] } } },
      });
      await service.scheduleDailyPlan(
        'My Project',
        [{ date: '2024-01-15', plannedHours: 2, tasks: 'Build feature' }],
        '09:00', '17:00',
      );
      expect(calendarApi.events.insert).toHaveBeenCalled();
    });
  });
});
