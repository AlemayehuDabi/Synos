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

describe('Fitness: OpenAPI (e2e)', () => {
  let app: INestApplication;
  let doc: OpenAPIObject;

  const operation = (path: string, method: string): Operation => (doc.paths[path] as Record<string, Operation>)[method];
  const statuses = (path: string, method: string) => Object.keys(operation(path, method).responses);
  const queryNames = (path: string) =>
    (operation(path, 'get').parameters ?? []).filter((p) => p.in === 'query').map((p) => p.name).sort();
  const hasIdempotencyHeader = (path: string, method: string) =>
    operation(path, method).parameters?.some((p) => p.name === 'Idempotency-Key' && p.in === 'header') ?? false;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    doc = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['get', '/api/v1/workouts'],
    ['post', '/api/v1/workouts'],
    ['get', '/api/v1/workouts/{id}'],
    ['patch', '/api/v1/workouts/{id}'],
    ['delete', '/api/v1/workouts/{id}'],
    ['post', '/api/v1/workouts/{id}/complete'],
    ['get', '/api/v1/exercises'],
    ['post', '/api/v1/exercises'],
    ['get', '/api/v1/programs'],
    ['post', '/api/v1/programs'],
    ['get', '/api/v1/programs/{id}'],
    ['patch', '/api/v1/programs/{id}'],
    ['delete', '/api/v1/programs/{id}'],
    ['post', '/api/v1/programs/{id}/activate'],
    ['get', '/api/v1/body-metrics'],
    ['post', '/api/v1/body-metrics'],
    ['patch', '/api/v1/body-metrics/{id}'],
    ['delete', '/api/v1/body-metrics/{id}'],
    ['post', '/api/v1/wearables/samples'],
    ['get', '/api/v1/wearables/sleep'],
  ])('documents %s %s with a summary, a bearer requirement and a 401', (method, path) => {
    const op = operation(path, method);
    expect(op, `${method} ${path} is missing from the OpenAPI document`).toBeDefined();
    expect(op.summary).toBeTruthy();
    expect(op.security).toEqual(expect.arrayContaining([{ bearer: [] }]));
    expect(op.responses['401']).toBeDefined();
  });

  it('documents the create/update error responses, including 409 on a duplicate workout id', () => {
    expect(statuses('/api/v1/workouts', 'post')).toEqual(expect.arrayContaining(['201', '400', '401', '409']));
    expect(statuses('/api/v1/workouts', 'post')).not.toContain('200');
    expect(statuses('/api/v1/workouts/{id}', 'get')).toEqual(expect.arrayContaining(['200', '400', '401', '404']));
    expect(statuses('/api/v1/workouts/{id}', 'patch')).toEqual(expect.arrayContaining(['200', '400', '401', '404']));
    expect(statuses('/api/v1/workouts/{id}', 'delete')).toEqual(expect.arrayContaining(['204', '400', '401', '404']));
    expect(statuses('/api/v1/workouts/{id}/complete', 'post')).toEqual(expect.arrayContaining(['200', '400', '401', '404', '409']));
    expect(statuses('/api/v1/exercises', 'post')).toEqual(expect.arrayContaining(['201', '400', '401', '409']));
    expect(statuses('/api/v1/programs/{id}/activate', 'post')).toEqual(expect.arrayContaining(['200', '401', '404']));
    expect(statuses('/api/v1/body-metrics/{id}', 'delete')).toEqual(expect.arrayContaining(['204', '401', '404']));
    expect(statuses('/api/v1/wearables/samples', 'post')).toEqual(expect.arrayContaining(['200', '400', '401']));
    expect(statuses('/api/v1/wearables/sleep', 'get')).toEqual(expect.arrayContaining(['200', '400', '401']));
  });

  it('documents the Idempotency-Key header on every POST that creates or ingests', () => {
    for (const path of ['/api/v1/workouts', '/api/v1/workouts/{id}/complete', '/api/v1/exercises', '/api/v1/programs', '/api/v1/body-metrics', '/api/v1/wearables/samples']) {
      expect(hasIdempotencyHeader(path, 'post'), path).toBe(true);
    }
  });

  it('documents the list query parameters', () => {
    expect(queryNames('/api/v1/workouts')).toEqual(['completed', 'cursor', 'from', 'limit', 'to', 'workoutType']);
    expect(queryNames('/api/v1/exercises')).toEqual(['category', 'cursor', 'isCustom', 'limit', 'muscleGroup', 'q']);
    expect(queryNames('/api/v1/programs')).toEqual(['cursor', 'isActive', 'limit']);
    expect(queryNames('/api/v1/body-metrics')).toEqual(['cursor', 'from', 'limit', 'to']);
    expect(queryNames('/api/v1/wearables/sleep')).toEqual(['from', 'to']);
  });

  it('describes the responses with named schemas, including the standard error shape', () => {
    const schemas = doc.components?.schemas ?? {};
    for (const name of [
      'ErrorResponse',
      'WorkoutResponse',
      'WorkoutPageResponse',
      'WorkoutExerciseResponse',
      'WorkoutSetResponse',
      'ExerciseResponse',
      'ExercisePageResponse',
      'ProgramResponse',
      'ProgramPageResponse',
      'ProgramWorkoutResponse',
      'BodyMetricResponse',
      'BodyMetricPageResponse',
      'IngestSamplesResponse',
      'SleepResponse',
      'SleepNightResponse',
    ]) {
      expect(schemas[name], `schema ${name}`).toBeDefined();
    }
  });

  it('documents the enums a client has to send', () => {
    const schemas = doc.components?.schemas as Record<string, { properties?: Record<string, { enum?: string[]; items?: { enum?: string[] } }> }>;
    expect(schemas.WorkoutResponse.properties?.source?.enum).toEqual(['manual', 'suggestion', 'auto', 'sync']);
    expect(schemas.ExerciseResponse.properties?.category?.enum).toEqual(['strength', 'cardio', 'flexibility', 'mobility', 'sports', 'other']);
    expect(schemas.WearableSampleDto.properties?.type?.enum).toEqual(['steps', 'sleep', 'heartRate', 'activeEnergy', 'workout']);
  });
});
