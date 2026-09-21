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

describe('Today, reviews and notifications: OpenAPI (e2e)', () => {
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
    ['get', '/api/v1/today'],
    ['get', '/api/v1/reviews'],
    ['get', '/api/v1/reviews/{id}'],
    ['get', '/api/v1/notifications'],
    ['get', '/api/v1/notifications/unread-count'],
    ['post', '/api/v1/notifications/{id}/read'],
    ['post', '/api/v1/notifications/read-all'],
    ['get', '/api/v1/notification-preferences'],
    ['patch', '/api/v1/notification-preferences'],
  ])('documents %s %s with a summary, a bearer requirement and a 401', (method, path) => {
    const op = operation(path, method);
    expect(op, `${method} ${path} is missing from the OpenAPI document`).toBeDefined();
    expect(op.summary).toBeTruthy();
    expect(op.security).toEqual(expect.arrayContaining([{ bearer: [] }]));
    expect(op.responses['401']).toBeDefined();
    expect(op.responses['200']).toBeDefined();
  });

  it('documents the error responses each route can give', () => {
    expect(statuses('/api/v1/today', 'get')).toEqual(expect.arrayContaining(['200', '400', '401']));
    expect(statuses('/api/v1/reviews', 'get')).toEqual(expect.arrayContaining(['200', '400', '401']));
    expect(statuses('/api/v1/reviews/{id}', 'get')).toEqual(expect.arrayContaining(['200', '400', '401', '404']));
    expect(statuses('/api/v1/notifications', 'get')).toEqual(expect.arrayContaining(['200', '400', '401']));
    expect(statuses('/api/v1/notifications/{id}/read', 'post')).toEqual(expect.arrayContaining(['200', '400', '401', '404']));
    expect(statuses('/api/v1/notification-preferences', 'patch')).toEqual(expect.arrayContaining(['200', '400', '401']));
  });

  it('documents the Idempotency-Key header on the POST routes', () => {
    for (const path of ['/api/v1/notifications/{id}/read', '/api/v1/notifications/read-all']) {
      expect(operation(path, 'post').parameters?.some((p) => p.name === 'Idempotency-Key' && p.in === 'header'), path).toBe(true);
    }
  });

  it('documents the query parameters', () => {
    const names = (path: string) => (operation(path, 'get').parameters ?? []).filter((p) => p.in === 'query').map((p) => p.name);
    expect(names('/api/v1/today')).toEqual(['date']);
    expect(names('/api/v1/reviews').sort()).toEqual(['cursor', 'limit', 'type']);
    expect(names('/api/v1/notifications').sort()).toEqual(['cursor', 'limit', 'unreadOnly']);
  });

  it('describes the responses with named schemas', () => {
    const schemas = doc.components?.schemas ?? {};
    for (const name of [
      'TodayResponse',
      'TodaySectionResponse',
      'ReviewResponse',
      'ReviewSectionResponse',
      'ReviewPageResponse',
      'NotificationResponse',
      'NotificationPageResponse',
      'UnreadCountResponse',
      'MarkAllReadResponse',
      'NotificationPreferencesResponse',
      'CategoryPreferenceResponse',
      'QuietHoursResponse',
      'UpdateNotificationPreferencesDto',
    ]) {
      expect(schemas[name], `schema ${name}`).toBeDefined();
    }
  });

  it('shows what a section looks like: a status of ok, error or timeout', () => {
    const schemas = doc.components?.schemas as Record<string, { properties: Record<string, { enum?: string[] }> }>;
    expect(schemas.TodaySectionResponse.properties.status.enum).toEqual(['ok', 'error', 'timeout']);
    expect(schemas.ReviewSectionResponse.properties.status.enum).toEqual(['ok', 'error', 'timeout']);
  });
});
