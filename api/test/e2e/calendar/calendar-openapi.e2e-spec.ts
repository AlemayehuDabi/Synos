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

describe('Calendar: OpenAPI (e2e)', () => {
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
    ['get', '/api/v1/calendar/view'],
    ['get', '/api/v1/calendar/free-slots'],
    ['get', '/api/v1/calendar/events'],
    ['post', '/api/v1/calendar/events'],
    ['get', '/api/v1/calendar/events/{id}'],
    ['patch', '/api/v1/calendar/events/{id}'],
    ['delete', '/api/v1/calendar/events/{id}'],
  ])('documents %s %s with a summary, a bearer requirement and a 401', (method, path) => {
    const op = operation(path, method);
    expect(op, `${method} ${path} is missing from the OpenAPI document`).toBeDefined();
    expect(op.summary).toBeTruthy();
    expect(op.security).toEqual(expect.arrayContaining([{ bearer: [] }]));
    expect(op.responses['401']).toBeDefined();
  });

  it('documents the create/update error responses, including 409 on a duplicate id', () => {
    expect(statuses('/api/v1/calendar/events', 'post')).toEqual(expect.arrayContaining(['201', '400', '401', '409']));
    expect(statuses('/api/v1/calendar/events', 'post')).not.toContain('200');
    expect(statuses('/api/v1/calendar/events/{id}', 'patch')).toEqual(expect.arrayContaining(['200', '400', '401', '404']));
    expect(statuses('/api/v1/calendar/events/{id}', 'delete')).toEqual(expect.arrayContaining(['204', '400', '401', '404']));
  });

  it('documents the Idempotency-Key header on POST', () => {
    expect(operation('/api/v1/calendar/events', 'post').parameters?.some((p) => p.name === 'Idempotency-Key' && p.in === 'header')).toBe(true);
  });

  it('documents the query parameters', () => {
    const names = (path: string) => (operation(path, 'get').parameters ?? []).filter((p) => p.in === 'query').map((p) => p.name);
    expect(names('/api/v1/calendar/view').sort()).toEqual(['from', 'timezone', 'to']);
    expect(names('/api/v1/calendar/free-slots').sort()).toEqual(['dayEnd', 'dayStart', 'duration', 'from', 'limit', 'timezone', 'to']);
    expect(names('/api/v1/calendar/events').sort()).toEqual(['cursor', 'from', 'limit', 'to']);
  });

  it('describes the responses with named schemas, including the standard error shape', () => {
    const schemas = doc.components?.schemas ?? {};
    for (const name of [
      'ErrorResponse',
      'CalendarEventResponse',
      'CalendarEventPageResponse',
      'CalendarOccurrenceResponse',
      'CalendarViewResponse',
      'CalendarViewItemResponse',
      'ContributorStatusResponse',
      'FreeSlotResponse',
    ]) {
      expect(schemas[name], `schema ${name}`).toBeDefined();
    }
  });

  it('shows contributor status as ok, error or timeout', () => {
    const schemas = doc.components?.schemas as Record<string, { properties: Record<string, { enum?: string[] }> }>;
    expect(schemas.ContributorStatusResponse.properties.status.enum).toEqual(['ok', 'error', 'timeout']);
  });
});
