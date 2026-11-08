import assert from 'node:assert/strict';
import test from 'node:test';
import { CloudSyncError, createCloudSyncClient } from './cloudSyncClient.ts';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

test('push uses same-origin credentials, no-store caching and the CSRF request header', async () => {
  const captured: Array<{ url: string; init: RequestInit }> = [];
  const client = createCloudSyncClient(async (input, init) => {
    captured.push({ url: String(input), init: init || {} });
    return jsonResponse({ results: [], serverTime: '2026-11-05T10:00:00.000Z' });
  });
  await client.push([{
    operationId: 'profile-op-0001', entityType: 'profile', entityId: 'current',
    operation: 'upsert', expectedRevision: null, payload: { id: 'current', firstName: 'Omar', lastName: 'Test' },
  }]);
  assert.equal(captured.length, 1);
  const request = captured[0];
  assert.equal(request?.url, '/api/sync/push');
  assert.equal(request?.init.credentials, 'include');
  assert.equal(request?.init.cache, 'no-store');
  assert.equal((request?.init.headers as Record<string, string>)['X-TAAMEN-Requested'], '1');
});

test('pull validates cursors and requests a no-store page', async () => {
  let capturedUrl = '';
  const client = createCloudSyncClient(async (input) => {
    capturedUrl = String(input);
    return jsonResponse({ changes: [], nextCursor: 12, hasMore: false, serverTime: '2026-11-05T10:00:00.000Z' });
  });
  const page = await client.pull(10, 50);
  assert.equal(capturedUrl, '/api/sync/pull?cursor=10&limit=50');
  assert.equal(page.nextCursor, 12);
  await assert.rejects(client.pull(-1), CloudSyncError);
  await assert.rejects(client.pull(0, 101), CloudSyncError);
});

test('API errors preserve authentication and revision conflict codes', async () => {
  const client = createCloudSyncClient(async () => jsonResponse({ error: 'A verified cloud account is required.', code: 'not_authenticated' }, 401));
  await assert.rejects(client.pull(), (error: unknown) => {
    assert.ok(error instanceof CloudSyncError);
    assert.equal(error.status, 401);
    assert.equal(error.code, 'not_authenticated');
    return true;
  });
});

test('non-JSON SPA fallbacks are not accepted as sync responses', async () => {
  const client = createCloudSyncClient(async () => new Response('<html>fallback</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
  await assert.rejects(client.pull(), (error: unknown) => error instanceof CloudSyncError && error.status === 502);
});
