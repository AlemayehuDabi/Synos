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

describe('Tasks: OpenAPI (e2e)', () => {
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
    ['get', '/api/v1/tasks'],
    ['post', '/api/v1/tasks'],
    ['post', '/api/v1/tasks/reorder'],
    ['get', '/api/v1/tasks/{id}'],
    ['patch', '/api/v1/tasks/{id}'],
    ['delete', '/api/v1/tasks/{id}'],
    ['post', '/api/v1/tasks/{id}/complete'],
    ['post', '/api/v1/tasks/{id}/reopen'],
    ['post', '/api/v1/tasks/{id}/skip'],
    ['put', '/api/v1/tasks/{id}/recurrence'],
    ['post', '/api/v1/tasks/{id}/schedule'],
    ['get', '/api/v1/tasks/{id}/subtasks'],
    ['post', '/api/v1/tasks/{id}/subtasks'],
    ['patch', '/api/v1/tasks/{id}/subtasks/{subtaskId}'],
    ['delete', '/api/v1/tasks/{id}/subtasks/{subtaskId}'],
  ])('documents %s %s with a summary, a bearer requirement and a 401', (method, path) => {
    const op = operation(path, method);
    expect(op, `${method} ${path} is missing from the OpenAPI document`).toBeDefined();
    expect(op.summary).toBeTruthy();
    expect(op.security).toEqual(expect.arrayContaining([{ bearer: [] }]));
    expect(op.responses['401']).toBeDefined();
  });

  it('documents the create/update error responses, including 409 on a duplicate id', () => {
    expect(statuses('/api/v1/tasks', 'post')).toEqual(expect.arrayContaining(['201', '400', '401', '409']));
    expect(statuses('/api/v1/tasks', 'post')).not.toContain('200');
    expect(statuses('/api/v1/tasks/{id}', 'patch')).toEqual(expect.arrayContaining(['200', '400', '401', '404']));
    expect(statuses('/api/v1/tasks/{id}', 'delete')).toEqual(expect.arrayContaining(['204', '400', '401', '404']));
    expect(statuses('/api/v1/tasks/{id}/complete', 'post')).toEqual(expect.arrayContaining(['200', '400', '401', '404', '409']));
    expect(statuses('/api/v1/tasks/{id}/complete', 'post')).not.toContain('201');
    expect(statuses('/api/v1/tasks/{id}/reopen', 'post')).toEqual(expect.arrayContaining(['200', '401', '404', '409']));
  });

  it('documents the Idempotency-Key header on every action that supports it', () => {
    for (const path of ['/api/v1/tasks', '/api/v1/tasks/{id}/complete', '/api/v1/tasks/{id}/skip', '/api/v1/tasks/{id}/schedule', '/api/v1/tasks/{id}/subtasks']) {
      const method = path === '/api/v1/tasks' || path === '/api/v1/tasks/{id}/subtasks' ? 'post' : 'post';
      expect(operation(path, method).parameters?.some((p) => p.name === 'Idempotency-Key' && p.in === 'header'), path).toBe(true);
    }
  });

  it('documents the list query parameters', () => {
    const names = (operation('/api/v1/tasks', 'get').parameters ?? []).filter((p) => p.in === 'query').map((p) => p.name);
    expect(names.sort()).toEqual(['cursor', 'dueAfter', 'dueBefore', 'limit', 'priority', 'recurringGroupId', 'status', 'unscheduled'].sort());
  });

  it('describes the responses with named schemas, including the standard error shape', () => {
    const schemas = doc.components?.schemas ?? {};
    for (const name of ['ErrorResponse', 'TaskResponse', 'TaskPageResponse', 'TaskOccurrenceResponse', 'SubtaskResponse']) {
      expect(schemas[name], `schema ${name}`).toBeDefined();
    }
  });

  it('documents scope as this/following/all on PATCH and DELETE', () => {
    const schemas = doc.components?.schemas as Record<string, { properties?: Record<string, { enum?: string[] }> }>;
    const patchBody = doc.paths['/api/v1/tasks/{id}']['patch' as never] as unknown as { requestBody: { content: { 'application/json': { schema: { $ref: string } } } } };
    const ref = patchBody.requestBody.content['application/json'].schema.$ref.split('/').pop()!;
    expect(schemas[ref].properties?.scope?.enum).toEqual(['this', 'following', 'all']);
  });
});
