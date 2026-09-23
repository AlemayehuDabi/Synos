import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { SandboxModule } from '../../sandbox/sandbox.module.js';
import { SignalEngineFacade } from '../../../src/signal-engine/signal-engine.facade.js';
import request from 'supertest';
import { bearer, createTestApp, type SentMail } from '../helpers.js';

export async function createEngineTestApp(): Promise<{
  app: INestApplication;
  sentMails: SentMail[];
  facade: SignalEngineFacade;
}> {
  const { app, sentMails } = await createTestApp([SandboxModule]);
  const facade = app.get(SignalEngineFacade);
  return { app, sentMails, facade };
}

export interface WorkoutCompletedPayload {
  workoutId: string;
  completedAt: string;
  durationMinutes: number;
  workoutType: string;
}

export function workoutCompletedPayload(workoutId: string): WorkoutCompletedPayload {
  return { workoutId, completedAt: '2026-10-01T07:00:00Z', durationMinutes: 45, workoutType: 'run' };
}

/** Emits a real "workout.completed" signal; the sandbox rule picks the fake action type from the workoutId prefix. */
export async function emitWorkoutCompleted(facade: SignalEngineFacade, userId: string, prefix = '') {
  const payload = workoutCompletedPayload(`${prefix}${randomUUID()}`);
  const signal = await facade.emit({ userId, type: 'workout.completed', payload });
  return { signal, payload };
}

/** Finds the suggestion the sandbox rule produced for a given workoutId (any status). */
export async function findSuggestion(
  app: INestApplication,
  token: string,
  workoutId: string,
  status: 'pending' | 'approved' | 'auto_applied' | 'superseded' | 'failed' | 'dismissed' = 'pending',
) {
  const res = await request(app.getHttpServer())
    .get('/api/v1/inbox')
    .query({ status, limit: 100 })
    .set(bearer(token))
    .expect(200);
  return res.body.items.find((s: { targetKey: string }) => s.targetKey === `sandbox:workout:${workoutId}`);
}
