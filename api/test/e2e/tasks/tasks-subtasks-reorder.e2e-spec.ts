import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type SentMail, signUpAndVerify, type TestUser } from '../helpers.js';

describe('Tasks: subtasks and reorder (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let user: TestUser;
  let other: TestUser;

  const createTask = (u: TestUser, body: Record<string, unknown> = { title: 'Parent' }) =>
    request(app.getHttpServer()).post('/api/v1/tasks').set(bearer(u.token)).send(body).expect(201);
  const listSubtasks = (u: TestUser, taskId: string) => request(app.getHttpServer()).get(`/api/v1/tasks/${taskId}/subtasks`).set(bearer(u.token));
  const createSubtask = (u: TestUser, taskId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(`/api/v1/tasks/${taskId}/subtasks`).set(bearer(u.token)).send(body);
  const patchSubtask = (u: TestUser, taskId: string, subtaskId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).patch(`/api/v1/tasks/${taskId}/subtasks/${subtaskId}`).set(bearer(u.token)).send(body);
  const delSubtask = (u: TestUser, taskId: string, subtaskId: string) =>
    request(app.getHttpServer()).delete(`/api/v1/tasks/${taskId}/subtasks/${subtaskId}`).set(bearer(u.token));
  const reorder = (u: TestUser, orderedIds: string[]) => request(app.getHttpServer()).post('/api/v1/tasks/reorder').set(bearer(u.token)).send({ orderedIds });

  beforeAll(async () => {
    ({ app, sentMails } = await createTestApp());
    user = await signUpAndVerify(app, sentMails);
    other = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('subtasks', () => {
    it('starts empty', async () => {
      const task = await createTask(user);
      const res = await listSubtasks(user, task.body.id).expect(200);
      expect(res.body).toEqual([]);
    });

    it('creates subtasks in append order with increasing sortOrder', async () => {
      const task = await createTask(user);
      const a = await createSubtask(user, task.body.id, { title: 'Buy fertilizer' }).expect(201);
      const b = await createSubtask(user, task.body.id, { title: 'Water' }).expect(201);
      expect(a.body).toMatchObject({ taskId: task.body.id, title: 'Buy fertilizer', status: 'open' });
      expect(b.body.sortOrder).toBeGreaterThan(a.body.sortOrder);

      const list = await listSubtasks(user, task.body.id).expect(200);
      expect(list.body.map((s: { title: string }) => s.title)).toEqual(['Buy fertilizer', 'Water']);
    });

    it('updates title and status', async () => {
      const task = await createTask(user);
      const sub = await createSubtask(user, task.body.id, { title: 'Original' }).expect(201);
      const updated = await patchSubtask(user, task.body.id, sub.body.id, { title: 'Renamed', status: 'completed' }).expect(200);
      expect(updated.body).toMatchObject({ title: 'Renamed', status: 'completed' });
    });

    it('soft-deletes a subtask, excluding it from the list', async () => {
      const task = await createTask(user);
      const sub = await createSubtask(user, task.body.id, { title: 'ToDelete' }).expect(201);
      await delSubtask(user, task.body.id, sub.body.id).expect(204);
      const list = await listSubtasks(user, task.body.id).expect(200);
      expect(list.body.map((s: { id: string }) => s.id)).not.toContain(sub.body.id);
    });

    it('is 404 for a subtask under another user\'s task', async () => {
      const task = await createTask(user);
      const sub = await createSubtask(user, task.body.id, { title: 'Mine' }).expect(201);
      await listSubtasks(other, task.body.id).expect(404);
      await createSubtask(other, task.body.id, { title: 'x' }).expect(404);
      await patchSubtask(other, task.body.id, sub.body.id, { title: 'x' }).expect(404);
      await delSubtask(other, task.body.id, sub.body.id).expect(404);
    });

    it('is 404 for a nonexistent subtask id under an owned task', async () => {
      const task = await createTask(user);
      await patchSubtask(user, task.body.id, '2a3b4c5d-0000-4000-8000-000000000000', { title: 'x' }).expect(404);
    });

    it('rejects an empty title', async () => {
      const task = await createTask(user);
      await createSubtask(user, task.body.id, { title: '' }).expect(400);
    });

    it('replays an Idempotency-Key instead of creating a second subtask', async () => {
      const task = await createTask(user);
      const key = { 'Idempotency-Key': `subtask-${randomUUID()}` };
      const first = await request(app.getHttpServer()).post(`/api/v1/tasks/${task.body.id}/subtasks`).set(bearer(user.token)).set(key).send({ title: 'Once' }).expect(201);
      const replay = await request(app.getHttpServer()).post(`/api/v1/tasks/${task.body.id}/subtasks`).set(bearer(user.token)).set(key).send({ title: 'Once' }).expect(201);
      expect(replay.body).toEqual(first.body);
      const list = await listSubtasks(user, task.body.id).expect(200);
      expect(list.body.filter((s: { title: string }) => s.title === 'Once')).toHaveLength(1);
    });

    it('requires authentication on every subtask route', async () => {
      const task = await createTask(user);
      await request(app.getHttpServer()).get(`/api/v1/tasks/${task.body.id}/subtasks`).expect(401);
      await request(app.getHttpServer()).post(`/api/v1/tasks/${task.body.id}/subtasks`).send({ title: 'x' }).expect(401);
    });
  });

  describe('reorder', () => {
    it('recomputes sortOrder to match the given order', async () => {
      const isolated = await signUpAndVerify(app, sentMails);
      const a = await createTask(isolated, { title: 'A' });
      const b = await createTask(isolated, { title: 'B' });
      const c = await createTask(isolated, { title: 'C' });

      await reorder(isolated, [c.body.id, a.body.id, b.body.id]).expect(200);

      const list = await request(app.getHttpServer()).get('/api/v1/tasks').query({ limit: '100' }).set(bearer(isolated.token)).expect(200);
      const mine = list.body.items.filter((t: { id: string }) => [a.body.id, b.body.id, c.body.id].includes(t.id));
      expect(mine.map((t: { id: string }) => t.id)).toEqual([c.body.id, a.body.id, b.body.id]);
    });

    it('rejects a list containing another user\'s task', async () => {
      const mine = await createTask(user, { title: 'Mine' });
      const theirs = await createTask(other, { title: 'Theirs' });
      await reorder(user, [mine.body.id, theirs.body.id]).expect(400);
    });

    it('rejects a nonexistent id', async () => {
      const mine = await createTask(user, { title: 'Mine' });
      await reorder(user, [mine.body.id, '2a3b4c5d-0000-4000-8000-000000000000']).expect(400);
    });

    it('rejects an empty list', async () => {
      await reorder(user, []).expect(400);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).post('/api/v1/tasks/reorder').send({ orderedIds: [] }).expect(401);
    });
  });
});
