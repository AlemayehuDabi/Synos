import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers.js';

type Operation = {
  summary?: string;
  responses: Record<string, unknown>;
  parameters?: { name: string; in: string }[];
  security?: unknown[];
};

describe('Habits: OpenAPI (e2e)', () => {
  let app: INestApplication;
  let doc: OpenAPIObject;

  const operation = (path: string, method: string): Operation => (doc.paths[path] as Record<string, Operation>)[method];
  const statuses = (path: string, method: string) => Object.keys(operation(path, method).responses);

  beforeAll(async () => {
    ({ app } = await createTestApp());
    doc = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['get', '/api/v1/habits'],
    ['post', '/api/v1/habits'],
    ['get', '/api/v1/habits/today'],
    ['get', '/api/v1/habits/{id}'],
    ['patch', '/api/v1/habits/{id}'],
    ['delete', '/api/v1/habits/{id}'],
    ['post', '/api/v1/habits/{id}/archive'],
    ['get', '/api/v1/habits/{id}/stats'],
    ['get', '/api/v1/habits/{id}/entries'],
    ['post', '/api/v1/habits/{id}/entries'],
    ['patch', '/api/v1/habits/{id}/entries/{entryId}'],
    ['delete', '/api/v1/habits/{id}/entries/{entryId}'],
  ])('documents %s %s with a summary, a bearer requirement and a 401', (method, path) => {
    const op = operation(path, method);
    expect(op, `${method} ${path} is missing from the OpenAPI document`).toBeDefined();
    expect(op.summary).toBeTruthy();
    expect(op.security).toEqual(expect.arrayContaining([{ bearer: [] }]));
    expect(op.responses['401']).toBeDefined();
  });

  it('documents the create/update error responses, including 409 on a duplicate id', () => {
    expect(statuses('/api/v1/habits', 'post')).toEqual(expect.arrayContaining(['201', '400', '401', '409']));
    expect(statuses('/api/v1/habits', 'post')).not.toContain('200');
    expect(statuses('/api/v1/habits/{id}', 'patch')).toEqual(expect.arrayContaining(['200', '400', '401', '404']));
    expect(statuses('/api/v1/habits/{id}', 'delete')).toEqual(expect.arrayContaining(['204', '400', '401', '404']));
  });

  it('documents the Idempotency-Key header on POST /habits and POST /habits/:id/entries', () => {
    expect(operation('/api/v1/habits', 'post').parameters?.some((p) => p.name === 'Idempotency-Key' && p.in === 'header')).toBe(true);
    expect(operation('/api/v1/habits/{id}/entries', 'post').parameters?.some((p) => p.name === 'Idempotency-Key' && p.in === 'header')).toBe(true);
  });

  it('documents the list query parameters', () => {
    const names = (operation('/api/v1/habits', 'get').parameters ?? []).filter((p) => p.in === 'query').map((p) => p.name);
    expect(names.sort()).toEqual(['cursor', 'isArchived', 'limit', 'type'].sort());
  });

  it('describes the responses with named schemas, including the standard error shape', () => {
    const schemas = doc.components?.schemas ?? {};
    for (const name of ['ErrorResponse', 'HabitResponse', 'HabitPageResponse', 'HabitEntryResponse', 'HabitStatsResponse', 'HabitTodayResponse']) {
      expect(schemas[name], `schema ${name}`).toBeDefined();
    }
  });

  it('documents type and schedule as enums', () => {
    const schemas = doc.components?.schemas as Record<string, { properties?: Record<string, { enum?: string[] }> }>;
    expect(schemas.HabitResponse.properties?.type?.enum).toEqual(['build', 'break']);
    expect(schemas.HabitResponse.properties?.schedule?.enum).toEqual(['daily', 'weekly', 'specificDays', 'timesPerWeek', 'timesPerMonth']);
  });
});
