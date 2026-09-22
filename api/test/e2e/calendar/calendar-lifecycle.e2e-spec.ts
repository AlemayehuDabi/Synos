import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CalendarTombstoneRetentionCron } from '../../../src/calendar/calendar-tombstone-retention.cron.js';
import { PrismaService } from '../../../src/lib/prisma.js';
import { ReviewGenerationService } from '../../../src/reviews/review-generation.service.js';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser, waitForExportReady } from '../helpers.js';

describe('Calendar: Today/Review integration, export, deletion cascade and retention (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let prisma: PrismaService;
  let userA: TestUser;
  let userB: TestUser;

  const create = (user: TestUser, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/v1/calendar/events').set(bearer(user.token)).send(body).expect(201);

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
    prisma = app.get(PrismaService);
    userA = await signUpAndVerify(app, sentMails);
    userB = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  it('shows today\'s events, ordered by start, under the calendar section of GET /today', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await create(userA, { title: 'Later', startsAt: `${today}T15:00:00Z`, endsAt: `${today}T16:00:00Z`, timezone: 'UTC' });
    await create(userA, { title: 'Earlier', startsAt: `${today}T08:00:00Z`, endsAt: `${today}T08:30:00Z`, timezone: 'UTC' });
    // Yesterday and tomorrow must not show up today.
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await create(userA, { title: 'Yesterday', startsAt: `${yesterday}T08:00:00Z`, endsAt: `${yesterday}T08:30:00Z`, timezone: 'UTC' });

    const res = await request(app.getHttpServer()).get('/api/v1/today').set(bearer(userA.token)).expect(200);
    const section = res.body.sections.find((s: { domain: string }) => s.domain === 'calendar');
    expect(section.status).toBe('ok');
    expect(section.summary.count).toBeGreaterThanOrEqual(2);
    const titles = section.items.map((i: { title: string }) => i.title);
    expect(titles.indexOf('Earlier')).toBeLessThan(titles.indexOf('Later'));
    expect(titles).not.toContain('Yesterday');
  });

  it('feeds events count and scheduled hours into the weekly review\'s calendar section', async () => {
    // A Monday-Sunday week safely in the past relative to "now", so the review always covers it.
    await prisma.calendarEvent.create({
      data: { userId: userB.userId, title: 'Planning', startsAt: new Date('2026-01-05T09:00:00Z'), endsAt: new Date('2026-01-05T11:00:00Z'), timezone: 'UTC' },
    });
    await prisma.calendarEvent.create({
      data: { userId: userB.userId, title: 'Review', startsAt: new Date('2026-01-07T09:00:00Z'), endsAt: new Date('2026-01-07T10:30:00Z'), timezone: 'UTC' },
    });

    const generation = app.get(ReviewGenerationService);
    await generation.generateForUser(userB.userId, new Date('2026-01-12T02:30:00Z'));

    const res = await request(app.getHttpServer()).get('/api/v1/reviews').query({ type: 'weekly', limit: '5' }).set(bearer(userB.token)).expect(200);
    const review = res.body.items.find((r: { periodStart: string }) => r.periodStart === '2026-01-05');
    expect(review).toBeTruthy();
    const section = review.sections.find((s: { domain: string }) => s.domain === 'calendar');
    expect(section).toMatchObject({ status: 'ok', metrics: { eventsCount: 2, scheduledHours: 3.5 } });
    expect(section.highlights).toEqual(['2 events on your calendar']);
  });

  it('includes calendar events and exceptions in a data export, scoped to the exporting user', async () => {
    const single = await create(userA, { title: 'Exported single', startsAt: '2026-09-22T09:00:00Z', endsAt: '2026-09-22T10:00:00Z', timezone: 'UTC' });
    const series = await create(userA, { title: 'Exported series', startsAt: '2026-09-07T09:00:00Z', endsAt: '2026-09-07T09:30:00Z', timezone: 'UTC', rrule: 'FREQ=WEEKLY;BYDAY=MO' });
    await request(app.getHttpServer())
      .patch(`/api/v1/calendar/events/${series.body.id}`)
      .set(bearer(userA.token))
      .send({ scope: 'this', occurrenceStart: '2026-09-14T09:00:00Z', title: 'Special' })
      .expect(200);
    await create(userB, { title: 'Not exported', startsAt: '2026-09-22T09:00:00Z', endsAt: '2026-09-22T10:00:00Z', timezone: 'UTC' });

    const job = await request(app.getHttpServer()).post('/api/v1/me/export').set(bearer(userA.token)).expect(201);
    const ready = await waitForExportReady(app, userA.token, job.body.id);
    const data = JSON.parse(ready.text);

    const eventIds = data.calendarEvents.map((e: { id: string }) => e.id);
    expect(eventIds).toEqual(expect.arrayContaining([single.body.id, series.body.id]));
    expect(data.calendarEvents.every((e: { title: string }) => e.title !== 'Not exported')).toBe(true);

    expect(data.calendarEventExceptions).toHaveLength(1);
    expect(data.calendarEventExceptions[0]).toMatchObject({ eventId: series.body.id, title: 'Special' });
  });

  it('cascades event and exception deletion when the account is deleted, without touching another user\'s data', async () => {
    const toDelete = await signUpAndVerify(app, sentMails);
    const series = await create(toDelete, { title: 'Doomed', startsAt: '2026-09-07T09:00:00Z', endsAt: '2026-09-07T09:30:00Z', timezone: 'UTC', rrule: 'FREQ=WEEKLY;BYDAY=MO' });
    await request(app.getHttpServer())
      .patch(`/api/v1/calendar/events/${series.body.id}`)
      .set(bearer(toDelete.token))
      .send({ scope: 'this', occurrenceStart: '2026-09-14T09:00:00Z', title: 'Special' })
      .expect(200);

    const bystanderEventsBefore = await prisma.calendarEvent.count({ where: { userId: userA.userId } });

    await request(app.getHttpServer()).delete('/api/v1/me').set(bearer(toDelete.token)).send({ password: toDelete.password }).expect(204);

    expect(await prisma.calendarEvent.count({ where: { userId: toDelete.userId } })).toBe(0);
    expect(await prisma.calendarEventException.count({ where: { eventId: series.body.id } })).toBe(0);
    expect(await prisma.calendarEvent.count({ where: { userId: userA.userId } })).toBe(bystanderEventsBefore);
  });

  it('purges tombstoned events past the retention window, and only those', async () => {
    const now = Date.now();
    const make = (title: string, deletedDaysAgo: number | null) =>
      prisma.calendarEvent.create({
        data: {
          userId: userA.userId,
          title,
          startsAt: new Date('2020-01-01T09:00:00Z'),
          endsAt: new Date('2020-01-01T10:00:00Z'),
          timezone: 'UTC',
          deletedAt: deletedDaysAgo === null ? null : new Date(now - deletedDaysAgo * 86_400_000),
        },
      });
    const expired = await make('deleted 200d ago', 200);
    const kept = [await make('deleted 89d ago', 89), await make('never deleted', null)];

    await app.get(CalendarTombstoneRetentionCron).purge();

    const remaining = new Set((await prisma.calendarEvent.findMany({ where: { userId: userA.userId } })).map((e) => e.id));
    expect(remaining.has(expired.id)).toBe(false);
    for (const event of kept) expect(remaining.has(event.id), event.title).toBe(true);
  });
});
