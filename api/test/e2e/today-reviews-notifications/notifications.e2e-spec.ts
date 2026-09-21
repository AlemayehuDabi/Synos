import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../src/lib/prisma.js';
import { NotificationsFacade, type NotifyInput } from '../../../src/notifications/notifications.facade.js';
import { PUSH_PROVIDER } from '../../../src/notifications/push/push-provider.js';
import { FakePushProvider } from '../../sandbox/fake-push-provider.js';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser } from '../helpers.js';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let prisma: PrismaService;
  let facade: NotificationsFacade;
  let userA: TestUser;
  let userB: TestUser;

  const notify = (user: TestUser, overrides: Partial<NotifyInput> = {}) =>
    facade.notify({ userId: user.userId, category: 'system', title: 'Title', body: 'Body', ...overrides });

  const list = (user: TestUser, query: Record<string, string> = {}) =>
    request(app.getHttpServer()).get('/api/v1/notifications').query(query).set(bearer(user.token));
  const unread = async (user: TestUser) =>
    (await request(app.getHttpServer()).get('/api/v1/notifications/unread-count').set(bearer(user.token)).expect(200)).body.unread as number;
  const markRead = (user: TestUser, id: string, headers: Record<string, string> = {}) =>
    request(app.getHttpServer()).post(`/api/v1/notifications/${id}/read`).set(bearer(user.token)).set(headers);
  const readAll = (user: TestUser, headers: Record<string, string> = {}) =>
    request(app.getHttpServer()).post('/api/v1/notifications/read-all').set(bearer(user.token)).set(headers);

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp([], (builder) => builder.overrideProvider(PUSH_PROVIDER).useValue(new FakePushProvider())));
    prisma = app.get(PrismaService);
    facade = app.get(NotificationsFacade);
    userA = await signUpAndVerify(app, sentMails);
    userB = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('storing and listing', () => {
    it('lists newest first, with only the fields a client needs', async () => {
      const first = await notify(userA, { category: 'bill', domain: 'finances', title: 'Rent due', body: 'Friday', data: { billId: 'b1' } });
      await pause(5);
      const second = await notify(userA, { category: 'system', title: 'Welcome', body: 'Hello' });
      expect(first).toMatchObject({ created: true });
      expect(second).toMatchObject({ created: true });

      const { items, nextCursor } = (await list(userA).expect(200)).body;
      expect(nextCursor).toBeNull();
      expect(items.map((n: { id: string }) => n.id)).toEqual([second.notification!.id, first.notification!.id]);

      expect(Object.keys(items[1]).sort()).toEqual(['body', 'category', 'createdAt', 'data', 'domain', 'id', 'readAt', 'title']);
      expect(items[1]).toMatchObject({
        category: 'bill',
        domain: 'finances',
        title: 'Rent due',
        body: 'Friday',
        data: { billId: 'b1' },
        readAt: null,
      });
      expect(items[0]).toMatchObject({ category: 'system', domain: null, data: {}, readAt: null });
    });

    it('does not repeat a notification whose dedupe key it has already seen', async () => {
      const first = await notify(userA, { category: 'reminder', title: 'Original', dedupeKey: 'reminder:1' });
      const repeat = await notify(userA, { category: 'reminder', title: 'Different words', dedupeKey: 'reminder:1' });

      expect(first.created).toBe(true);
      expect(repeat).toMatchObject({ created: false, pushQueued: false });
      expect(repeat.notification!.id).toBe(first.notification!.id);

      const matching = (await list(userA).expect(200)).body.items.filter((n: { category: string }) => n.category === 'reminder');
      expect(matching).toHaveLength(1);
      expect(matching[0].title).toBe('Original');
    });

    it('scopes a dedupe key to the user, and lets notifications without one repeat', async () => {
      expect((await notify(userB, { category: 'reminder', dedupeKey: 'reminder:1' })).created).toBe(true);

      await notify(userA, { title: 'No key' });
      await notify(userA, { title: 'No key' });
      const noKey = (await list(userA, { limit: '100' }).expect(200)).body.items.filter((n: { title: string }) => n.title === 'No key');
      expect(noKey).toHaveLength(2);
    });

    it('stores exactly one when the same dedupe key arrives twice at once', async () => {
      const results = await Promise.all([
        notify(userA, { category: 'bill', title: 'Race', dedupeKey: 'race:1' }),
        notify(userA, { category: 'bill', title: 'Race', dedupeKey: 'race:1' }),
      ]);
      expect(results.filter((result) => result.created)).toHaveLength(1);
      expect(results[0].notification!.id).toBe(results[1].notification!.id);
      expect(await prisma.notification.count({ where: { userId: userA.userId, dedupeKey: 'race:1' } })).toBe(1);
    });

    it('pages through notifications that share a timestamp without skipping or repeating any', async () => {
      const sameInstant = new Date('2020-01-01T00:00:00.000Z');
      await prisma.notification.createMany({
        data: Array.from({ length: 5 }, (_, index) => ({
          userId: userA.userId,
          category: 'system' as const,
          title: `Old ${index}`,
          body: 'Body',
          createdAt: sameInstant,
        })),
      });

      const everything = (await list(userA, { limit: '100' }).expect(200)).body.items as { id: string; createdAt: string }[];
      expect(everything.length).toBeGreaterThanOrEqual(5);

      const seen: string[] = [];
      let cursor: string | undefined;
      for (let pages = 0; pages < 30; pages += 1) {
        const res = await list(userA, { limit: '2', ...(cursor ? { cursor } : {}) }).expect(200);
        seen.push(...res.body.items.map((n: { id: string }) => n.id));
        cursor = res.body.nextCursor ?? undefined;
        if (!cursor) break;
      }
      expect(seen).toEqual(everything.map((n) => n.id));
      expect(new Set(seen).size).toBe(seen.length);
    });

    it('rejects a bad limit, cursor or filter', async () => {
      for (const query of [{ limit: '0' }, { limit: '101' }, { cursor: 'nonsense' }, { unreadOnly: 'maybe' }, { nope: '1' }]) {
        const res = await list(userA, query).expect(400);
        expect(res.body).toMatchObject({ statusCode: 400, error: 'BAD_REQUEST' });
      }
    });
  });

  describe('reading', () => {
    let ids: string[];

    beforeAll(async () => {
      ids = [];
      for (const title of ['One', 'Two', 'Three']) {
        ids.push((await notify(userB, { title })).notification!.id);
        await pause(5);
      }
    });

    it('counts unread notifications for the badge', async () => {
      // userB also holds the reminder from the dedupe test above.
      expect(await unread(userB)).toBe(4);
    });

    it('marks one read, keeps the original time when asked again, and updates the count', async () => {
      const first = await markRead(userB, ids[0]).expect(200);
      expect(first.body).toMatchObject({ id: ids[0], title: 'One' });
      expect(first.body.readAt).toEqual(expect.any(String));
      expect(await unread(userB)).toBe(3);

      await pause(15);
      const again = await markRead(userB, ids[0]).expect(200);
      expect(again.body.readAt).toBe(first.body.readAt);
      expect(await unread(userB)).toBe(3);
    });

    it('can show only the unread ones', async () => {
      const onlyUnread = (await list(userB, { unreadOnly: 'true' }).expect(200)).body.items;
      expect(onlyUnread.map((n: { title: string }) => n.title)).toEqual(['Three', 'Two', expect.any(String)]);
      expect(onlyUnread.every((n: { readAt: unknown }) => n.readAt === null)).toBe(true);

      const all = (await list(userB, { unreadOnly: 'false' }).expect(200)).body.items;
      expect(all).toHaveLength(4);
    });

    it('marks everything read at once, then reports there was nothing left to do', async () => {
      const firstReadAt = (await markRead(userB, ids[0]).expect(200)).body.readAt;

      expect((await readAll(userB).expect(200)).body).toEqual({ updated: 3 });
      expect(await unread(userB)).toBe(0);
      expect((await list(userB, { unreadOnly: 'true' }).expect(200)).body.items).toEqual([]);
      expect((await readAll(userB).expect(200)).body).toEqual({ updated: 0 });

      expect((await markRead(userB, ids[0]).expect(200)).body.readAt).toBe(firstReadAt);
    });

    it('answers a replayed Idempotency-Key with the first answer instead of acting again', async () => {
      await notify(userB, { title: 'Four' });
      const key = { 'Idempotency-Key': `read-all-${Date.now()}` };

      expect((await readAll(userB, key).expect(200)).body).toEqual({ updated: 1 });
      await notify(userB, { title: 'Five' });

      expect((await readAll(userB, key).expect(200)).body).toEqual({ updated: 1 }); // replayed, not repeated
      expect(await unread(userB)).toBe(1); // Five is still unread

      // The same key on a different route is refused rather than answered with the wrong body.
      const fourId = (await list(userB).expect(200)).body.items.find((n: { title: string }) => n.title === 'Four').id;
      await markRead(userB, fourId, key).expect(422);

      expect((await readAll(userB).expect(200)).body).toEqual({ updated: 1 });
    });
  });

  describe('ownership', () => {
    it('never shows, counts or changes another user\'s notifications', async () => {
      const mine = (await notify(userA, { title: 'Only mine' })).notification!.id;
      const theirs = (await notify(userB, { title: 'Only theirs' })).notification!.id;

      const aList = (await list(userA, { limit: '100' }).expect(200)).body.items.map((n: { id: string }) => n.id);
      const bList = (await list(userB, { limit: '100' }).expect(200)).body.items.map((n: { id: string }) => n.id);
      expect(aList).toContain(mine);
      expect(aList).not.toContain(theirs);
      expect(bList).toContain(theirs);
      expect(bList).not.toContain(mine);

      const bUnreadBefore = await unread(userB);
      const stranger = await markRead(userA, theirs).expect(404);
      const missing = await markRead(userA, '2a3b4c5d-0000-4000-8000-000000000000').expect(404);
      expect(stranger.body).toEqual(missing.body);

      expect(await unread(userB)).toBe(bUnreadBefore);
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: theirs } })).readAt).toBeNull();

      // read-all only touches the caller's own.
      await readAll(userA).expect(200);
      expect(await unread(userB)).toBe(bUnreadBefore);
    });

    it('rejects an id that is not a UUID', async () => {
      await markRead(userA, 'not-a-uuid').expect(400);
    });

    it.each([
      ['get', '/api/v1/notifications'],
      ['get', '/api/v1/notifications/unread-count'],
      ['post', '/api/v1/notifications/read-all'],
      ['post', '/api/v1/notifications/2a3b4c5d-0000-4000-8000-000000000000/read'],
    ] as const)('requires a session for %s %s', async (method, path) => {
      const res = await request(app.getHttpServer())[method](path);
      expect(res.status).toBe(401);
    });
  });
});
