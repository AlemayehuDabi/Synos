import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../../src/lib/prisma.js';
import type { SignalEngineFacade } from '../../../src/signal-engine/signal-engine.facade.js';
import { SandboxApplyOkHandler } from '../../sandbox/sandbox-handlers.js';
import { bearer, type SentMail, signUpAndVerify, type TestUser } from '../helpers.js';
import { createEngineTestApp, emitBillDue, findSuggestion } from './support.js';

/**
 * The guarantees the spec states in prose rather than as a happy path: no
 * partial writes from a failed handler, compare-and-set on every transition,
 * owner scoping on every route, cursor pagination, idempotency, append-only signals.
 *
 * Better Auth's sign-up/sign-in rate limit (5 per minute) is left on in e2e, so
 * this file shares four users instead of creating one per test.
 */
describe('Signal engine: guarantees (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let facade: SignalEngineFacade;
  let prisma: PrismaService;
  let main: TestUser; // suggest mode; most tests
  let autoUser: TestUser; // connection switched to auto
  let pagingUser: TestUser; // needs an exact, known row count
  let otherUser: TestUser; // owns nothing; used for isolation checks

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, sentMails, facade } = await createEngineTestApp());
    prisma = app.get(PrismaService);
    main = await signUpAndVerify(app, sentMails);
    autoUser = await signUpAndVerify(app, sentMails);
    pagingUser = await signUpAndVerify(app, sentMails);
    otherUser = await signUpAndVerify(app, sentMails);
    await http().patch('/api/v1/connections/bill-to-reminder').set(bearer(autoUser.token)).send({ mode: 'auto' }).expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('a failed handler leaves no partial writes behind', () => {
    // The sandbox throw/conflict handlers write a marker activity row through ctx.tx
    // *before* failing (kind manual_override, tagged with the suggestion id), so a
    // surviving marker proves a leak.
    const leftovers = (suggestionId: string) =>
      prisma.activityLog.count({
        where: { kind: 'manual_override', entityRef: { path: ['partialWriteBy'], equals: suggestionId } },
      });

    it('manual approve, handler throws: 422, failed, marker rolled back', async () => {
      const { payload } = await emitBillDue(facade, main.userId, 'throws-');
      const suggestion = await findSuggestion(app, main.token, payload.billId);

      await http().post(`/api/v1/inbox/${suggestion.id}/approve`).set(bearer(main.token)).expect(422);

      const detail = await http().get(`/api/v1/inbox/${suggestion.id}`).set(bearer(main.token)).expect(200);
      expect(detail.body.status).toBe('failed');
      expect(await leftovers(suggestion.id)).toBe(0);
    });

    it('manual approve, handler conflicts: 409, superseded, marker rolled back', async () => {
      const { payload } = await emitBillDue(facade, main.userId, 'conflict-');
      const suggestion = await findSuggestion(app, main.token, payload.billId);

      await http().post(`/api/v1/inbox/${suggestion.id}/approve`).set(bearer(main.token)).expect(409);

      const detail = await http().get(`/api/v1/inbox/${suggestion.id}`).set(bearer(main.token)).expect(200);
      expect(detail.body.status).toBe('superseded');
      expect(await leftovers(suggestion.id)).toBe(0);
    });

    it('auto mode, handler throws: stays pending with a failureNote, marker rolled back, signal still processed', async () => {
      const { signal, payload } = await emitBillDue(facade, autoUser.userId, 'throws-');

      const suggestion = await findSuggestion(app, autoUser.token, payload.billId);
      expect(suggestion.status).toBe('pending');
      expect(suggestion.failureNote).toContain('sandbox handler intentionally threw');
      expect(await leftovers(suggestion.id)).toBe(0);
      const processed = await prisma.signal.findUniqueOrThrow({ where: { id: signal.id } });
      expect(processed.processedAt).not.toBeNull();
    });

    it('auto mode, handler conflicts: superseded, marker rolled back', async () => {
      const { payload } = await emitBillDue(facade, autoUser.userId, 'conflict-');

      const suggestion = await findSuggestion(app, autoUser.token, payload.billId, 'superseded');
      expect(suggestion).toBeTruthy();
      expect(await leftovers(suggestion.id)).toBe(0);
    });
  });

  describe('undo', () => {
    async function approvedActivity(prefix = '') {
      const { payload } = await emitBillDue(facade, main.userId, prefix);
      const suggestion = await findSuggestion(app, main.token, payload.billId);
      await http().post(`/api/v1/inbox/${suggestion.id}/approve`).set(bearer(main.token)).expect(200);
      const activity = await http()
        .get('/api/v1/activity')
        .query({ kind: 'suggestion_approved', limit: 100 })
        .set(bearer(main.token))
        .expect(200);
      return {
        suggestion,
        entry: activity.body.items.find((a: { suggestionId: string }) => a.suggestionId === suggestion.id),
      };
    }

    it('exactly one of two concurrent undos reverts, and the handler runs once', async () => {
      const { entry } = await approvedActivity();
      const revertSpy = vi.spyOn(SandboxApplyOkHandler.prototype, 'revert');
      const callsBefore = revertSpy.mock.calls.length;

      const [first, second] = await Promise.all([
        http().post(`/api/v1/activity/${entry.id}/undo`).set(bearer(main.token)),
        http().post(`/api/v1/activity/${entry.id}/undo`).set(bearer(main.token)),
      ]);

      expect([first.status, second.status].sort((a, b) => a - b)).toEqual([200, 409]);
      expect(revertSpy.mock.calls.length - callsBefore).toBe(1);
      revertSpy.mockRestore();
    });

    it('only approval and auto-apply entries can be undone', async () => {
      const { suggestion } = await approvedActivity();
      const created = await http()
        .get('/api/v1/activity')
        .query({ kind: 'suggestion_created', limit: 100 })
        .set(bearer(main.token))
        .expect(200);
      const createdEntry = created.body.items.find((a: { suggestionId: string }) => a.suggestionId === suggestion.id);

      await http().post(`/api/v1/activity/${createdEntry.id}/undo`).set(bearer(main.token)).expect(422);
    });

    it('refuses to undo an action whose handler does not support revert (422)', async () => {
      const { entry } = await approvedActivity('norevert-');
      await http().post(`/api/v1/activity/${entry.id}/undo`).set(bearer(main.token)).expect(422);
    });

    it('answers 404 for an unknown activity id and 400 for a malformed one', async () => {
      await http().post(`/api/v1/activity/${randomUUID()}/undo`).set(bearer(main.token)).expect(404);
      await http().post('/api/v1/activity/not-a-uuid/undo').set(bearer(main.token)).expect(400);
    });
  });

  describe('editing a suggestion', () => {
    it('validates params, keeps the first-proposed params in originalParams, and logs each edit', async () => {
      const { payload } = await emitBillDue(facade, main.userId);
      const suggestion = await findSuggestion(app, main.token, payload.billId);

      const first = await http()
        .patch(`/api/v1/inbox/${suggestion.id}`)
        .set(bearer(main.token))
        .send({ params: { billId: 'edited-1' } })
        .expect(200);
      expect(first.body.params).toEqual({ billId: 'edited-1' });
      expect(first.body.originalParams).toEqual({ billId: payload.billId });

      const second = await http()
        .patch(`/api/v1/inbox/${suggestion.id}`)
        .set(bearer(main.token))
        .send({ params: { billId: 'edited-2' } })
        .expect(200);
      expect(second.body.params).toEqual({ billId: 'edited-2' });
      expect(second.body.originalParams).toEqual({ billId: payload.billId }); // not overwritten
      expect(second.body.statusHistory.filter((a: { kind: string }) => a.kind === 'suggestion_edited')).toHaveLength(2);
    });

    it('rejects params the handler schema refuses (422) and leaves the suggestion unchanged', async () => {
      const { payload } = await emitBillDue(facade, main.userId);
      const suggestion = await findSuggestion(app, main.token, payload.billId);

      await http()
        .patch(`/api/v1/inbox/${suggestion.id}`)
        .set(bearer(main.token))
        .send({ params: { billId: 5 } })
        .expect(422);
      await http().patch(`/api/v1/inbox/${suggestion.id}`).set(bearer(main.token)).send({}).expect(400);

      const detail = await http().get(`/api/v1/inbox/${suggestion.id}`).set(bearer(main.token)).expect(200);
      expect(detail.body.params).toEqual({ billId: payload.billId });
      expect(detail.body.originalParams).toBeNull();
    });

    it('refuses to edit a suggestion that is no longer pending (409)', async () => {
      const { payload } = await emitBillDue(facade, main.userId);
      const suggestion = await findSuggestion(app, main.token, payload.billId);
      await http().post(`/api/v1/inbox/${suggestion.id}/dismiss`).set(bearer(main.token)).expect(200);

      await http()
        .patch(`/api/v1/inbox/${suggestion.id}`)
        .set(bearer(main.token))
        .send({ params: { billId: 'late-edit' } })
        .expect(409);
    });

    it('edit-and-approve in one call applies the edited params and records both steps', async () => {
      const { payload } = await emitBillDue(facade, main.userId);
      const suggestion = await findSuggestion(app, main.token, payload.billId);

      const approved = await http()
        .post(`/api/v1/inbox/${suggestion.id}/approve`)
        .set(bearer(main.token))
        .send({ params: { billId: 'approved-with-edit' } })
        .expect(200);

      expect(approved.body.status).toBe('approved');
      expect(approved.body.params).toEqual({ billId: 'approved-with-edit' });
      expect(approved.body.originalParams).toEqual({ billId: payload.billId });
      expect(approved.body.revertData).toEqual({ billId: 'approved-with-edit' });
      const kinds = approved.body.statusHistory.map((a: { kind: string }) => a.kind);
      expect(kinds).toEqual(expect.arrayContaining(['suggestion_created', 'suggestion_edited', 'suggestion_approved']));
    });
  });

  describe('cursor pagination', () => {
    beforeAll(async () => {
      for (let i = 0; i < 5; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await emitBillDue(facade, pagingUser.userId);
      }
    });

    async function pageThrough(path: string, query: Record<string, string>) {
      const ids: string[] = [];
      let pages = 0;
      let cursor: string | null = null;
      do {
        // eslint-disable-next-line no-await-in-loop
        const res: request.Response = await http()
          .get(path)
          .query({ ...query, limit: 2, ...(cursor ? { cursor } : {}) })
          .set(bearer(pagingUser.token))
          .expect(200);
        ids.push(...res.body.items.map((item: { id: string }) => item.id));
        cursor = res.body.nextCursor;
        pages += 1;
        expect(res.body.items.length).toBeLessThanOrEqual(2);
      } while (cursor);
      return { ids, pages };
    }

    it.each([
      ['/api/v1/signals', { type: 'bill.due' }],
      ['/api/v1/inbox', { status: 'pending' }],
      ['/api/v1/activity', { kind: 'suggestion_created' }],
    ])('%s: pages cover every row exactly once, in the same order as one big page', async (path, query) => {
      const all = await http().get(path).query({ ...query, limit: 100 }).set(bearer(pagingUser.token)).expect(200);
      const expected = all.body.items.map((item: { id: string }) => item.id);
      expect(expected).toHaveLength(5);

      const { ids, pages } = await pageThrough(path, query);

      expect(pages).toBe(3);
      expect(ids).toEqual(expected);
      expect(new Set(ids).size).toBe(5);
    });

    it('answers 400, not 500, for a malformed cursor', async () => {
      const missingSeparator = Buffer.from('no-separator-here').toString('base64url');
      const badId = Buffer.from('2026-01-01T00:00:00.000Z|not-a-uuid').toString('base64url');
      const badDate = Buffer.from(`not-a-date|${randomUUID()}`).toString('base64url');

      for (const cursor of ['garbage', missingSeparator, badId, badDate]) {
        for (const path of ['/api/v1/signals', '/api/v1/inbox', '/api/v1/activity']) {
          // eslint-disable-next-line no-await-in-loop
          await http().get(path).query({ cursor }).set(bearer(main.token)).expect(400);
        }
      }
    });
  });

  describe('malformed ids', () => {
    it('answer 400 (not 500) on every route that takes a uuid, and 404 for an unknown one', async () => {
      const auth = bearer(main.token);

      await http().get('/api/v1/inbox/not-a-uuid').set(auth).expect(400);
      await http().patch('/api/v1/inbox/not-a-uuid').set(auth).send({ params: {} }).expect(400);
      await http().post('/api/v1/inbox/not-a-uuid/approve').set(auth).expect(400);
      await http().post('/api/v1/inbox/not-a-uuid/dismiss').set(auth).expect(400);
      await http().post('/api/v1/inbox/bulk').set(auth).send({ action: 'approve', ids: ['nope'] }).expect(400);

      // the routes from the auth task validate their ids the same way
      await http().get('/api/v1/me/export/not-a-uuid').set(auth).expect(400);
      await http().delete('/api/v1/devices/not-a-uuid').set(auth).expect(400);

      await http().get(`/api/v1/inbox/${randomUUID()}`).set(auth).expect(404);
      await http().patch('/api/v1/connections/not-a-connection').set(auth).send({ mode: 'suggest' }).expect(404);
    });
  });

  describe('owner scoping on every route', () => {
    it("another user sees none of a user's data and cannot act on it or change their settings", async () => {
      const first = await emitBillDue(facade, main.userId);
      const second = await emitBillDue(facade, main.userId);
      const idsOfMain = [
        (await findSuggestion(app, main.token, first.payload.billId)).id,
        (await findSuggestion(app, main.token, second.payload.billId)).id,
      ];

      // lists and the badge count are scoped
      for (const path of ['/api/v1/signals', '/api/v1/inbox', '/api/v1/activity']) {
        // eslint-disable-next-line no-await-in-loop
        const own = await http().get(path).set(bearer(main.token)).expect(200);
        // eslint-disable-next-line no-await-in-loop
        const other = await http().get(path).set(bearer(otherUser.token)).expect(200);
        expect(own.body.items.length).toBeGreaterThan(0);
        expect(other.body.items).toEqual([]);
      }
      expect((await http().get('/api/v1/inbox/count').set(bearer(main.token)).expect(200)).body.pending).toBeGreaterThanOrEqual(2);
      expect((await http().get('/api/v1/inbox/count').set(bearer(otherUser.token)).expect(200)).body.pending).toBe(0);

      // bulk from the other user fails for every id and changes nothing
      for (const action of ['approve', 'dismiss']) {
        // eslint-disable-next-line no-await-in-loop
        const res = await http().post('/api/v1/inbox/bulk').set(bearer(otherUser.token)).send({ action, ids: idsOfMain }).expect(200);
        expect(res.body.map((r: { status: string }) => r.status)).toEqual(['error', 'error']);
      }
      for (const id of idsOfMain) {
        // eslint-disable-next-line no-await-in-loop
        const detail = await http().get(`/api/v1/inbox/${id}`).set(bearer(main.token)).expect(200);
        expect(detail.body.status).toBe('pending');
      }

      // connection modes are per-user
      await http().patch('/api/v1/connections/bill-to-reminder').set(bearer(otherUser.token)).send({ mode: 'off' }).expect(200);
      const mine = await http().get('/api/v1/connections').set(bearer(main.token)).expect(200);
      expect(mine.body.find((c: { id: string }) => c.id === 'bill-to-reminder').mode).toBe('suggest');
      const theirs = await http().get('/api/v1/connections').set(bearer(otherUser.token)).expect(200);
      expect(theirs.body.find((c: { id: string }) => c.id === 'bill-to-reminder').mode).toBe('off');
    });
  });

  describe('Idempotency-Key on the action routes', () => {
    it('replaying an approve with the same key returns the first response instead of a 409', async () => {
      const { payload } = await emitBillDue(facade, main.userId);
      const suggestion = await findSuggestion(app, main.token, payload.billId);
      const key = `key-${randomUUID()}`;

      const first = await http()
        .post(`/api/v1/inbox/${suggestion.id}/approve`)
        .set(bearer(main.token))
        .set('Idempotency-Key', key)
        .expect(200);

      // the shared interceptor persists the key without awaiting it, so wait for it to land
      for (let i = 0; i < 40; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const stored = await prisma.idempotencyKey.findUnique({ where: { userId_key: { userId: main.userId, key } } });
        if (stored) break;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const replay = await http()
        .post(`/api/v1/inbox/${suggestion.id}/approve`)
        .set(bearer(main.token))
        .set('Idempotency-Key', key)
        .expect(200);
      expect(replay.body).toEqual(first.body);

      const approvals = await prisma.activityLog.count({
        where: { userId: main.userId, suggestionId: suggestion.id, kind: 'suggestion_approved' },
      });
      expect(approvals).toBe(1);

      // ...and without the key the same call really is a conflict
      await http().post(`/api/v1/inbox/${suggestion.id}/approve`).set(bearer(main.token)).expect(409);
    });
  });

  describe('Idempotency-Key on the routes from the auth task (POST /me/export, POST /devices)', () => {
    it('a replayed export request returns the original job instead of a 409/429', async () => {
      const key = `export-${randomUUID()}`;
      const first = await http().post('/api/v1/me/export').set(bearer(pagingUser.token)).set('Idempotency-Key', key).expect(201);

      const replay = await http().post('/api/v1/me/export').set(bearer(pagingUser.token)).set('Idempotency-Key', key).expect(201);
      expect(replay.body.id).toBe(first.body.id);

      // one job, not two: without the key a second request is rejected
      const jobs = await prisma.dataExportJob.count({ where: { userId: pagingUser.userId } });
      expect(jobs).toBe(1);
      await http().post('/api/v1/me/export').set(bearer(pagingUser.token)).expect((res) => {
        expect([409, 429]).toContain(res.status);
      });
    });

    it('a replayed device registration returns the original response', async () => {
      const key = `device-${randomUUID()}`;
      const body = { platform: 'ios', pushToken: `tok-${randomUUID()}` };
      const first = await http().post('/api/v1/devices').set(bearer(main.token)).set('Idempotency-Key', key).send(body).expect(201);

      const replay = await http().post('/api/v1/devices').set(bearer(main.token)).set('Idempotency-Key', key).send(body).expect(201);

      expect(replay.body).toEqual(first.body);
    });

    it('refuses (422) to reuse a key for a different suggestion', async () => {
      const a = await emitBillDue(facade, main.userId);
      const b = await emitBillDue(facade, main.userId);
      const suggestionA = await findSuggestion(app, main.token, a.payload.billId);
      const suggestionB = await findSuggestion(app, main.token, b.payload.billId);
      const key = `reuse-${randomUUID()}`;

      await http().post(`/api/v1/inbox/${suggestionA.id}/approve`).set(bearer(main.token)).set('Idempotency-Key', key).expect(200);

      await http().post(`/api/v1/inbox/${suggestionB.id}/approve`).set(bearer(main.token)).set('Idempotency-Key', key).expect(422);
      const untouched = await http().get(`/api/v1/inbox/${suggestionB.id}`).set(bearer(main.token)).expect(200);
      expect(untouched.body.status).toBe('pending');
    });
  });

  describe('signals are append-only', () => {
    it("rejects changes to a signal's content but allows processing bookkeeping and deletion", async () => {
      const { signal } = await emitBillDue(facade, main.userId);

      await expect(prisma.signal.update({ where: { id: signal.id }, data: { type: 'meal.logged' } })).rejects.toThrow();
      await expect(
        prisma.$executeRawUnsafe(`UPDATE signals SET payload = '{}'::jsonb WHERE id = '${signal.id}'::uuid`),
      ).rejects.toThrow(/append-only/);
      const untouched = await prisma.signal.findUniqueOrThrow({ where: { id: signal.id } });
      expect(untouched.type).toBe('bill.due');
      expect(untouched.payload).toEqual(signal.payload);

      await expect(
        prisma.signal.update({ where: { id: signal.id }, data: { attempts: 3, lastError: 'bookkeeping is allowed' } }),
      ).resolves.toMatchObject({ attempts: 3 });
      await expect(prisma.signal.delete({ where: { id: signal.id } })).resolves.toBeTruthy();
    });
  });
});
