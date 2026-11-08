import assert from 'node:assert/strict';
import test from 'node:test';
import { createTacticalPlansHandler, handleTacticalPlans } from './tacticalPlans.js';
import applicationWorker from './index.js';

const ORIGIN = 'https://taamen.test';
const fixedNow = () => new Date('2026-11-04T18:00:00.000Z');

function makeDocument(format = '5v5', title = 'Build from the back') {
  const perTeam = format === '5v5' ? 5 : 7;
  const players = ['home', 'away'].flatMap((team) => Array.from({ length: perTeam }, (_, index) => ({
    id: `${team}-${index + 1}`,
    team,
    number: index + 1,
    name: `${team} ${index + 1}`,
    position: { x: team === 'home' ? 0.1 + index * 0.1 : 0.9 - index * 0.1, y: 0.1 + index * 0.1 },
  })));
  return {
    format: 'taamen-tactical-plan',
    schemaVersion: 1,
    id: `draft-${format}`,
    metadata: {
      title,
      notes: 'V17 worker test plan',
      gameFormat: format,
      formation: format === '5v5' ? '1-2-1' : '2-3-1',
      createdAt: '2026-11-04T12:00:00.000Z',
      updatedAt: '2026-11-04T12:00:00.000Z',
    },
    pitch: {
      coordinateSystem: 'normalized-0-1', width: 1, height: 1,
      orientation: 'landscape', attackDirection: 'unspecified',
    },
    players,
    drawings: [
      {
        id: 'pass-1', kind: 'pass', styleToken: 'pass-solid-white',
        start: { x: 0.1, y: 0.2 }, end: { x: 0.7, y: 0.3 },
      },
      {
        id: 'curve-1', kind: 'curve', styleToken: 'curve-solid-violet',
        start: { x: 0.2, y: 0.2 }, end: { x: 0.8, y: 0.8 },
        points: [{ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.1 }, { x: 0.8, y: 0.8 }],
      },
    ],
    layerOrder: ['drawings', 'players'],
  };
}

function createFakeD1() {
  const rows = new Map();
  const users = new Set(['user-a', 'user-b']);

  function clone(row) { return row ? structuredClone(row) : null; }

  return {
    rows,
    prepare(sql) {
      let values = [];
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      return {
        bind(...args) { values = args; return this; },
        async first() {
          if (normalized.startsWith('select') && normalized.includes('where id = ? and user_id = ? and format = ?')) {
            const [id, userId, format] = values;
            const row = rows.get(id);
            return row && row.user_id === userId && row.format === format && row.deleted_at === null ? clone(row) : null;
          }
          if (normalized.startsWith('select') && normalized.includes('where id = ? and user_id = ? and deleted_at is null')) {
            const [id, userId] = values;
            const row = rows.get(id);
            return row && row.user_id === userId && row.deleted_at === null ? clone(row) : null;
          }
          return null;
        },
        async all() {
          if (normalized.startsWith('select') && normalized.includes('where user_id = ? and format = ?')) {
            const [userId, format] = values;
            const results = [...rows.values()]
              .filter((row) => row.user_id === userId && row.format === format && row.deleted_at === null)
              .sort((a, b) => a.slot_number - b.slot_number)
              .slice(0, 5).map(clone);
            return { results, success: true };
          }
          if (normalized.startsWith('insert into tactical_plans')) {
            const [id, userId, format, title, payload, createdAt, updatedAt, requestedSlotA, requestedSlotB, ownerAgain, formatAgain] = values;
            assert.equal(requestedSlotB, requestedSlotA);
            assert.equal(ownerAgain, userId);
            assert.equal(formatAgain, format);
            assert.ok(users.has(userId), 'test D1 rejects missing users FK');
            const occupied = new Set([...rows.values()]
              .filter((row) => row.user_id === userId && row.format === format && row.deleted_at === null)
              .map((row) => row.slot_number));
            const slotNumber = [1, 2, 3, 4, 5].find((slot) => (requestedSlotA === null || slot === requestedSlotA) && !occupied.has(slot));
            if (!slotNumber) return { results: [], success: true };
            const row = {
              id, user_id: userId, format, slot_number: slotNumber, title,
              schema_version: 1, payload_json: payload, revision: 1,
              created_at: createdAt, updated_at: updatedAt, deleted_at: null,
            };
            rows.set(id, row);
            return { results: [clone(row)], success: true };
          }
          if (normalized.startsWith('update tactical_plans') && normalized.includes('set title = ?, payload_json = ?')) {
            const [title, payload, updatedAt, id, userId, format, revision] = values;
            const row = rows.get(id);
            if (!row || row.user_id !== userId || row.format !== format || row.revision !== revision || row.deleted_at !== null) {
              return { results: [], success: true };
            }
            row.title = title;
            row.payload_json = payload;
            row.updated_at = updatedAt;
            row.revision += 1;
            return { results: [clone(row)], success: true };
          }
          if (normalized.startsWith('update tactical_plans') && normalized.includes('set deleted_at = ?')) {
            const [deletedAt, updatedAt, id, userId, format, revision] = values;
            const row = rows.get(id);
            if (!row || row.user_id !== userId || row.format !== format || row.revision !== revision || row.deleted_at !== null) {
              return { results: [], success: true };
            }
            row.deleted_at = deletedAt;
            row.updated_at = updatedAt;
            row.revision += 1;
            return { results: [{ id, revision: row.revision, deleted_at: deletedAt }], success: true };
          }
          throw new Error(`Unhandled fake D1 query: ${normalized}`);
        },
      };
    },
  };
}

function request(path, method = 'GET', body, extraHeaders = {}) {
  const headers = new Headers({ Origin: ORIGIN, ...extraHeaders });
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
    if (method !== 'GET' && !Object.prototype.hasOwnProperty.call(extraHeaders, 'X-TAAMEN-Requested')) headers.set('X-TAAMEN-Requested', '1');
  }
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function payload(response) {
  return response.status === 204 ? null : response.json();
}

function authenticatedHandler(db = createFakeD1(), userId = 'user-a') {
  const handler = createTacticalPlansHandler({
    resolveUser: async () => ({ id: userId, status: 'active' }),
    clock: fixedNow,
    createId: (() => { let index = 0; return () => `server-plan-${++index}`; })(),
  });
  return { handler, db };
}

test('Worker dispatches plan requests before legacy KV initialization', async () => {
  const response = await applicationWorker.fetch(request('/api/plans?format=5v5'), {});
  // No KV or D1 bindings are present. 401 means the route reached the fail-closed
  // account gate instead of failing earlier in the push/KV runtime bootstrap.
  assert.equal(response.status, 401);
  assert.equal((await payload(response)).code, 'not_authenticated');
});

test('default deployed route fails closed without a verified session; client-supplied owner is ignored', async () => {
  const response = await handleTacticalPlans(request('/api/plans', 'POST', {
    userId: 'user-a', title: 'Spoofed owner', document: makeDocument(),
  }), { TAAMEN_DB: createFakeD1() });
  assert.equal(response.status, 401);
  assert.equal((await payload(response)).code, 'not_authenticated');
});

test('create assigns server ID, stable slot, revision 1 and canonical timestamps', async () => {
  const { handler, db } = authenticatedHandler();
  const response = await handler(request('/api/plans', 'POST', { title: 'First plan', document: makeDocument() }), { TAAMEN_DB: db });
  assert.equal(response.status, 201);
  const { plan } = await payload(response);
  assert.equal(plan.id, 'server-plan-1');
  assert.equal(plan.slotNumber, 1);
  assert.equal(plan.revision, 1);
  assert.equal(plan.title, 'First plan');
  assert.equal(plan.document.id, plan.id);
  assert.equal(plan.document.metadata.createdAt, fixedNow().toISOString());
  assert.equal(plan.document.metadata.updatedAt, fixedNow().toISOString());
});

test('five-slot capacity is enforced per format; a sixth 5v5 is rejected while 7v7 remains independent', async () => {
  const { handler, db } = authenticatedHandler();
  for (let i = 1; i <= 5; i += 1) {
    const created = await handler(request('/api/plans', 'POST', { title: `Plan ${i}`, document: makeDocument('5v5', `Plan ${i}`) }), { TAAMEN_DB: db });
    assert.equal(created.status, 201);
    assert.equal((await payload(created)).plan.slotNumber, i);
  }
  const sixth = await handler(request('/api/plans', 'POST', { title: 'Sixth', document: makeDocument() }), { TAAMEN_DB: db });
  assert.equal(sixth.status, 409);
  assert.equal((await payload(sixth)).code, 'capacity_reached');
  const seven = await handler(request('/api/plans', 'POST', { title: '7v7 One', document: makeDocument('7v7') }), { TAAMEN_DB: db });
  assert.equal(seven.status, 201);
  assert.equal((await payload(seven)).plan.slotNumber, 1);
});

test('create can target a chosen empty slot while the server rejects occupied or invalid slots', async () => {
  const { handler, db } = authenticatedHandler();
  const env = { TAAMEN_DB: db };
  const first = await handler(request('/api/plans', 'POST', { title: 'Slot three', document: makeDocument('5v5', 'Slot three'), slotNumber: 3 }), env);
  assert.equal(first.status, 201);
  assert.equal((await payload(first)).plan.slotNumber, 3);

  const occupied = await handler(request('/api/plans', 'POST', { title: 'Occupied', document: makeDocument('5v5', 'Occupied'), slotNumber: 3 }), env);
  assert.equal(occupied.status, 409);
  assert.equal((await payload(occupied)).code, 'slot_occupied');

  const invalid = await handler(request('/api/plans', 'POST', { title: 'Invalid slot', document: makeDocument('5v5', 'Invalid slot'), slotNumber: 6 }), env);
  assert.equal(invalid.status, 400);
  assert.equal((await payload(invalid)).code, 'invalid_slot');

  const nullSlot = await handler(request('/api/plans', 'POST', { title: 'Null slot', document: makeDocument('5v5', 'Null slot'), slotNumber: null }), env);
  assert.equal(nullSlot.status, 400);
  assert.equal((await payload(nullSlot)).code, 'invalid_slot');
});

test('list and get are strictly scoped to the authenticated account', async () => {
  const { handler, db } = authenticatedHandler();
  const created = await handler(request('/api/plans', 'POST', { title: 'Private plan', document: makeDocument() }), { TAAMEN_DB: db });
  const plan = (await payload(created)).plan;
  const userAList = await handler(request('/api/plans?format=5v5'), { TAAMEN_DB: db });
  assert.equal((await payload(userAList)).plans.length, 1);

  const userB = authenticatedHandler(db, 'user-b').handler;
  const userBList = await userB(request('/api/plans?format=5v5'), { TAAMEN_DB: db });
  assert.equal((await payload(userBList)).plans.length, 0);
  const userBGet = await userB(request(`/api/plans/${plan.id}`), { TAAMEN_DB: db });
  assert.equal(userBGet.status, 404);
  const userAGet = await handler(request(`/api/plans/${plan.id}`), { TAAMEN_DB: db });
  assert.equal((await payload(userAGet)).plan.id, plan.id);
});

test('reads fail closed when stored document metadata drifts from indexed row metadata', async () => {
  const { handler, db } = authenticatedHandler();
  const created = await handler(request('/api/plans', 'POST', { title: 'Integrity check', document: makeDocument() }), { TAAMEN_DB: db });
  const plan = (await payload(created)).plan;
  const stored = db.rows.get(plan.id);
  stored.updated_at = '2026-11-04T19:00:00.000Z';
  const response = await handler(request(`/api/plans/${plan.id}`), { TAAMEN_DB: db });
  assert.equal(response.status, 500);
  assert.equal((await payload(response)).code, 'storage_corrupt');
});

test('rename and update require the current revision and increment it exactly once', async () => {
  const { handler, db } = authenticatedHandler();
  const created = await handler(request('/api/plans', 'POST', { title: 'Original', document: makeDocument() }), { TAAMEN_DB: db });
  const plan = (await payload(created)).plan;

  const renamedResponse = await handler(request(`/api/plans/${plan.id}`, 'PATCH', {
    format: '5v5', expectedRevision: 1, title: 'Renamed',
  }), { TAAMEN_DB: db });
  assert.equal(renamedResponse.status, 200);
  const renamed = (await payload(renamedResponse)).plan;
  assert.equal(renamed.revision, 2);
  assert.equal(renamed.slotNumber, plan.slotNumber);
  assert.equal(renamed.createdAt, plan.createdAt);
  assert.equal(renamed.title, 'Renamed');

  const staleRename = await handler(request(`/api/plans/${plan.id}`, 'PATCH', {
    format: '5v5', expectedRevision: 1, title: 'Stale rename',
  }), { TAAMEN_DB: db });
  assert.equal(staleRename.status, 409);
  assert.equal((await payload(staleRename)).code, 'revision_conflict');

  const nextDocument = makeDocument('5v5', 'Updated document');
  const updatedResponse = await handler(request(`/api/plans/${plan.id}`, 'PUT', {
    format: '5v5', expectedRevision: 2, document: nextDocument,
  }), { TAAMEN_DB: db });
  assert.equal(updatedResponse.status, 200);
  const updated = (await payload(updatedResponse)).plan;
  assert.equal(updated.revision, 3);
  assert.equal(updated.document.metadata.title, 'Updated document');
  assert.equal(updated.createdAt, plan.createdAt);
  assert.equal(updated.slotNumber, plan.slotNumber);
});

test('delete is a revision-checked tombstone and releases the permanent slot', async () => {
  const { handler, db } = authenticatedHandler();
  const created = await handler(request('/api/plans', 'POST', { title: 'Delete me', document: makeDocument() }), { TAAMEN_DB: db });
  const plan = (await payload(created)).plan;
  const staleDelete = await handler(request(`/api/plans/${plan.id}`, 'DELETE', {
    format: '5v5', expectedRevision: 9,
  }), { TAAMEN_DB: db });
  assert.equal(staleDelete.status, 409);

  const deleted = await handler(request(`/api/plans/${plan.id}`, 'DELETE', {
    format: '5v5', expectedRevision: 1,
  }), { TAAMEN_DB: db });
  assert.equal(deleted.status, 200);
  assert.equal((await payload(deleted)).id, plan.id);
  assert.equal(db.rows.get(plan.id).deleted_at, fixedNow().toISOString());

  const replacement = await handler(request('/api/plans', 'POST', { title: 'Replacement', document: makeDocument() }), { TAAMEN_DB: db });
  assert.equal((await payload(replacement)).plan.slotNumber, 1);
});

test('invalid document title types are rejected as 400 instead of becoming an internal error', async () => {
  const { handler, db } = authenticatedHandler();
  const document = makeDocument();
  document.metadata.title = 42;
  const response = await handler(request('/api/plans', 'POST', { title: 42, document }), { TAAMEN_DB: db });
  assert.equal(response.status, 400);
  assert.equal((await payload(response)).code, 'invalid_title');
  assert.equal(db.rows.size, 0);
});

test('schema, ownership fields, query shape and request bounds are validated before writes', async () => {
  const { handler, db } = authenticatedHandler();
  const extraOwner = await handler(request('/api/plans', 'POST', {
    userId: 'user-b', title: 'Owner override', document: makeDocument(),
  }), { TAAMEN_DB: db });
  assert.equal(extraOwner.status, 400);
  assert.equal((await payload(extraOwner)).code, 'unexpected_fields');

  const badFormat = await handler(request('/api/plans', 'POST', {
    title: 'Bad format', document: makeDocument('5v5'), user_id: 'user-a',
  }), { TAAMEN_DB: db });
  assert.equal(badFormat.status, 400);

  const malformed = await handler(request('/api/plans', 'POST', { title: 'Broken', document: { schemaVersion: 999 } }), { TAAMEN_DB: db });
  assert.equal(malformed.status, 400);

  const invalidQuery = await handler(request('/api/plans?format=5v5&owner=user-a'), { TAAMEN_DB: db });
  assert.equal(invalidQuery.status, 400);
  assert.equal(db.rows.size, 0);
});

test('mutations require the TAAMEN CSRF header and cross-origin requests are rejected', async () => {
  const { handler, db } = authenticatedHandler();
  const missingCsrf = await handler(request('/api/plans', 'POST', { title: 'No CSRF', document: makeDocument() }, { 'X-TAAMEN-Requested': '' }), { TAAMEN_DB: db });
  assert.equal(missingCsrf.status, 403);
  assert.equal((await payload(missingCsrf)).code, 'csrf_header_required');

  const crossOrigin = await handler(request('/api/plans', 'POST', { title: 'Cross origin', document: makeDocument() }, { Origin: 'https://evil.example' }), { TAAMEN_DB: db });
  assert.equal(crossOrigin.status, 403);
  assert.equal((await payload(crossOrigin)).code, 'origin_rejected');
  assert.equal(db.rows.size, 0);
});

test('missing D1 binding is explicit and does not fall back to local or KV storage', async () => {
  const handler = authenticatedHandler().handler;
  const response = await handler(request('/api/plans?format=5v5'), {});
  assert.equal(response.status, 503);
  assert.equal((await payload(response)).code, 'd1_unavailable');
});
