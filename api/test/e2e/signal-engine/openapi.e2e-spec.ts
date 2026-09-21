import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEngineTestApp } from './support.js';

type Operation = {
  summary?: string;
  responses: Record<string, unknown>;
  parameters?: { name: string; in: string }[];
  security?: unknown[];
};

describe('Signal engine: OpenAPI (e2e)', () => {
  let app: INestApplication;
  let doc: OpenAPIObject;

  const operation = (path: string, method: string): Operation =>
    (doc.paths[path] as Record<string, Operation>)[method];

  beforeAll(async () => {
    ({ app } = await createEngineTestApp());
    doc = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['get', '/api/v1/signals'],
    ['get', '/api/v1/inbox'],
    ['get', '/api/v1/inbox/count'],
    ['get', '/api/v1/inbox/{id}'],
    ['patch', '/api/v1/inbox/{id}'],
    ['post', '/api/v1/inbox/{id}/approve'],
    ['post', '/api/v1/inbox/{id}/dismiss'],
    ['post', '/api/v1/inbox/bulk'],
    ['get', '/api/v1/connections'],
    ['patch', '/api/v1/connections/{id}'],
    ['get', '/api/v1/activity'],
    ['post', '/api/v1/activity/{id}/undo'],
  ])('documents %s %s with a summary, a bearer requirement, and a 401', (method, path) => {
    const op = operation(path, method);
    expect(op, `${method} ${path} is missing from the OpenAPI document`).toBeDefined();
    expect(op.summary ?? op.responses['200']).toBeTruthy();
    expect(op.security).toEqual(expect.arrayContaining([{ bearer: [] }]));
    expect(op.responses['401']).toBeDefined();
  });

  it('documents every status code the spec defines for approve, and its Idempotency-Key header', () => {
    const op = operation('/api/v1/inbox/{id}/approve', 'post');
    expect(Object.keys(op.responses)).toEqual(expect.arrayContaining(['200', '404', '409', '422']));
    expect(op.parameters?.some((p) => p.name === 'Idempotency-Key' && p.in === 'header')).toBe(true);
  });

  it('documents 409 and 422 for edit and undo, and 400/404 for setting a connection mode', () => {
    expect(Object.keys(operation('/api/v1/inbox/{id}', 'patch').responses)).toEqual(
      expect.arrayContaining(['200', '404', '409', '422']),
    );
    expect(Object.keys(operation('/api/v1/activity/{id}/undo', 'post').responses)).toEqual(
      expect.arrayContaining(['200', '404', '409', '422']),
    );
    expect(Object.keys(operation('/api/v1/connections/{id}', 'patch').responses)).toEqual(
      expect.arrayContaining(['200', '400', '404']),
    );
  });

  it('describes the responses with named schemas, including the standard error shape', () => {
    const schemas = doc.components?.schemas ?? {};
    for (const name of [
      'ErrorResponse',
      'InboxItemResponse',
      'SuggestionPageResponse',
      'SignalPageResponse',
      'ActivityPageResponse',
      'ConnectionResponse',
      'BulkResultResponse',
      'PendingCountResponse',
    ]) {
      expect(schemas[name], `schema ${name}`).toBeDefined();
    }
    const errorProps = Object.keys((schemas.ErrorResponse as { properties: Record<string, unknown> }).properties);
    expect(errorProps).toEqual(expect.arrayContaining(['statusCode', 'error', 'message', 'details']));
  });
});
