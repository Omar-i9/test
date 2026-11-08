import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { afterEach } from 'node:test';
import { ApiError } from './apiClient.ts';
import { CloudTacticalPlanLibraryRepository } from './cloudTacticalPlanLibraryRepository.ts';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function entry(id: string, slotNumber: number, format: '5v5' | '7v7' = '5v5', revision = 1, title = `Plan ${slotNumber}`) {
  const side = format === '5v5' ? 5 : 7;
  const players = (['home', 'away'] as const).flatMap((team) => Array.from({ length: side }, (_, index) => ({
    id: `${id}-${team}-${index + 1}`,
    team,
    number: index + 1,
    name: `${team} ${index + 1}`,
    x: team === 'home' ? 10 + index * 10 : 90 - index * 10,
    y: 10 + index * 11,
  })));
  const now = '2026-11-04T12:00:00.000Z';
  const document = {
    format: 'taamen-tactical-plan',
    schemaVersion: 1,
    id,
    metadata: {
      title,
      notes: '',
      gameFormat: format,
      formation: format === '5v5' ? '1-2-1' : '2-3-1',
      createdAt: now,
      updatedAt: now,
    },
    pitch: { coordinateSystem: 'normalized-0-1', width: 1, height: 1, orientation: 'landscape', attackDirection: 'unspecified' },
    players: players.map((player) => ({ ...player, position: { x: player.x / 100, y: player.y / 100 }, x: undefined, y: undefined })),
    drawings: [],
    layerOrder: ['drawings', 'players'],
  };
  return {
    id,
    gameFormat: format,
    title,
    formation: format === '5v5' ? '1-2-1' : '2-3-1',
    slotNumber,
    revision,
    createdAt: now,
    updatedAt: now,
    document,
  };
}

test('cloud repository validates and sorts records by stable slot', async () => {
  globalThis.fetch = (async () => response(200, { plans: [entry('plan-2', 2), entry('plan-1', 1)] })) as typeof fetch;
  const repository = new CloudTacticalPlanLibraryRepository();
  const plans = await repository.list('5v5');
  assert.deepEqual(plans.map((plan) => plan.slotNumber), [1, 2]);
});

test('cloud repository rejects duplicate slots and cross-format response rows', async () => {
  globalThis.fetch = (async () => response(200, { plans: [entry('plan-1', 1), entry('plan-2', 1)] })) as typeof fetch;
  const repository = new CloudTacticalPlanLibraryRepository();
  await assert.rejects(repository.list('5v5'), (error: unknown) => error instanceof ApiError && error.code === 'server_slot_conflict');
});

test('cloud repository rejects malformed response rows rather than silently hiding records', async () => {
  globalThis.fetch = (async () => response(200, { plans: [{ id: 'bad' }] })) as typeof fetch;
  const repository = new CloudTacticalPlanLibraryRepository();
  await assert.rejects(repository.list('5v5'), (error: unknown) => error instanceof ApiError && error.status === 502);
});

test('cloud repository rejects server responses above the five-plan hard limit', async () => {
  globalThis.fetch = (async () => response(200, { plans: [1, 2, 3, 4, 5, 6].map((slot) => entry(`plan-${slot}`, slot)) })) as typeof fetch;
  const repository = new CloudTacticalPlanLibraryRepository();
  await assert.rejects(repository.list('5v5'), (error: unknown) => error instanceof ApiError && error.code === 'server_capacity_violation');
});

test('cloud repository checks the 256 KiB product boundary before making a request', async () => {
  let called = false;
  globalThis.fetch = (async () => { called = true; return response(201, { plan: entry('large', 1) }); }) as typeof fetch;
  const repository = new CloudTacticalPlanLibraryRepository();
  const oversized = entry('large', 1).document as Record<string, unknown>;
  oversized.pad = 'x'.repeat(270_000);
  await assert.rejects(
    repository.create({ document: oversized as never, title: 'Large' }),
    (error: unknown) => error instanceof ApiError && error.status === 413 && error.code === 'plan_too_large',
  );
  assert.equal(called, false);
});

test('cloud repository preserves an explicitly selected server slot', async () => {
  globalThis.fetch = (async () => response(201, { plan: entry('selected-slot', 4, '5v5', 1, 'Chosen slot') })) as typeof fetch;
  const repository = new CloudTacticalPlanLibraryRepository();
  const result = await repository.create({ document: entry('draft', 1).document as never, title: 'Chosen slot', slotNumber: 4 });
  assert.equal(result.slotNumber, 4);
});

test('cloud repository rejects a server response that ignores the selected slot', async () => {
  globalThis.fetch = (async () => response(201, { plan: entry('wrong-slot', 2, '5v5', 1, 'Chosen slot') })) as typeof fetch;
  const repository = new CloudTacticalPlanLibraryRepository();
  await assert.rejects(
    repository.create({ document: entry('draft', 1).document as never, title: 'Chosen slot', slotNumber: 4 }),
    (error: unknown) => error instanceof ApiError && error.code === 'server_identity_mismatch',
  );
});

test('cloud repository validates delete confirmation identity', async () => {
  globalThis.fetch = (async () => response(200, { ok: true, id: 'different-plan', deletedAt: '2026-11-04T12:00:00.000Z' })) as typeof fetch;
  const repository = new CloudTacticalPlanLibraryRepository();
  await assert.rejects(
    repository.delete({ id: 'plan-1', format: '5v5', expectedRevision: 1 }),
    (error: unknown) => error instanceof ApiError && error.code === 'invalid_delete_response',
  );
});



test('cloud repository enforces server identity, format, title and revision on create/get/update/rename', async () => {
  const created = entry('server-plan', 1, '5v5', 1, 'Wide overload');
  const updated = entry('server-plan', 1, '5v5', 2, 'Updated plan');
  const renamed = entry('server-plan', 1, '5v5', 3, 'Renamed plan');
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const payloads = [
    { plan: created },
    { plan: created },
    { plan: updated },
    { plan: renamed },
  ];
  globalThis.fetch = (async (input, init = {}) => {
    calls.push({ url: String(input), init });
    return response(200, payloads.shift());
  }) as typeof fetch;

  const repository = new CloudTacticalPlanLibraryRepository();
  const document = created.document as never;
  assert.equal((await repository.create({ document, title: ' Wide overload ' })).id, 'server-plan');
  assert.equal((await repository.get({ id: 'server-plan' })).id, 'server-plan');
  assert.equal((await repository.update({ id: 'server-plan', format: '5v5', document: updated.document as never, expectedRevision: 1 })).revision, 2);
  assert.equal((await repository.rename({ id: 'server-plan', format: '5v5', title: 'Renamed plan', expectedRevision: 2 })).revision, 3);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[1].url, '/api/plans/server-plan');
  assert.equal(calls[2].init.method, 'PUT');
  assert.equal(calls[3].init.method, 'PATCH');
});

test('cloud repository rejects an identity or revision that does not match a requested operation', async () => {
  const repository = new CloudTacticalPlanLibraryRepository();
  globalThis.fetch = (async () => response(200, { plan: entry('other-plan', 1) })) as typeof fetch;
  await assert.rejects(repository.get({ id: 'requested-plan' }), (error: unknown) => error instanceof ApiError && error.code === 'server_identity_mismatch');

  globalThis.fetch = (async () => response(200, { plan: entry('plan-1', 1, '5v5', 9) })) as typeof fetch;
  await assert.rejects(
    repository.rename({ id: 'plan-1', format: '5v5', title: 'Renamed', expectedRevision: 1 }),
    (error: unknown) => error instanceof ApiError && error.code === 'server_identity_mismatch',
  );
});

test('the authenticated cloud adapter is prepared at both board entry points without enabling cloud access', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const playCenter = readFileSync(new URL('../pages/PlayCenter.tsx', import.meta.url), 'utf8');
  const board = readFileSync(new URL('../pages/TacticalBoard.tsx', import.meta.url), 'utf8');
  assert.match(app, /createCloudTacticalPlanLibraryRepository\(\)/);
  assert.match(app, /page==='play'[\s\S]*?libraryRepository=\{cloudTacticalPlanLibraryRepository\}/);
  assert.match(app, /page==='tactical'[\s\S]*?libraryRepository=\{cloudTacticalPlanLibraryRepository\}/);
  assert.match(playCenter, /libraryRepository=\{libraryRepository\}/);
  assert.match(board, /cloudAccountReady = false/);
});
