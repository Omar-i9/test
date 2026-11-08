import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, api } from './apiClient.ts';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(status: number, body: unknown, contentType = 'application/json') {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } });
}

test('sendContactMessage requires confirmed delivery from the API', async () => {
  globalThis.fetch = (async () => jsonResponse(200, { ok: true, contactSent: false })) as typeof fetch;
  await assert.rejects(
    () => api.sendContactMessage({ email: 'person@example.com', message: 'Hello there' }),
    (error: unknown) => error instanceof ApiError && error.status === 502,
  );

  globalThis.fetch = (async () => jsonResponse(200, { ok: true, contactSent: true, autoReplySent: false })) as typeof fetch;
  const result = await api.sendContactMessage({ email: 'person@example.com', message: 'Hello there' });
  assert.equal(result.contactSent, true);
  assert.equal(result.autoReplySent, false);
});

test('push configuration refuses an HTML SPA fallback', async () => {
  globalThis.fetch = (async () => new Response('<!doctype html><title>TAAMEN</title>', {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  })) as typeof fetch;
  await assert.rejects(
    () => api.pushConfig(),
    (error: unknown) => error instanceof ApiError && error.status === 502,
  );
});

test('network failures are surfaced with status zero', async () => {
  globalThis.fetch = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
  await assert.rejects(
    () => api.pushConfig(),
    (error: unknown) => error instanceof ApiError && error.status === 0,
  );
});

test('push test endpoint reports a valid delivery response', async () => {
  globalThis.fetch = (async () => jsonResponse(200, { ok: true, sent: 1, duplicate: false })) as typeof fetch;
  const result = await api.sendTestPush('subscription-1');
  assert.equal(result.ok, true);
  assert.equal(result.sent, 1);
  assert.equal(result.duplicate, false);
});

test('member recognition and general session endpoints are not exposed by the client API', () => {
  assert.equal('recognizeMember' in api, false);
  assert.equal('session' in api, false);
});

test('tactical plan API uses same-origin credentials and CSRF headers for mutations', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (input, init = {}) => {
    calls.push({ url: String(input), init });
    return jsonResponse(200, { plans: [] });
  }) as typeof fetch;

  await api.tacticalPlans.list('5v5');
  await api.tacticalPlans.rename({ id: 'plan-1', format: '5v5', title: 'New name', expectedRevision: 2 });
  await api.tacticalPlans.delete({ id: 'plan-1', format: '5v5', expectedRevision: 3 });

  assert.equal(calls[0].url, '/api/plans?format=5v5');
  assert.equal(calls[0].init.credentials, 'include');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[1].init.method, 'PATCH');
  assert.equal((calls[1].init.headers as Record<string, string>)['X-TAAMEN-Requested'], '1');
  assert.equal(calls[2].init.method, 'DELETE');
  assert.equal((calls[2].init.headers as Record<string, string>)['Content-Type'], 'application/json');
});

test('API errors retain server error codes for revision conflicts and authentication gates', async () => {
  globalThis.fetch = (async () => jsonResponse(409, {
    error: 'This plan changed elsewhere.',
    code: 'revision_conflict',
  })) as typeof fetch;
  await assert.rejects(
    api.tacticalPlans.rename({ id: 'plan-1', format: '7v7', title: 'Updated', expectedRevision: 1 }),
    (error: unknown) => error instanceof ApiError && error.status === 409 && error.code === 'revision_conflict',
  );
});
