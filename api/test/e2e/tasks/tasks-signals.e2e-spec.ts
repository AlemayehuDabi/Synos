import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DetectorRunnerService } from '../../../src/signal-engine/bus/detector-runner.service.js';
import { SignalEngineFacade } from '../../../src/signal-engine/signal-engine.facade.js';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser } from '../helpers.js';

// Better Auth's own sign-up rate limit stays on for these specs (see helpers.ts), so each
// describe block below shares ONE user across all of its tests, disambiguating by a unique
// title/billId/taskId per test instead of by a fresh account.
describe('Tasks: signal engine integration (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let facade: SignalEngineFacade;
  let runner: DetectorRunnerService;

  const create = (u: TestUser, body: Record<string, unknown>) => request(app.getHttpServer()).post('/api/v1/tasks').set(bearer(u.token)).send(body).expect(201);
  const get = (u: TestUser, id: string) => request(app.getHttpServer()).get(`/api/v1/tasks/${id}`).set(bearer(u.token));
  const patch = (u: TestUser, id: string, body: Record<string, unknown>) => request(app.getHttpServer()).patch(`/api/v1/tasks/${id}`).set(bearer(u.token)).send(body);
  const schedule = (u: TestUser, id: string, body: Record<string, unknown>) => request(app.getHttpServer()).post(`/api/v1/tasks/${id}/schedule`).set(bearer(u.token)).send(body);
  const setMode = (u: TestUser, connectionId: string, mode: string) =>
    request(app.getHttpServer()).patch(`/api/v1/connections/${connectionId}`).set(bearer(u.token)).send({ mode }).expect(200);
  const inbox = (u: TestUser, query: Record<string, string> = {}) => request(app.getHttpServer()).get('/api/v1/inbox').query(query).set(bearer(u.token)).expect(200);
  const signals = (u: TestUser, query: Record<string, string> = {}) => request(app.getHttpServer()).get('/api/v1/signals').query(query).set(bearer(u.token)).expect(200);
  const approve = (u: TestUser, id: string) => request(app.getHttpServer()).post(`/api/v1/inbox/${id}/approve`).set(bearer(u.token)).send({});
  const undo = (u: TestUser, activityId: string) => request(app.getHttpServer()).post(`/api/v1/activity/${activityId}/undo`).set(bearer(u.token)).send({});
  const activity = (u: TestUser, query: Record<string, string> = {}) => request(app.getHttpServer()).get('/api/v1/activity').query(query).set(bearer(u.token)).expect(200);

  const findByTargetKey = async (u: TestUser, targetKey: string, status = 'pending') => {
    const res = await inbox(u, { status, limit: '100' });
    return res.body.items.find((s: { targetKey: string }) => s.targetKey === targetKey);
  };

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
    facade = app.get(SignalEngineFacade);
    runner = app.get(DetectorRunnerService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('task.missed detector', () => {
    let user: TestUser;
    beforeAll(async () => {
      user = await signUpAndVerify(app, sentMails);
    });

    it('emits once for an overdue open task, and does not double-emit on a second tick', async () => {
      const overdueAt = new Date(Date.now() - 3_600_000).toISOString();
      const task = await create(user, { title: 'Overdue', dueAt: overdueAt });

      await runner.runDetectorForTesting('tasks-missed');
      const first = await signals(user, { type: 'task.missed', limit: '100' });
      const mine = first.body.items.filter((s: { payload: { taskId: string } }) => s.payload.taskId === task.body.id);
      expect(mine).toHaveLength(1);

      await runner.runDetectorForTesting('tasks-missed');
      const second = await signals(user, { type: 'task.missed', limit: '100' });
      expect(second.body.items.filter((s: { payload: { taskId: string } }) => s.payload.taskId === task.body.id)).toHaveLength(1);
    });

    it('emits again once dueAt actually changes (new occurrence, new dedupeKey)', async () => {
      const task = await create(user, { title: 'Overdue then moved', dueAt: new Date(Date.now() - 3_600_000).toISOString() });
      await runner.runDetectorForTesting('tasks-missed');

      await patch(user, task.body.id, { dueAt: new Date(Date.now() - 7_200_000).toISOString() });
      await runner.runDetectorForTesting('tasks-missed');

      const res = await signals(user, { type: 'task.missed', limit: '100' });
      expect(res.body.items.filter((s: { payload: { taskId: string } }) => s.payload.taskId === task.body.id)).toHaveLength(2);
    });

    it('does not emit for a task that is not yet due, or already completed', async () => {
      const future = await create(user, { title: 'Future', dueAt: new Date(Date.now() + 3_600_000).toISOString() });
      const completed = await create(user, { title: 'Completed', dueAt: new Date(Date.now() - 3_600_000).toISOString() });
      await request(app.getHttpServer()).post(`/api/v1/tasks/${completed.body.id}/complete`).set(bearer(user.token)).send({}).expect(200);

      await runner.runDetectorForTesting('tasks-missed');
      const res = await signals(user, { type: 'task.missed', limit: '100' });
      const ids = res.body.items.map((s: { payload: { taskId: string } }) => s.payload.taskId);
      expect(ids).not.toContain(future.body.id);
      expect(ids).not.toContain(completed.body.id);
    });
  });

  describe('task.recurring_pattern detector', () => {
    let user: TestUser;
    beforeAll(async () => {
      user = await signUpAndVerify(app, sentMails);
    });

    it('fires once the same title has been created at least TASKS_PATTERN_MIN_OCCURRENCES times, and does not re-fire the same day', async () => {
      const title = `Renew parking permit ${Date.now()}`;
      await create(user, { title });
      await create(user, { title });
      await create(user, { title });

      await runner.runDetectorForTesting('tasks-recurring-pattern');
      const first = await signals(user, { type: 'task.recurring_pattern', limit: '100' });
      const mine = first.body.items.filter((s: { payload: { taskIds: string[] } }) => s.payload.taskIds.length === 3);
      expect(mine).toHaveLength(1);
      expect(mine[0].payload).toMatchObject({ occurrences: 3 });

      await runner.runDetectorForTesting('tasks-recurring-pattern');
      const second = await signals(user, { type: 'task.recurring_pattern', limit: '100' });
      expect(second.body.items.filter((s: { payload: { taskIds: string[] } }) => JSON.stringify(s.payload.taskIds) === JSON.stringify(mine[0].payload.taskIds))).toHaveLength(1);
    });

    it('does not fire below the occurrence threshold', async () => {
      const title = `One-off errand ${Date.now()}`;
      await create(user, { title });
      await create(user, { title });

      await runner.runDetectorForTesting('tasks-recurring-pattern');
      const res = await signals(user, { type: 'task.recurring_pattern', limit: '100' });
      expect(res.body.items.some((s: { payload: { taskIds: string[] } }) => s.payload.taskIds.length === 2)).toBe(false);
    });

    it('ignores recurring tasks (rrule set) as pattern candidates', async () => {
      const title = `Already recurring ${Date.now()}`;
      await create(user, { title, dueAt: '2026-09-07T09:00:00Z', rrule: 'FREQ=WEEKLY;BYDAY=MO' });
      await create(user, { title, dueAt: '2026-09-07T09:00:00Z', rrule: 'FREQ=WEEKLY;BYDAY=MO' });
      await create(user, { title, dueAt: '2026-09-07T09:00:00Z', rrule: 'FREQ=WEEKLY;BYDAY=MO' });

      await runner.runDetectorForTesting('tasks-recurring-pattern');
      const res = await signals(user, { type: 'task.recurring_pattern', limit: '100' });
      expect(res.body.items.some((s: { payload: { fingerprint: string } }) => s.payload.fingerprint === title.trim().toLowerCase())).toBe(false);
    });
  });

  describe('bill-to-reminder', () => {
    let user: TestUser;
    beforeAll(async () => {
      user = await signUpAndVerify(app, sentMails);
    });

    async function emitBillDue(billId: string) {
      const payload = { billId, dueDate: '2026-10-05', amountCents: 4200, currency: 'USD', daysUntilDue: 5 };
      await facade.emit({ userId: user.userId, type: 'bill.due', payload });
      return payload;
    }

    it('suggest mode: approving creates a task; reverting deletes it while untouched', async () => {
      const billId = `bill-${Date.now()}`;
      const payload = await emitBillDue(billId);

      const suggestion = await findByTargetKey(user, `bill:${billId}:reminder`);
      expect(suggestion).toBeTruthy();

      const approved = await approve(user, suggestion.id).expect(200);
      expect(approved.body.status).toBe('approved');
      const taskId = approved.body.revertData.taskId;
      const task = await get(user, taskId).expect(200);
      expect(task.body).toMatchObject({ title: `Pay bill due ${payload.dueDate}`, source: 'suggestion' });

      const activityRes = await activity(user, { kind: 'suggestion_approved' });
      const entry = activityRes.body.items.find((a: { suggestionId: string }) => a.suggestionId === suggestion.id);
      const undone = await undo(user, entry.id).expect(200);
      expect(undone.body.status).toBe('reverted');
      await get(user, taskId).expect(404);
    });

    it('revert conflicts once the created task has been touched', async () => {
      const billId = `bill-touched-${Date.now()}`;
      await emitBillDue(billId);
      const suggestion = await findByTargetKey(user, `bill:${billId}:reminder`);
      const approved = await approve(user, suggestion.id).expect(200);
      const taskId = approved.body.revertData.taskId;

      await patch(user, taskId, { title: 'Edited before undo' }).expect(200);

      const activityRes = await activity(user, { kind: 'suggestion_approved' });
      const entry = activityRes.body.items.find((a: { suggestionId: string }) => a.suggestionId === suggestion.id);
      await undo(user, entry.id).expect(409);
      await get(user, taskId).expect(200); // still there
    });

    it('auto mode: creates the task immediately, revertible the same way', async () => {
      await setMode(user, 'bill-to-reminder', 'auto');
      const billId = `bill-auto-${Date.now()}`;
      await emitBillDue(billId);

      const applied = await findByTargetKey(user, `bill:${billId}:reminder`, 'auto_applied');
      expect(applied).toBeTruthy();
      const task = await get(user, applied.revertData.taskId).expect(200);
      expect(task.body.source).toBe('auto');
    });
  });

  describe('recovery-to-task-load', () => {
    let user: TestUser;
    const todayAt = (hourMinute: string) => `${new Date().toISOString().slice(0, 10)}T${hourMinute}:00Z`;

    beforeAll(async () => {
      user = await signUpAndVerify(app, sentMails);
    });

    async function emitSleepPoor() {
      await facade.emit({ userId: user.userId, type: 'sleep.poor', payload: { date: new Date().toISOString().slice(0, 10), durationMinutes: 240, qualityScore: 20 } });
    }

    it('proposes softening a non-critical open task scheduled today, never a critical one', async () => {
      const normal = await create(user, { title: 'Normal task', scheduledStart: todayAt('09:00'), scheduledEnd: todayAt('10:00'), estimatedMinutes: 60 });
      const critical = await create(user, { title: 'Critical task', isCritical: true, scheduledStart: todayAt('11:00'), scheduledEnd: todayAt('12:00'), estimatedMinutes: 60 });

      await emitSleepPoor();

      const normalSuggestion = await findByTargetKey(user, `task:${normal.body.id}:load`);
      expect(normalSuggestion).toBeTruthy();
      const criticalSuggestion = await findByTargetKey(user, `task:${critical.body.id}:load`);
      expect(criticalSuggestion).toBeFalsy();
    });

    it('apply pushes the schedule back and trims the estimate; revert restores both', async () => {
      const task = await create(user, { title: 'To soften', scheduledStart: todayAt('09:00'), scheduledEnd: todayAt('10:00'), estimatedMinutes: 60 });
      await emitSleepPoor();
      const suggestion = await findByTargetKey(user, `task:${task.body.id}:load`);

      const approved = await approve(user, suggestion.id).expect(200);
      expect(approved.body.status).toBe('approved');

      const afterApply = await get(user, task.body.id).expect(200);
      expect(afterApply.body.scheduledStart).toBe(new Date(new Date(todayAt('09:00')).getTime() + 120 * 60_000).toISOString());
      expect(afterApply.body.estimatedMinutes).toBe(45); // 60 * 0.75

      const activityRes = await activity(user, { kind: 'suggestion_approved' });
      const entry = activityRes.body.items.find((a: { suggestionId: string }) => a.suggestionId === suggestion.id);
      const undone = await undo(user, entry.id).expect(200);
      expect(undone.body.status).toBe('reverted');

      const afterRevert = await get(user, task.body.id).expect(200);
      expect(afterRevert.body.scheduledStart).toBe(new Date(todayAt('09:00')).toISOString());
      expect(afterRevert.body.estimatedMinutes).toBe(60);
    });

    it('revert conflicts once the task has since changed', async () => {
      const task = await create(user, { title: 'To soften then change', scheduledStart: todayAt('09:00'), scheduledEnd: todayAt('10:00'), estimatedMinutes: 60 });
      await emitSleepPoor();
      const suggestion = await findByTargetKey(user, `task:${task.body.id}:load`);
      await approve(user, suggestion.id).expect(200);

      await schedule(user, task.body.id, { scheduledStart: todayAt('15:00'), scheduledEnd: todayAt('16:00') }).expect(200);

      const activityRes = await activity(user, { kind: 'suggestion_approved' });
      const entry = activityRes.body.items.find((a: { suggestionId: string }) => a.suggestionId === suggestion.id);
      await undo(user, entry.id).expect(409);
    });

    it('never adjusts a task once it is no longer open', async () => {
      const task = await create(user, { title: 'Completed before approve', scheduledStart: todayAt('09:00'), scheduledEnd: todayAt('10:00'), estimatedMinutes: 60 });
      await emitSleepPoor();
      const suggestion = await findByTargetKey(user, `task:${task.body.id}:load`);

      await request(app.getHttpServer()).post(`/api/v1/tasks/${task.body.id}/complete`).set(bearer(user.token)).send({}).expect(200);
      // The engine treats a handler's `noop` outcome on manual approve the same as a
      // conflict: 409, and the suggestion resolves to `superseded` rather than `approved`.
      const res = await approve(user, suggestion.id).expect(409);
      expect(res.body.message).toContain('Task is no longer open');

      const detail = await request(app.getHttpServer()).get(`/api/v1/inbox/${suggestion.id}`).set(bearer(user.token)).expect(200);
      expect(detail.body.status).toBe('superseded');

      const after = await get(user, task.body.id).expect(200);
      expect(after.body.estimatedMinutes).toBe(60); // untouched
    });

    it('a manual PATCH changing scheduledStart supersedes a still-pending suggestion and logs a correction', async () => {
      const task = await create(user, { title: 'Manually rescheduled', scheduledStart: todayAt('09:00'), scheduledEnd: todayAt('10:00'), estimatedMinutes: 60 });
      await facade.emit({ userId: user.userId, type: 'training.heavy', payload: { date: new Date().toISOString().slice(0, 10), loadScore: 90, windowDays: 7 } });
      const targetKey = `task:${task.body.id}:load`;
      const suggestion = await findByTargetKey(user, targetKey);
      expect(suggestion).toBeTruthy();

      await schedule(user, task.body.id, { scheduledStart: todayAt('14:00'), scheduledEnd: todayAt('15:00') }).expect(200);

      const detail = await request(app.getHttpServer()).get(`/api/v1/inbox/${suggestion.id}`).set(bearer(user.token)).expect(200);
      expect(detail.body.status).toBe('superseded');

      // recordCorrection only links a suggestionId when the prior suggestion was actually
      // applied/approved (not merely pending), so a superseded-while-pending one logs the
      // manual_override entry unlinked - identified here by its entityRef instead.
      const activityRes = await activity(user, { kind: 'manual_override' });
      const entry = activityRes.body.items.find((a: { entityRef: { type: string; id: string } }) => a.entityRef?.type === 'task' && a.entityRef?.id === task.body.id);
      expect(entry).toBeTruthy();
      expect(entry.suggestionId).toBeFalsy();
    });

    it('manually completing the task does not itself supersede (completion does not touch load fields)', async () => {
      const task = await create(user, { title: 'Completed manually', scheduledStart: todayAt('09:00'), scheduledEnd: todayAt('10:00'), estimatedMinutes: 60 });
      await facade.emit({ userId: user.userId, type: 'sleep.poor', payload: { date: new Date().toISOString().slice(0, 10), durationMinutes: 200 } });
      const targetKey = `task:${task.body.id}:load`;
      const suggestion = await findByTargetKey(user, targetKey);
      expect(suggestion).toBeTruthy();

      await request(app.getHttpServer()).post(`/api/v1/tasks/${task.body.id}/complete`).set(bearer(user.token)).send({}).expect(200);

      const detail = await request(app.getHttpServer()).get(`/api/v1/inbox/${suggestion.id}`).set(bearer(user.token)).expect(200);
      expect(detail.body.status).toBe('pending'); // completion itself never touches scheduledStart/estimatedMinutes
    });
  });
});
