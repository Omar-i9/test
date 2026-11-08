import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import applicationWorker, { } from './index.js';
import { createSyncEngineHandler, handleSyncEngine } from './syncEngine.js';

const migration1 = await readFile(new URL('../migrations/0001_create_tactical_plan_library.sql', import.meta.url), 'utf8');
const migration2 = await readFile(new URL('../migrations/0002_cloud_sync_engine.sql', import.meta.url), 'utf8');
const ORIGIN = 'https://taamen.test';
let timeIndex = 0;

function createSqliteD1() {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec(migration1);
  database.exec(migration2);
  database.prepare('INSERT INTO users (id, status, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run('account-a', 'active', '2026-11-05T10:00:00.000Z', '2026-11-05T10:00:00.000Z');
  database.prepare('INSERT INTO users (id, status, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run('account-b', 'active', '2026-11-05T10:00:00.000Z', '2026-11-05T10:00:00.000Z');

  return {
    database,
    prepare(sql) {
      let values = [];
      return {
        sql,
        bind(...params) { values = params; this.values = params; return this; },
        async first() { return database.prepare(sql).get(...values) ?? null; },
        async all() { return { results: database.prepare(sql).all(...values), success: true }; },
        async run() { return database.prepare(sql).run(...values); },
      };
    },
    async batch(statements) {
      database.exec('BEGIN IMMEDIATE;');
      try {
        const results = statements.map((statement) => database.prepare(statement.sql).run(...statement.values));
        database.exec('COMMIT;');
        return results;
      } catch (error) {
        database.exec('ROLLBACK;');
        throw error;
      }
    },
  };
}

function nextClock() {
  timeIndex += 1;
  return new Date(Date.UTC(2026, 10, 5, 10, 0, timeIndex));
}

function makeHandler(db, userId = 'account-a') {
  return createSyncEngineHandler({
    resolveUser: async () => ({ id: userId, status: 'active' }),
    clock: nextClock,
  });
}

function makeRequest(path, method = 'GET', body, headers = {}) {
  const requestHeaders = new Headers({ Origin: ORIGIN, ...headers });
  if (method !== 'GET') {
    requestHeaders.set('Content-Type', 'application/json');
    if (!requestHeaders.has('X-TAAMEN-Requested')) requestHeaders.set('X-TAAMEN-Requested', '1');
  }
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: requestHeaders,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function read(response) {
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

function profileOperation(operationId = 'profile-op-0001', expectedRevision = null, name = 'Omar') {
  return {
    operationId,
    entityType: 'profile',
    entityId: 'current',
    operation: 'upsert',
    expectedRevision,
    payload: { id: 'current', firstName: name, lastName: 'Test' },
  };
}

function matchPayload(id = 'local-match-0001', overrides = {}) {
  return {
    id,
    type: 'friendly',
    team1: 'TAAMEN',
    team2: 'Opponent',
    score1: 3,
    score2: 2,
    status: 'ARCHIVED',
    dateLabel: '5 November 2026',
    dateKey: 20261105,
    dateISO: '2026-11-05',
    story: 'A local test match.',
    visibility: 'LOCAL',
    source: 'local',
    createdAt: 1793872800000,
    updatedAt: 1793872800000,
    ...overrides,
  };
}

function matchOperation(operationId, payload, expectedRevision = null) {
  return {
    operationId,
    entityType: 'match',
    entityId: payload.id,
    operation: 'upsert',
    expectedRevision,
    payload,
  };
}

test('deployed sync route remains fail-closed until V19 provides verified sessions', async () => {
  const response = await read(await handleSyncEngine(makeRequest('/api/sync/pull'), { TAAMEN_DB: createSqliteD1() }));
  assert.equal(response.status, 401);
  assert.equal(response.body.code, 'not_authenticated');
});

test('Worker dispatches sync before KV bootstrap and does not initialize push storage', async () => {
  const response = await read(await applicationWorker.fetch(makeRequest('/api/sync/pull'), {}));
  assert.equal(response.status, 401);
  assert.equal(response.body.code, 'not_authenticated');
});

test('sync rejects cross-origin and missing CSRF header before reading data', async () => {
  const d1 = createSqliteD1();
  const handler = makeHandler(d1);
  const crossOrigin = new Request(`${ORIGIN}/api/sync/push`, {
    method: 'POST',
    headers: { Origin: 'https://attacker.invalid', 'Content-Type': 'application/json', 'X-TAAMEN-Requested': '1' },
    body: JSON.stringify({ operations: [profileOperation()] }),
  });
  const rejectedOrigin = await read(await handler(crossOrigin, { TAAMEN_DB: d1 }));
  assert.equal(rejectedOrigin.status, 403);
  assert.equal(rejectedOrigin.body.code, 'origin_rejected');

  const noCsrf = new Request(`${ORIGIN}/api/sync/push`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ operations: [profileOperation()] }),
  });
  const rejectedCsrf = await read(await handler(noCsrf, { TAAMEN_DB: d1 }));
  assert.equal(rejectedCsrf.status, 403);
  assert.equal(rejectedCsrf.body.code, 'csrf_header_required');
  d1.database.close();
});

test('profile upsert stores only display-name fields and rejects email, phone and image payloads', async () => {
  const d1 = createSqliteD1();
  const handler = makeHandler(d1);
  try {
    const created = await read(await handler(makeRequest('/api/sync/push', 'POST', {
      operations: [profileOperation()],
    }), { TAAMEN_DB: d1 }));
    assert.equal(created.status, 200);
    assert.equal(created.body.results[0].status, 'applied');
    assert.equal(created.body.results[0].revision, 1);

    const saved = d1.database.prepare("SELECT payload_json FROM sync_records WHERE user_id='account-a' AND entity_type='profile'").get();
    assert.deepEqual(JSON.parse(saved.payload_json), { id: 'current', firstName: 'Omar', lastName: 'Test' });

    const withEmail = profileOperation('profile-op-0002', 1);
    withEmail.payload.email = 'person@example.test';
    const rejected = await read(await handler(makeRequest('/api/sync/push', 'POST', { operations: [withEmail] }), { TAAMEN_DB: d1 }));
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.code, 'invalid_profile');
  } finally {
    d1.database.close();
  }
});

test('match records use revision compare-and-swap; stale updates become conflicts', async () => {
  const d1 = createSqliteD1();
  const handler = makeHandler(d1);
  try {
    const payload = matchPayload();
    const create = await read(await handler(makeRequest('/api/sync/push', 'POST', {
      operations: [matchOperation('match-op-0001', payload)],
    }), { TAAMEN_DB: d1 }));
    assert.equal(create.body.results[0].revision, 1);
    const initialCursor = Number(d1.database.prepare('SELECT cursor FROM sync_changes WHERE user_id = ? AND entity_id = ?').get('account-a', payload.id).cursor);

    const updatedPayload = { ...payload, story: 'Updated story', updatedAt: 1793872900000 };
    const update = await read(await handler(makeRequest('/api/sync/push', 'POST', {
      operations: [matchOperation('match-op-0002', updatedPayload, 1)],
    }), { TAAMEN_DB: d1 }));
    assert.equal(update.body.results[0].status, 'applied');
    assert.equal(update.body.results[0].revision, 2);
    const updatedCursor = Number(d1.database.prepare('SELECT cursor FROM sync_changes WHERE user_id = ? AND entity_id = ?').get('account-a', payload.id).cursor);
    assert.ok(updatedCursor > initialCursor, 'the compact per-entity change index must advance its cursor on every accepted revision');
    assert.equal(d1.database.prepare('SELECT COUNT(*) AS total FROM sync_changes WHERE user_id = ? AND entity_id = ?').get('account-a', payload.id).total, 1);

    const stale = await read(await handler(makeRequest('/api/sync/push', 'POST', {
      operations: [matchOperation('match-op-0003', { ...payload, story: 'Stale write' }, 1)],
    }), { TAAMEN_DB: d1 }));
    assert.equal(stale.status, 200);
    assert.equal(stale.body.results[0].status, 'conflict');
    assert.equal(stale.body.results[0].code, 'revision_conflict');

    const saved = d1.database.prepare("SELECT payload_json, revision FROM sync_records WHERE user_id='account-a' AND entity_type='match'").get();
    assert.equal(saved.revision, 2);
    assert.equal(JSON.parse(saved.payload_json).story, 'Updated story');
  } finally {
    d1.database.close();
  }
});

test('idempotency replays accepted operations without another revision or change event', async () => {
  const d1 = createSqliteD1();
  const handler = makeHandler(d1);
  try {
    const operation = profileOperation('profile-retry-0001');
    const first = await read(await handler(makeRequest('/api/sync/push', 'POST', { operations: [operation] }), { TAAMEN_DB: d1 }));
    const retry = await read(await handler(makeRequest('/api/sync/push', 'POST', { operations: [operation] }), { TAAMEN_DB: d1 }));
    assert.equal(first.body.results[0].status, 'applied');
    assert.equal(retry.body.results[0].status, 'applied');
    assert.equal(retry.body.results[0].replayed, true);
    assert.equal(d1.database.prepare("SELECT revision FROM sync_records WHERE entity_type='profile'").get().revision, 1);
    assert.equal(d1.database.prepare('SELECT COUNT(*) AS total FROM sync_changes').get().total, 1);

    const altered = profileOperation('profile-retry-0001', null, 'Changed');
    const mismatch = await read(await handler(makeRequest('/api/sync/push', 'POST', { operations: [altered] }), { TAAMEN_DB: d1 }));
    assert.equal(mismatch.status, 409);
    assert.equal(mismatch.body.code, 'idempotency_key_reused');
  } finally {
    d1.database.close();
  }
});

test('soft delete is synchronized as a tombstone and can be restored only with its current revision', async () => {
  const d1 = createSqliteD1();
  const handler = makeHandler(d1);
  try {
    const payload = matchPayload();
    await handler(makeRequest('/api/sync/push', 'POST', { operations: [matchOperation('match-delete-seed', payload)] }), { TAAMEN_DB: d1 });
    const deleted = await read(await handler(makeRequest('/api/sync/push', 'POST', {
      operations: [{ operationId: 'match-delete-0001', entityType: 'match', entityId: payload.id, operation: 'delete', expectedRevision: 1 }],
    }), { TAAMEN_DB: d1 }));
    assert.equal(deleted.body.results[0].status, 'applied');
    assert.equal(deleted.body.results[0].revision, 2);
    assert.ok(deleted.body.results[0].deletedAt);

    const restored = await read(await handler(makeRequest('/api/sync/push', 'POST', {
      operations: [matchOperation('match-restore-0001', { ...payload, story: 'Restored' }, 2)],
    }), { TAAMEN_DB: d1 }));
    assert.equal(restored.body.results[0].status, 'applied');
    assert.equal(restored.body.results[0].revision, 3);
    const row = d1.database.prepare("SELECT payload_json, deleted_at, revision FROM sync_records WHERE entity_type='match'").get();
    assert.equal(row.deleted_at, null);
    assert.equal(row.revision, 3);

    const deletedAgain = await read(await handler(makeRequest('/api/sync/push', 'POST', {
      operations: [{ operationId: 'match-delete-0002', entityType: 'match', entityId: payload.id, operation: 'delete', expectedRevision: 3 }],
    }), { TAAMEN_DB: d1 }));
    assert.equal(deletedAgain.body.results[0].status, 'applied');
    const tombstone = d1.database.prepare("SELECT payload_json, deleted_at FROM sync_records WHERE entity_type='match'").get();
    assert.ok(tombstone.deleted_at);
    assert.deepEqual(JSON.parse(tombstone.payload_json), { id: payload.id }, 'deleted tombstones must not retain the match text or personal details');
  } finally {
    d1.database.close();
  }
});

test('private matches are rejected by the server even if a client bypasses local filtering', async () => {
  const d1 = createSqliteD1();
  const handler = makeHandler(d1);
  try {
    const response = await read(await handler(makeRequest('/api/sync/push', 'POST', {
      operations: [matchOperation('private-match-op-01', matchPayload('private-match-0001', { visibility: 'PRIVATE' }))],
    }), { TAAMEN_DB: d1 }));
    assert.equal(response.status, 403);
    assert.equal(response.body.code, 'private_match_not_syncable');
    assert.equal(d1.database.prepare('SELECT COUNT(*) AS total FROM sync_records WHERE entity_type = ?').get('match').total, 0);
  } finally {
    d1.database.close();
  }
});

test('pull is scoped to the account, paginated by cursor and returns the latest row state per entity', async () => {
  const d1 = createSqliteD1();
  const handlerA = makeHandler(d1, 'account-a');
  const handlerB = makeHandler(d1, 'account-b');
  try {
    const first = matchPayload('local-match-0001');
    const second = matchPayload('local-match-0002', { team2: 'Different Opponent' });
    const third = matchPayload('local-match-0003', { team2: 'Third Opponent' });
    await handlerA(makeRequest('/api/sync/push', 'POST', { operations: [
      matchOperation('pull-op-0001', first),
      matchOperation('pull-op-0002', second),
      matchOperation('pull-op-0003', third),
    ] }), { TAAMEN_DB: d1 });
    await handlerA(makeRequest('/api/sync/push', 'POST', {
      operations: [matchOperation('pull-op-0004', { ...first, story: 'A newer version' }, 1)],
    }), { TAAMEN_DB: d1 });

    const page = await read(await handlerA(makeRequest('/api/sync/pull?cursor=0&limit=2'), { TAAMEN_DB: d1 }));
    assert.equal(page.status, 200);
    assert.equal(page.body.hasMore, true);
    assert.equal(page.body.changes.length, 2);
    assert.equal(d1.database.prepare('SELECT COUNT(*) AS total FROM sync_changes WHERE user_id = ?').get('account-a').total, 3);

    const next = await read(await handlerA(makeRequest(`/api/sync/pull?cursor=${page.body.nextCursor}&limit=2`), { TAAMEN_DB: d1 }));
    assert.equal(next.body.hasMore, false);
    assert.ok(next.body.nextCursor > page.body.nextCursor);
    const firstChange = next.body.changes.find((change) => change.entityId === first.id);
    assert.equal(firstChange.revision, 2);
    assert.equal(firstChange.payload.story, 'A newer version');

    const otherAccountCreate = await read(await handlerB(makeRequest('/api/sync/push', 'POST', {
      operations: [profileOperation('account-b-profile-01', null, 'Other')],
    }), { TAAMEN_DB: d1 }));
    assert.equal(otherAccountCreate.body.results[0].status, 'applied');
    const otherAccount = await read(await handlerB(makeRequest('/api/sync/pull?cursor=0'), { TAAMEN_DB: d1 }));
    assert.equal(otherAccount.body.changes.length, 1);
    assert.equal(otherAccount.body.changes[0].cursor, 1, 'each account has an isolated cursor sequence');
    assert.equal(d1.database.prepare('SELECT last_cursor FROM sync_cursor_state WHERE user_id = ?').get('account-a').last_cursor, 4);
    assert.equal(d1.database.prepare('SELECT last_cursor FROM sync_cursor_state WHERE user_id = ?').get('account-b').last_cursor, 1);
  } finally {
    d1.database.close();
  }
});

test('sync limits batch size, rejects private request fields and refuses non-local source records', async () => {
  const d1 = createSqliteD1();
  const handler = makeHandler(d1);
  try {
    const tooMany = await read(await handler(makeRequest('/api/sync/push', 'POST', {
      operations: Array.from({ length: 26 }, (_, index) => profileOperation(`profile-batch-${String(index).padStart(4, '0')}`)),
    }), { TAAMEN_DB: d1 }));
    assert.equal(tooMany.status, 400);
    assert.equal(tooMany.body.code, 'invalid_operations');

    const legacy = matchPayload('legacy-match-0001', { source: 'legacy' });
    const rejected = await read(await handler(makeRequest('/api/sync/push', 'POST', {
      operations: [matchOperation('legacy-sync-0001', legacy)],
    }), { TAAMEN_DB: d1 }));
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.code, 'unsupported_match_source');
  } finally {
    d1.database.close();
  }
});

test('pull rejects a cursor ahead of the latest account cursor with a recoverable reset code', async () => {
  const d1 = createSqliteD1();
  const handler = makeHandler(d1);
  try {
    const response = await read(await handler(makeRequest('/api/sync/pull?cursor=999'), { TAAMEN_DB: d1 }));
    assert.equal(response.status, 409);
    assert.equal(response.body.code, 'cursor_ahead');
  } finally {
    d1.database.close();
  }
});

test('sync rejects a missing Origin header on writes', async () => {
  const d1 = createSqliteD1();
  const handler = makeHandler(d1);
  try {
    const request = new Request(`${ORIGIN}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-TAAMEN-Requested': '1' },
      body: JSON.stringify({ operations: [profileOperation()] }),
    });
    const response = await read(await handler(request, { TAAMEN_DB: d1 }));
    assert.equal(response.status, 403);
    assert.equal(response.body.code, 'origin_required');
  } finally {
    d1.database.close();
  }
});

test('match dates must be real calendar dates, not normalized invalid dates', async () => {
  const d1 = createSqliteD1();
  const handler = makeHandler(d1);
  try {
    const invalid = matchPayload('invalid-date-match', { dateISO: '2026-02-31' });
    const response = await read(await handler(makeRequest('/api/sync/push', 'POST', {
      operations: [matchOperation('invalid-date-op-01', invalid)],
    }), { TAAMEN_DB: d1 }));
    assert.equal(response.status, 400);
    assert.equal(response.body.code, 'invalid_match');
  } finally {
    d1.database.close();
  }
});

test('pull query rejects invalid cursor, duplicate parameters and oversized page limits', async () => {
  const d1 = createSqliteD1();
  const handler = makeHandler(d1);
  try {
    for (const path of ['/api/sync/pull?cursor=-1', '/api/sync/pull?cursor=0&cursor=1', '/api/sync/pull?limit=101']) {
      const result = await read(await handler(makeRequest(path), { TAAMEN_DB: d1 }));
      assert.equal(result.status, 400);
      assert.equal(result.body.code, 'invalid_query');
    }
  } finally {
    d1.database.close();
  }
});

test('expired idempotency metadata is pruned while current record state remains available', async () => {
  const d1 = createSqliteD1();
  const handler = makeHandler(d1);
  try {
    d1.database.prepare(`
      INSERT INTO sync_operations (user_id, operation_id, request_hash, result_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('account-a', 'expired-operation-001', 'a'.repeat(64), JSON.stringify({ status: 'applied' }), '2026-10-01T00:00:00.000Z');

    const created = await read(await handler(makeRequest('/api/sync/push', 'POST', {
      operations: [profileOperation('retention-profile-0001')],
    }), { TAAMEN_DB: d1 }));
    assert.equal(created.status, 200);
    assert.equal(d1.database.prepare('SELECT COUNT(*) AS total FROM sync_operations WHERE operation_id = ?').get('expired-operation-001').total, 0);
    assert.equal(d1.database.prepare("SELECT COUNT(*) AS total FROM sync_records WHERE entity_type = 'profile'").get().total, 1);
  } finally {
    d1.database.close();
  }
});

test('fixed-window rate limit caps each verified account at 60 sync requests per minute', async () => {
  const d1 = createSqliteD1();
  const handler = createSyncEngineHandler({
    resolveUser: async () => ({ id: 'account-a', status: 'active' }),
    clock: () => new Date('2026-11-05T11:00:00.000Z'),
  });
  try {
    for (let index = 0; index < 60; index += 1) {
      const response = await read(await handler(makeRequest('/api/sync/pull'), { TAAMEN_DB: d1 }));
      assert.equal(response.status, 200);
    }
    const limited = await read(await handler(makeRequest('/api/sync/pull'), { TAAMEN_DB: d1 }));
    assert.equal(limited.status, 429);
    assert.equal(limited.body.code, 'sync_rate_limited');
  } finally {
    d1.database.close();
  }
});

test('same-millisecond stale updates cannot be mistaken for successful writes', async () => {
  const d1 = createSqliteD1();
  const sameTime = new Date('2026-11-05T12:00:00.000Z');
  const handler = createSyncEngineHandler({
    resolveUser: async () => ({ id: 'account-a', status: 'active' }),
    clock: () => sameTime,
  });
  try {
    const payload = matchPayload();
    const created = await read(await handler(makeRequest('/api/sync/push', 'POST', {
      operations: [matchOperation('same-ms-create-01', payload)],
    }), { TAAMEN_DB: d1 }));
    assert.equal(created.body.results[0].status, 'applied');

    const fresh = await read(await handler(makeRequest('/api/sync/push', 'POST', {
      operations: [matchOperation('same-ms-update-01', { ...payload, story: 'Fresh' }, 1)],
    }), { TAAMEN_DB: d1 }));
    assert.equal(fresh.body.results[0].status, 'applied');

    const stale = await read(await handler(makeRequest('/api/sync/push', 'POST', {
      operations: [matchOperation('same-ms-stale-01', { ...payload, story: 'Stale' }, 1)],
    }), { TAAMEN_DB: d1 }));
    assert.equal(stale.body.results[0].status, 'conflict');
    assert.equal(d1.database.prepare("SELECT COUNT(*) AS total FROM sync_changes WHERE entity_id = ?").get(payload.id).total, 1);
    assert.equal(d1.database.prepare("SELECT payload_json FROM sync_records WHERE entity_id = ?").get(payload.id).payload_json.includes('Fresh'), true);
  } finally {
    d1.database.close();
  }
});
