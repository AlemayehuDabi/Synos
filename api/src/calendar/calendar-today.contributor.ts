import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { addDaysToDate, startOfLocalDay } from '../common/time/timezone.js';
import { PrismaService } from '../lib/prisma.js';
import { TodayContributor, type TodayContext, type TodayContribution } from '../today/today-contributor.js';
import { expandUserOccurrences, fetchOverlappingEvents } from './calendar-occurrences.js';

@Injectable()
@TodayContributor('calendar')
export class CalendarTodayContributor implements TodayContributor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async collect({ userId, date, timezone }: TodayContext): Promise<TodayContribution> {
    const from = startOfLocalDay(date, timezone);
    const to = startOfLocalDay(addDaysToDate(date, 1), timezone);
    const budget = { remaining: this.config.get<number>('CALENDAR_MAX_OCCURRENCES_PER_QUERY', 2000) };

    const { events, exceptionsByEvent } = await fetchOverlappingEvents(this.prisma, userId, from, to);
    const occurrences = expandUserOccurrences(events, exceptionsByEvent, from, to, budget).sort(
      (a, b) => a.occurrence.startsAt.getTime() - b.occurrence.startsAt.getTime(),
    );

    return {
      summary: { count: occurrences.length },
      items: occurrences.map(({ event, occurrence }) => ({
        id: `${event.id}:${occurrence.originalStart.getTime()}`,
        title: occurrence.title,
        allDay: event.allDay,
        startsAt: occurrence.startsAt.toISOString(),
        endsAt: occurrence.endsAt.toISOString(),
        location: occurrence.location,
      })),
    };
  }
}
