import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SignalEngineFacade } from '../../../src/signal-engine/signal-engine.facade.js';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser } from '../helpers.js';

// Better Auth's own sign-up rate limit stays on for these specs (see helpers.ts), so each
// describe block below shares ONE user across all of its tests, disambiguating by a unique
// habit title/date per test instead of by a fresh account.
describe('Habits: signal engine integration (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let facade: SignalEngineFacade;

  const createHabit = (u: TestUser, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/v1/habits').set(bearer(u.token)).send(body).expect(201);
  const getHabit = (u: TestUser, id: string) => request(app.getHttpServer()).get(`/api/v1/habits/${id}`).set(bearer(u.token));
  const entries = (u: TestUser, habitId: string, query: Record<string, string> = {}) =>
    request(app.getHttpServer()).get(`/api/v1/habits/${habitId}/entries`).query(query).set(bearer(u.token)).expect(200);
  const upsertEntry = (u: TestUser, habitId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(`/api/v1/habits/${habitId}/entries`).set(bearer(u.token)).send(body).expect(200);
  const setMode = (u: TestUser, connectionId: string, mode: string) =>
    request(app.getHttpServer()).patch(`/api/v1/connections/${connectionId}`).set(bearer(u.token)).send({ mode }).expect(200);
  const inbox = (u: TestUser, query: Record<string, string> = {}) => request(app.getHttpServer()).get('/api/v1/inbox').query(query).set(bearer(u.token)).expect(200);
  const approve = (u: TestUser, id: string) => request(app.getHttpServer()).post(`/api/v1/inbox/${id}/approve`).set(bearer(u.token)).send({});
  const undo = (u: TestUser, activityId: string) => request(app.getHttpServer()).post(`/api/v1/activity/${activityId}/undo`).set(bearer(u.token)).send({});
  const activity = (u: TestUser, query: Record<string, string> = {}) => request(app.getHttpServer()).get('/api/v1/activity').query(query).set(bearer(u.token)).expect(200);

  const findByTargetKey = async (u: TestUser, targetKey: string, status = 'pending') => {
    const res = await inbox(u, { status, limit: '100' });
    return res.body.items.find((s: { targetKey: string }) => s.targetKey === targetKey);
  };
  const today = () => new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
    facade = app.get(SignalEngineFacade);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('workout-to-habit', () => {
    let user: TestUser;
    beforeAll(async () => {
      user = await signUpAndVerify(app, sentMails);
    });

    async function emitWorkoutCompleted(workoutType: string, prefix = '') {
      const payload = { workoutId: `${prefix}${Date.now()}-${Math.random()}`, completedAt: `${today()}T07:00:00Z`, durationMinutes: 30, workoutType };
      await facade.emit({ userId: user.userId, type: 'workout.completed', payload });
      return payload;
    }

    it('proposes checking off the matching build habit by title, and nothing when none matches', async () => {
      const habit = await createHabit(user, { title: 'Go for a run', type: 'build', schedule: 'daily' });
      await emitWorkoutCompleted('run');
      const targetKey = `habit:${habit.body.id}:${today()}`;
      const suggestion = await findByTargetKey(user, targetKey);
      expect(suggestion).toBeTruthy();

      await emitWorkoutCompleted('kayaking-unmatched-workout-type');
      const res = await inbox(user, { status: 'pending', limit: '100' });
      expect(res.body.items.some((s: { title: string }) => s.title.includes('kayaking'))).toBe(false);
    });

    it('suggest mode: approving creates a done entry with source auto; reverting deletes it while untouched', async () => {
      const habit = await createHabit(user, { title: 'Go for a swim', type: 'build', schedule: 'daily' });
      await emitWorkoutCompleted('swim');
      const targetKey = `habit:${habit.body.id}:${today()}`;
      const suggestion = await findByTargetKey(user, targetKey);
      expect(suggestion).toBeTruthy();

      const approved = await approve(user, suggestion.id).expect(200);
      expect(approved.body.status).toBe('approved');

      const list = await entries(user, habit.body.id, { from: today(), to: today() });
      expect(list.body).toEqual([expect.objectContaining({ status: 'done', source: 'auto' })]);

      const activityRes = await activity(user, { kind: 'suggestion_approved' });
      const entry = activityRes.body.items.find((a: { suggestionId: string }) => a.suggestionId === suggestion.id);
      const undone = await undo(user, entry.id).expect(200);
      expect(undone.body.status).toBe('reverted');

      const afterRevert = await entries(user, habit.body.id, { from: today(), to: today() });
      expect(afterRevert.body).toEqual([]);
    });

    it('revert conflicts once the auto entry has been manually touched', async () => {
      const habit = await createHabit(user, { title: 'Go for a bike ride', type: 'build', schedule: 'daily' });
      await emitWorkoutCompleted('bike');
      const targetKey = `habit:${habit.body.id}:${today()}`;
      const suggestion = await findByTargetKey(user, targetKey);
      const approved = await approve(user, suggestion.id).expect(200);
      expect(approved.body.status).toBe('approved');

      await upsertEntry(user, habit.body.id, { date: today(), status: 'done', note: 'Manually confirmed' });

      const activityRes = await activity(user, { kind: 'suggestion_approved' });
      const entry = activityRes.body.items.find((a: { suggestionId: string }) => a.suggestionId === suggestion.id);
      await undo(user, entry.id).expect(409);
    });

    it('never overwrites an existing manual entry for that date', async () => {
      const habit = await createHabit(user, { title: 'Go for a walk', type: 'build', schedule: 'daily' });
      await upsertEntry(user, habit.body.id, { date: today(), status: 'slipped', note: 'Skipped today' });

      await emitWorkoutCompleted('walk');
      const targetKey = `habit:${habit.body.id}:${today()}`;
      const suggestion = await findByTargetKey(user, targetKey);
      expect(suggestion).toBeTruthy();

      const res = await approve(user, suggestion.id).expect(409);
      expect(res.body.message).toContain('manual entry already exists');

      const list = await entries(user, habit.body.id, { from: today(), to: today() });
      expect(list.body).toEqual([expect.objectContaining({ status: 'slipped', source: 'manual' })]); // untouched
    });

    it('auto mode: creates the entry immediately, revertible the same way', async () => {
      await setMode(user, 'workout-to-habit', 'auto');
      const habit = await createHabit(user, { title: 'Go for a yoga session', type: 'build', schedule: 'daily' });
      await emitWorkoutCompleted('yoga');

      const targetKey = `habit:${habit.body.id}:${today()}`;
      const applied = await findByTargetKey(user, targetKey, 'auto_applied');
      expect(applied).toBeTruthy();
      const list = await entries(user, habit.body.id, { from: today(), to: today() });
      expect(list.body).toEqual([expect.objectContaining({ status: 'done', source: 'auto' })]);

      const activityRes = await activity(user, { kind: 'auto_applied' });
      const entry = activityRes.body.items.find((a: { suggestionId: string }) => a.suggestionId === applied.id);
      const undone = await undo(user, entry.id).expect(200);
      expect(undone.body.status).toBe('reverted');

      const afterRevert = await entries(user, habit.body.id, { from: today(), to: today() });
      expect(afterRevert.body).toEqual([]);
    });
  });

  describe('recurring-task-to-habit', () => {
    let user: TestUser;
    beforeAll(async () => {
      user = await signUpAndVerify(app, sentMails);
    });

    async function emitPattern(fingerprint: string, cadenceDays: number) {
      await facade.emit({
        userId: user.userId,
        type: 'task.recurring_pattern',
        payload: { fingerprint, occurrences: 4, cadenceDays, taskIds: ['t1', 't2', 't3', 't4'] },
      });
    }

    it('suggest mode: approving creates a new build habit with an inferred schedule; reverting archives it while untouched', async () => {
      const fingerprint = `water the office plants ${Date.now()}`;
      await emitPattern(fingerprint, 1);
      const targetKey = `habit-pattern:${fingerprint}`;
      const suggestion = await findByTargetKey(user, targetKey);
      expect(suggestion).toBeTruthy();

      const approved = await approve(user, suggestion.id).expect(200);
      expect(approved.body.status).toBe('approved');
      const habitId = approved.body.revertData.habitId;
      const habit = await getHabit(user, habitId).expect(200);
      expect(habit.body).toMatchObject({ type: 'build', schedule: 'daily', source: 'suggestion' });

      const activityRes = await activity(user, { kind: 'suggestion_approved' });
      const entry = activityRes.body.items.find((a: { suggestionId: string }) => a.suggestionId === suggestion.id);
      const undone = await undo(user, entry.id).expect(200);
      expect(undone.body.status).toBe('reverted');

      const afterRevert = await getHabit(user, habitId).expect(200);
      expect(afterRevert.body.isArchived).toBe(true);
    });

    it('infers a weekly schedule from a roughly-weekly cadence', async () => {
      const fingerprint = `mow the lawn ${Date.now()}`;
      await emitPattern(fingerprint, 7);
      const targetKey = `habit-pattern:${fingerprint}`;
      const suggestion = await findByTargetKey(user, targetKey);
      const approved = await approve(user, suggestion.id).expect(200);
      const habit = await getHabit(user, approved.body.revertData.habitId).expect(200);
      expect(habit.body.schedule).toBe('weekly');
    });

    it('revert conflicts once the created habit has been touched', async () => {
      const fingerprint = `clean the garage ${Date.now()}`;
      await emitPattern(fingerprint, 1);
      const suggestion = await findByTargetKey(user, `habit-pattern:${fingerprint}`);
      const approved = await approve(user, suggestion.id).expect(200);
      const habitId = approved.body.revertData.habitId;

      await request(app.getHttpServer()).patch(`/api/v1/habits/${habitId}`).set(bearer(user.token)).send({ title: 'Edited before undo' }).expect(200);

      const activityRes = await activity(user, { kind: 'suggestion_approved' });
      const entry = activityRes.body.items.find((a: { suggestionId: string }) => a.suggestionId === suggestion.id);
      await undo(user, entry.id).expect(409);
    });

    it('has no auto mode: this connection\'s maxMode is "suggest" only, so setting "auto" is rejected', async () => {
      await request(app.getHttpServer()).patch('/api/v1/connections/recurring-task-to-habit').set(bearer(user.token)).send({ mode: 'auto' }).expect(400);
    });
  });

  describe('manual entries supersede a pending/auto-applied workout-to-habit suggestion', () => {
    let user: TestUser;
    beforeAll(async () => {
      user = await signUpAndVerify(app, sentMails);
    });

    async function emitWorkoutCompleted(workoutType: string) {
      const payload = { workoutId: `${Date.now()}-${Math.random()}`, completedAt: `${today()}T07:00:00Z`, durationMinutes: 20, workoutType };
      await facade.emit({ userId: user.userId, type: 'workout.completed', payload });
    }

    it('a manual check-in for the same date supersedes a still-pending suggestion and logs a correction', async () => {
      const habit = await createHabit(user, { title: 'Go for a hike', type: 'build', schedule: 'daily' });
      await emitWorkoutCompleted('hike');
      const targetKey = `habit:${habit.body.id}:${today()}`;
      const suggestion = await findByTargetKey(user, targetKey);
      expect(suggestion).toBeTruthy();

      await upsertEntry(user, habit.body.id, { date: today(), status: 'done' });

      const detail = await request(app.getHttpServer()).get(`/api/v1/inbox/${suggestion.id}`).set(bearer(user.token)).expect(200);
      expect(detail.body.status).toBe('superseded');

      const activityRes = await activity(user, { kind: 'manual_override' });
      const entry = activityRes.body.items.find((a: { entityRef: { type: string } }) => a.entityRef?.type === 'habit-entry');
      expect(entry).toBeTruthy();
    });

    it('a manual edit after auto-apply corrects the resolved suggestion, linked to it', async () => {
      await setMode(user, 'workout-to-habit', 'auto');
      const habit = await createHabit(user, { title: 'Go for a climb', type: 'build', schedule: 'daily' });
      await emitWorkoutCompleted('climb');
      const targetKey = `habit:${habit.body.id}:${today()}`;
      const applied = await findByTargetKey(user, targetKey, 'auto_applied');
      expect(applied).toBeTruthy();

      const updated = await upsertEntry(user, habit.body.id, { date: today(), status: 'slipped', note: 'Actually skipped it' });

      const activityRes = await activity(user, { kind: 'manual_override' });
      const entry = activityRes.body.items.find((a: { entityRef: { id: string } }) => a.entityRef?.id === updated.body.id);
      expect(entry).toBeTruthy();
      expect(entry.suggestionId).toBe(applied.id);
    });
  });
});
