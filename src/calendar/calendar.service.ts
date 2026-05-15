import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

interface Interval {
  start: Date;
  end: Date;
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
    return new Date(`${date}T${time}:00`);
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

  async createEvent(title: string, description: string, start: Date, end: Date): Promise<void> {
    try {
      await this.calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: `🎯 ${title}`,
          description,
          start: { dateTime: this.toTimeString(start) },
          end: { dateTime: this.toTimeString(end) },
        },
      });
    } catch (err) {
      this.logger.error(`Failed to create calendar event "${title}"`, err);
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
