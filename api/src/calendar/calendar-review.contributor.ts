import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../lib/prisma.js';
import { ReviewContributor, type ReviewContext, type ReviewContribution } from '../reviews/review-contributor.js';
import { expandUserOccurrences, fetchOverlappingEvents } from './calendar-occurrences.js';

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

@Injectable()
@ReviewContributor('calendar')
export class CalendarReviewContributor implements ReviewContributor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async collect({ userId, periodStart, periodEnd }: ReviewContext): Promise<ReviewContribution> {
    const budget = { remaining: this.config.get<number>('CALENDAR_MAX_OCCURRENCES_PER_QUERY', 2000) };
    const { events, exceptionsByEvent } = await fetchOverlappingEvents(this.prisma, userId, periodStart, periodEnd);
    const occurrences = expandUserOccurrences(events, exceptionsByEvent, periodStart, periodEnd, budget);

    const scheduledHours = occurrences
      .filter(({ event }) => !event.allDay)
      .reduce((sum, { occurrence }) => sum + (occurrence.endsAt.getTime() - occurrence.startsAt.getTime()) / 3_600_000, 0);

    return {
      metrics: { eventsCount: occurrences.length, scheduledHours: Math.round(scheduledHours * 10) / 10 },
      highlights: occurrences.length > 0 ? [`${plural(occurrences.length, 'event')} on your calendar`] : [],
    };
  }
}
