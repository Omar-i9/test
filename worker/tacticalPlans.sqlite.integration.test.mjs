import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createTacticalPlansHandler, handleTacticalPlans } from './tacticalPlans.js';

const migration = await readFile(new URL('../migrations/0001_create_tactical_plan_library.sql', import.meta.url), 'utf8');
const ORIGIN = 'https://taamen.test';
const FIXED_TIME = '2026-11-04T18:00:00.000Z';

function createSqliteD1() {
  const database = new DatabaseSync(':memory:');
  // D1 enables foreign keys by default; native SQLite requires this per connection.
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec(migration);
  database.prepare('INSERT INTO users (id, status, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run('account-a', 'active', FIXED_TIME, FIXED_TIME);
  database.prepare('INSERT INTO users (id, status, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run('account-b', 'active', FIXED_TIME, FIXED_TIME);

  return {
    database,
    prepare(sql) {
      let values = [];
      return {
        bind(...params) { values = params; return this; },
        async first() { return database.prepare(sql).get(...values) ?? null; },
        async all() { return { results: database.prepare(sql).all(...values), success: true }; },
      };
    },
  };
}

function document(id, format = '5v5', title = 'V17 SQLite integration') {
  const perTeam = format === '5v5' ? 5 : 7;
  const players = ['home', 'away'].flatMap((team) => Array.from({ length: perTeam }, (_, index) => ({
    id: `${id}-${team}-${index + 1}`,
    team,
    number: index + 1,
    name: `${team} ${index + 1}`,
    position: { x: team === 'home' ? 0.12 + index * 0.1 : 0.88 - index * 0.1, y: 0.1 + index * 0.11 },
  })));
  return {
    format: 'taamen-tactical-plan',
    schemaVersion: 1,
    id,
    metadata: {
      title,
      notes: 'Real SQLite-backed Worker integration test',
      gameFormat: format,
      formation: format === '5v5' ? '1-2-1' : '2-3-1',
      createdAt: FIXED_TIME,
      updatedAt: FIXED_TIME,
    },
    pitch: { coordinateSystem: 'normalized-0-1', width: 1, height: 1, orientation: 'landscape', attackDirection: 'unspecified' },
    players,
    drawings: [{
      id: `${id}-pass`, kind: 'pass', styleToken: 'pass-solid-white',
      start: { x: 0.2, y: 0.3 }, end: { x: 0.7, y: 0.65 },
    }],
    layerOrder: ['drawings', 'players'],
  };
}

function makeRequest(path, method = 'GET', body) {
  const headers = new Headers({ Origin: ORIGIN });
  if (method !== 'GET') {
    headers.set('Content-Type', 'application/json');
    headers.set('X-TAAMEN-Requested', '1');
  }
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function readResponse(response) {
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

test('real SQLite-backed Worker lifecycle enforces slots, ownership, revisions and tombstone reuse', async () => {
  const d1 = createSqliteD1();
  let activeUserId = 'account-a';
  let nextId = 0;
  const handler = createTacticalPlansHandler({
    resolveUser: async () => ({ id: activeUserId, status: 'active' }),
    clock: () => new Date(FIXED_TIME),
    createId: () => `cloud-plan-${++nextId}`,
  });
  const env = { TAAMEN_DB: d1 };

  try {
    const created = [];
    for (let index = 0; index < 5; index += 1) {
      const payload = await readResponse(await handler(makeRequest('/api/plans', 'POST', {
        title: `5v5 plan ${index + 1}`,
        document: document(`draft-${index + 1}`, '5v5', `5v5 plan ${index + 1}`),
        slotNumber: index + 1,
      }), env));
      assert.equal(payload.status, 201);
      assert.equal(payload.body.plan.slotNumber, index + 1);
      assert.equal(payload.body.plan.revision, 1);
      created.push(payload.body.plan);
    }

    const sixth = await readResponse(await handler(makeRequest('/api/plans', 'POST', {
      title: 'Sixth plan', document: document('draft-sixth', '5v5', 'Sixth plan'),
    }), env));
    assert.equal(sixth.status, 409);
    assert.equal(sixth.body.code, 'capacity_reached');

    const occupiedSlot = await readResponse(await handler(makeRequest('/api/plans', 'POST', {
      title: 'Occupied slot', document: document('draft-occupied', '5v5', 'Occupied slot'), slotNumber: 3,
    }), env));
    assert.equal(occupiedSlot.status, 409);
    assert.equal(occupiedSlot.body.code, 'slot_occupied');

    const seven = await readResponse(await handler(makeRequest('/api/plans', 'POST', {
      title: '7v7 independent', document: document('draft-7v7', '7v7', '7v7 independent'), slotNumber: 1,
    }), env));
    assert.equal(seven.status, 201);
    assert.equal(seven.body.plan.slotNumber, 1);
    assert.equal(seven.body.plan.gameFormat, '7v7');

    const listed = await readResponse(await handler(makeRequest('/api/plans?format=5v5'), env));
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body.plans.map((plan) => plan.slotNumber), [1, 2, 3, 4, 5]);

    const first = created[0];
    const fetched = await readResponse(await handler(makeRequest(`/api/plans/${first.id}`), env));
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.plan.document.drawings[0].kind, 'pass');

    const updatedDocument = document(first.id, '5v5', 'Updated tactical shape');
    const updated = await readResponse(await handler(makeRequest(`/api/plans/${first.id}`, 'PUT', {
      format: '5v5', expectedRevision: 1, document: updatedDocument,
    }), env));
    assert.equal(updated.status, 200);
    assert.equal(updated.body.plan.revision, 2);
    assert.equal(updated.body.plan.title, 'Updated tactical shape');

    const staleRename = await readResponse(await handler(makeRequest(`/api/plans/${first.id}`, 'PATCH', {
      format: '5v5', expectedRevision: 1, title: 'Stale rename',
    }), env));
    assert.equal(staleRename.status, 409);
    assert.equal(staleRename.body.code, 'revision_conflict');

    const renamed = await readResponse(await handler(makeRequest(`/api/plans/${first.id}`, 'PATCH', {
      format: '5v5', expectedRevision: 2, title: 'Renamed plan',
    }), env));
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.plan.revision, 3);
    assert.equal(renamed.body.plan.slotNumber, 1);

    activeUserId = 'account-b';
    const crossAccountFetch = await readResponse(await handler(makeRequest(`/api/plans/${first.id}`), env));
    assert.equal(crossAccountFetch.status, 404);
    const otherAccountList = await readResponse(await handler(makeRequest('/api/plans?format=5v5'), env));
    assert.equal(otherAccountList.status, 200);
    assert.equal(otherAccountList.body.plans.length, 0);

    activeUserId = 'account-a';
    const deleted = await readResponse(await handler(makeRequest(`/api/plans/${first.id}`, 'DELETE', {
      format: '5v5', expectedRevision: 3,
    }), env));
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.ok, true);

    const reused = await readResponse(await handler(makeRequest('/api/plans', 'POST', {
      title: 'Replacement slot one', document: document('draft-replacement', '5v5', 'Replacement slot one'), slotNumber: 1,
    }), env));
    assert.equal(reused.status, 201);
    assert.equal(reused.body.plan.slotNumber, 1);

    const counts = d1.database.prepare(`
      SELECT format, COUNT(*) AS total FROM tactical_plans
       WHERE user_id = 'account-a' AND deleted_at IS NULL GROUP BY format ORDER BY format
    `).all();
    assert.deepEqual(counts.map((row) => [row.format, row.total]), [['5v5', 5], ['7v7', 1]]);
  } finally {
    d1.database.close();
  }
});

test('deployed plan handler remains fail-closed until the verified session resolver is implemented', async () => {
  const d1 = createSqliteD1();
  try {
    const response = await readResponse(await handleTacticalPlans(makeRequest('/api/plans?format=5v5'), { TAAMEN_DB: d1 }));
    assert.equal(response.status, 401);
    assert.equal(response.body.code, 'not_authenticated');
  } finally {
    d1.database.close();
  }
});
