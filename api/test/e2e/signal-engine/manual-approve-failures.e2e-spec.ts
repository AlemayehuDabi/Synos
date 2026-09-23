import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, type SentMail, signUpAndVerify, type TestUser } from '../helpers.js';
import { createEngineTestApp, emitGroceryCost } from './support.js';
import type { SignalEngineFacade } from '../../../src/signal-engine/signal-engine.facade.js';

describe('Signal engine: manual approve failure modes (e2e)', () => {
  let app: INestApplication;
  let sentMails: SentMail[];
  let facade: SignalEngineFacade;
  let user: TestUser;

  beforeAll(async () => {
    ({ app, sentMails, facade } = await createEngineTestApp());
    user = await signUpAndVerify(app, sentMails);
  });

  afterAll(async () => {
    await app.close();
  });

  async function pendingSuggestionFor(billIdPrefix: string) {
    const { payload } = await emitGroceryCost(facade, user.userId, billIdPrefix);
    const inboxRes = await request(app.getHttpServer()).get('/api/v1/inbox').set(bearer(user.token)).expect(200);
    return inboxRes.body.items.find((s: { targetKey: string }) => s.targetKey === `sandbox:grocery:${payload.groceryListId}`);
  }

  it('approving a suggestion whose handler conflicts returns 409 and marks it superseded', async () => {
    const suggestion = await pendingSuggestionFor('conflict-');

    await request(app.getHttpServer()).post(`/api/v1/inbox/${suggestion.id}/approve`).set(bearer(user.token)).expect(409);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/inbox/${suggestion.id}`)
      .set(bearer(user.token))
      .expect(200);
    expect(detail.body.status).toBe('superseded');
  });

  it('approving a suggestion whose handler throws returns 422, marks it failed, and writes no partial activity', async () => {
    const suggestion = await pendingSuggestionFor('throws-');

    await request(app.getHttpServer()).post(`/api/v1/inbox/${suggestion.id}/approve`).set(bearer(user.token)).expect(422);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/inbox/${suggestion.id}`)
      .set(bearer(user.token))
      .expect(200);
    expect(detail.body.status).toBe('failed');
    expect(detail.body.failureNote).toContain('sandbox handler intentionally threw');

    const noApprovedActivity = detail.body.statusHistory.filter((a: { kind: string }) => a.kind === 'suggestion_approved');
    expect(noApprovedActivity).toHaveLength(0);
  });

  it('exactly one of two concurrent approves succeeds; the other gets 409', async () => {
    const suggestion = await pendingSuggestionFor('');

    const [first, second] = await Promise.all([
      request(app.getHttpServer()).post(`/api/v1/inbox/${suggestion.id}/approve`).set(bearer(user.token)),
      request(app.getHttpServer()).post(`/api/v1/inbox/${suggestion.id}/approve`).set(bearer(user.token)),
    ]);

    const statuses = [first.status, second.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);
  });

  it('bulk approve/dismiss reports per-id results with partial success', async () => {
    const ok = await pendingSuggestionFor('');
    const alreadyDismissed = await pendingSuggestionFor('');
    await request(app.getHttpServer())
      .post(`/api/v1/inbox/${alreadyDismissed.id}/dismiss`)
      .set(bearer(user.token))
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/api/v1/inbox/bulk')
      .set(bearer(user.token))
      .send({ action: 'approve', ids: [ok.id, alreadyDismissed.id] })
      .expect(200);

    const byId = new Map(res.body.map((r: { id: string; status: string }) => [r.id, r.status]));
    expect(byId.get(ok.id)).toBe('ok');
    expect(byId.get(alreadyDismissed.id)).toBe('error');
  });
});
