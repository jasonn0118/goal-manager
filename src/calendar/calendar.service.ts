import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

interface Interval {
  start: Date;
  end: Date;
}

const COLOR_MAP: Record<string, string> = {
  lavender: '1', sage: '2', grape: '3', flamingo: '4',
  banana: '5', tangerine: '6', peacock: '7', graphite: '8',
  blueberry: '9', basil: '10', tomato: '11',
  // aliases
  purple: '3', pink: '4', orange: '6', teal: '7',
  gray: '8', grey: '8', blue: '9', green: '10', red: '11',
};

function resolveColorId(color?: string): string | undefined {
  if (!color) return undefined;
  return COLOR_MAP[color.toLowerCase()];
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);
  private readonly calendar;

  constructor(private configService: ConfigService) {
    const auth = new google.auth.OAuth2(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
    );
    auth.setCredentials({
      refresh_token: this.configService.get<string>('GOOGLE_REFRESH_TOKEN'),
    });
    this.calendar = google.calendar({ version: 'v3', auth });
  }

  private toDateTime(date: string, time: string): Date {
    const timeZone = 'America/Vancouver';
    const naiveUtc = new Date(`${date}T${time}:00.000Z`);
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
    const parts = Object.fromEntries(
      fmt.formatToParts(naiveUtc)
        .filter(p => p.type !== 'literal')
        .map(p => [p.type, p.value]),
    );
    const vanRead = new Date(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000Z`,
    );
    return new Date(naiveUtc.getTime() + (naiveUtc.getTime() - vanRead.getTime()));
  }

  private toTimeString(date: Date): string {
    return date.toISOString();
  }

  async getBusySlots(date: string, workStart: string, workEnd: string): Promise<Interval[]> {
    const timeMin = this.toDateTime(date, workStart).toISOString();
    const timeMax = this.toDateTime(date, workEnd).toISOString();

    try {
      const res = await this.calendar.freebusy.query({
        requestBody: {
          timeMin,
          timeMax,
          items: [{ id: 'primary' }],
        },
      });

      const busy = res.data.calendars?.primary?.busy ?? [];
      return busy.map((b: any) => ({ start: new Date(b.start), end: new Date(b.end) }));
    } catch (err) {
      this.logger.error(`Failed to fetch busy slots for ${date}`, err);
      return [];
    }
  }

  findFreeSlots(busySlots: Interval[], workStart: string, workEnd: string, date: string, neededHours: number): Interval[] {
    const dayStart = this.toDateTime(date, workStart);
    const dayEnd = this.toDateTime(date, workEnd);
    const neededMs = neededHours * 60 * 60 * 1000;

    // Build sorted list of busy periods clipped to work hours
    const busy = busySlots
      .map((b) => ({ start: b.start < dayStart ? dayStart : b.start, end: b.end > dayEnd ? dayEnd : b.end }))
      .filter((b) => b.start < b.end)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    const freeSlots: Interval[] = [];
    let remaining = neededMs;
    let cursor = dayStart;

    for (const block of busy) {
      if (remaining <= 0) break;
      if (cursor < block.start) {
        const available = Math.min(block.start.getTime() - cursor.getTime(), remaining);
        freeSlots.push({ start: cursor, end: new Date(cursor.getTime() + available) });
        remaining -= available;
      }
      cursor = block.end > cursor ? block.end : cursor;
    }

    // Fill remaining from cursor to day end
    if (remaining > 0 && cursor < dayEnd) {
      const available = Math.min(dayEnd.getTime() - cursor.getTime(), remaining);
      freeSlots.push({ start: cursor, end: new Date(cursor.getTime() + available) });
    }

    return freeSlots;
  }

  async createEvent(title: string, description: string, start: Date, end: Date, color?: string): Promise<void> {
    try {
      const body: any = {
        summary: `🎯 ${title}`,
        description,
        start: { dateTime: this.toTimeString(start) },
        end: { dateTime: this.toTimeString(end) },
      };
      const colorId = resolveColorId(color);
      if (colorId) body.colorId = colorId;
      await this.calendar.events.insert({ calendarId: 'primary', requestBody: body });
    } catch (err) {
      this.logger.error(`Failed to create calendar event "${title}"`, err);
    }
  }

  async createEventFromStrings(title: string, start: string, end: string, description?: string, color?: string): Promise<void> {
    await this.createEvent(title, description ?? '', new Date(start), new Date(end), color);
  }

  async getUpcomingEvents(startDate: string, endDate: string): Promise<{ id: string; title: string; start: string; end: string; description?: string }[]> {
    if (!this.configService.get<string>('GOOGLE_REFRESH_TOKEN')) return [];
    try {
      const res = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date(`${startDate}T00:00:00`).toISOString(),
        timeMax: new Date(`${endDate}T23:59:59`).toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 100,
      });
      return (res.data.items ?? []).map((e: any) => ({
        id: e.id,
        title: e.summary ?? '(no title)',
        start: e.start?.dateTime ?? e.start?.date ?? '',
        end: e.end?.dateTime ?? e.end?.date ?? '',
        description: e.description,
      }));
    } catch (err) {
      this.logger.error('Failed to fetch upcoming events', err);
      return [];
    }
  }

  async updateEvent(eventId: string, fields: { title?: string; start?: string; end?: string; description?: string; color?: string }): Promise<void> {
    try {
      const existing = await this.calendar.events.get({ calendarId: 'primary', eventId });
      const patch: any = {};
      if (fields.title !== undefined) patch.summary = fields.title;
      if (fields.description !== undefined) patch.description = fields.description;
      if (fields.start !== undefined) patch.start = { dateTime: fields.start, timeZone: existing.data.start?.timeZone };
      if (fields.end !== undefined) patch.end = { dateTime: fields.end, timeZone: existing.data.end?.timeZone };
      const colorId = resolveColorId(fields.color);
      if (colorId) patch.colorId = colorId;
      await this.calendar.events.patch({ calendarId: 'primary', eventId, requestBody: patch });
    } catch (err) {
      this.logger.error(`Failed to update calendar event ${eventId}`, err);
    }
  }

  async deleteEvent(eventId: string): Promise<void> {
    try {
      await this.calendar.events.delete({ calendarId: 'primary', eventId });
    } catch (err) {
      this.logger.error(`Failed to delete calendar event ${eventId}`, err);
    }
  }

  async scheduleDailyPlan(
    goalTitle: string,
    days: { date: string; plannedHours: number; tasks: string }[],
    workStart: string,
    workEnd: string,
  ): Promise<void> {
    if (!this.configService.get<string>('GOOGLE_REFRESH_TOKEN')) {
      this.logger.warn('GOOGLE_REFRESH_TOKEN not set — skipping calendar scheduling');
      return;
    }

    let carryoverHours = 0;
    let carryoverTasks = '';

    for (const day of days) {
      const totalHours = day.plannedHours + carryoverHours;
      const tasks = carryoverTasks ? `[Carry-over] ${carryoverTasks}\n${day.tasks}` : day.tasks;

      const busySlots = await this.getBusySlots(day.date, workStart, workEnd);
      const freeSlots = this.findFreeSlots(busySlots, workStart, workEnd, day.date, totalHours);

      const scheduledMs = freeSlots.reduce((sum, s) => sum + (s.end.getTime() - s.start.getTime()), 0);
      const scheduledHours = scheduledMs / 3600000;

      for (const slot of freeSlots) {
        await this.createEvent(goalTitle, tasks, slot.start, slot.end);
      }

      carryoverHours = Math.max(0, totalHours - scheduledHours);
      carryoverTasks = carryoverHours > 0 ? tasks : '';
    }

    if (carryoverHours > 0) {
      this.logger.warn(`${carryoverHours.toFixed(1)}h of "${goalTitle}" could not be scheduled — no free slots remaining`);
    }
  }
}
