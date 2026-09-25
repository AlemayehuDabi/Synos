import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bearer } from '../helpers.js';

/** The id of a seeded library exercise, found by (exact, case-insensitive) name. */
export async function libraryExerciseId(app: INestApplication, token: string, name: string): Promise<string> {
  const res = await request(app.getHttpServer()).get('/api/v1/exercises').query({ q: name, isCustom: 'false', limit: '20' }).set(bearer(token)).expect(200);
  const found = res.body.items.find((e: { name: string }) => e.name.toLowerCase() === name.toLowerCase());
  if (!found) throw new Error(`Library exercise "${name}" not found`);
  return found.id as string;
}

export const isoNow = () => new Date().toISOString();
export const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
