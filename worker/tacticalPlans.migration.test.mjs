import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const migration = await readFile(new URL('../migrations/0001_create_tactical_plan_library.sql', import.meta.url), 'utf8');

function database() {
  const db = new DatabaseSync(':memory:');
  // Native SQLite defaults foreign-key enforcement off; D1 enables it by default.
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(migration);
  db.prepare('INSERT INTO users (id, status, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run('user-a', 'active', '2026-11-04T12:00:00.000Z', '2026-11-04T12:00:00.000Z');
  db.prepare('INSERT INTO users (id, status, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run('user-b', 'active', '2026-11-04T12:00:00.000Z', '2026-11-04T12:00:00.000Z');
  return db;
}

function plan(id, format = '5v5', title = 'SQLite test') {
  return JSON.stringify({
    format: 'taamen-tactical-plan',
    schemaVersion: 1,
    id,
    metadata: {
      title, notes: '', gameFormat: format,
      formation: format === '5v5' ? '1-2-1' : '2-3-1',
      createdAt: '2026-11-04T12:00:00.000Z',
      updatedAt: '2026-11-04T12:00:00.000Z',
    },
    pitch: { coordinateSystem: 'normalized-0-1', width: 1, height: 1, orientation: 'landscape', attackDirection: 'unspecified' },
    players: [],
    drawings: [],
    layerOrder: ['drawings', 'players'],
  });
}

function insertPlan(db, { id, userId = 'user-a', format = '5v5', slot, title = 'SQLite test', payload = plan(id, format, title) }) {
  return db.prepare(`
    INSERT INTO tactical_plans (
      id, user_id, format, slot_number, title, schema_version, payload_json,
      revision, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, 1, ?, ?)
  `).run(id, userId, format, slot, title, payload, '2026-11-04T12:00:00.000Z', '2026-11-04T12:00:00.000Z');
}

test('D1 migration applies cleanly and relies on D1 default foreign-key enforcement', () => {
  assert.doesNotMatch(migration, /PRAGMA\s+foreign_keys\s*=/i);
  const db = database();
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
  assert.ok(tables.includes('users'));
  assert.ok(tables.includes('tactical_plans'));
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((row) => row.name);
  assert.ok(indexes.includes('uq_tactical_plans_active_slot'));
  db.close();
});

test('foreign keys prevent plans from being attached to nonexistent accounts', () => {
  const db = database();
  assert.throws(() => insertPlan(db, { id: 'orphan', userId: 'missing-user', slot: 1 }), /FOREIGN KEY constraint failed/);
  db.close();
});

test('partial unique slot index is independent by user and format and permits reuse after soft delete', () => {
  const db = database();
  insertPlan(db, { id: 'a-5v5-slot-1', slot: 1 });
  assert.throws(() => insertPlan(db, { id: 'a-5v5-duplicate-slot-1', slot: 1 }), /UNIQUE constraint failed/);
  insertPlan(db, { id: 'a-7v7-slot-1', format: '7v7', slot: 1, title: '7v7 test', payload: plan('a-7v7-slot-1', '7v7', '7v7 test') });
  insertPlan(db, { id: 'b-5v5-slot-1', userId: 'user-b', slot: 1 });
  db.prepare("UPDATE tactical_plans SET deleted_at = '2026-11-04T13:00:00.000Z', revision = revision + 1 WHERE id = ?")
    .run('a-5v5-slot-1');
  insertPlan(db, { id: 'a-5v5-replacement-slot-1', slot: 1 });
  assert.equal(db.prepare("SELECT count(*) AS count FROM tactical_plans WHERE user_id = 'user-a' AND format = '5v5' AND deleted_at IS NULL").get().count, 1);
  assert.equal(db.prepare("SELECT count(*) AS count FROM tactical_plans WHERE user_id = 'user-a' AND format = '7v7' AND deleted_at IS NULL").get().count, 1);
  assert.equal(db.prepare("SELECT count(*) AS count FROM tactical_plans WHERE user_id = 'user-b' AND format = '5v5' AND deleted_at IS NULL").get().count, 1);
  db.close();
});

test('payload checks reject invalid JSON, mismatched IDs, formats and over-limit UTF-8 payloads', () => {
  const db = database();
  assert.throws(() => insertPlan(db, { id: 'bad-json', slot: 1, payload: '{' }), /CHECK constraint failed/);
  assert.throws(() => insertPlan(db, { id: 'wrong-id', slot: 1, payload: plan('another-id') }), /CHECK constraint failed/);
  assert.throws(() => insertPlan(db, { id: 'wrong-format', slot: 1, format: '5v5', title: 'Wrong', payload: plan('wrong-format', '7v7', 'Wrong') }), /CHECK constraint failed/);
  assert.throws(() => insertPlan(db, { id: 'too-large', slot: 1, title: 'x'.repeat(70), payload: JSON.stringify({ ...JSON.parse(plan('too-large')), pad: 'x'.repeat(270_000) }) }), /CHECK constraint failed/);
  db.close();
});


test('server first-free-slot INSERT SELECT statement is valid SQLite and returns server-assigned slots', () => {
  const db = database();
  const createSql = `
    INSERT INTO tactical_plans (
      id, user_id, format, slot_number, title, schema_version,
      payload_json, revision, created_at, updated_at
    )
    SELECT ?, ?, ?, candidate.slot_number, ?, 1, ?, 1, ?, ?
      FROM (
        SELECT 1 AS slot_number UNION ALL SELECT 2 UNION ALL SELECT 3
        UNION ALL SELECT 4 UNION ALL SELECT 5
      ) AS candidate
     WHERE (? IS NULL OR candidate.slot_number = ?)
       AND NOT EXISTS (
       SELECT 1 FROM tactical_plans existing
        WHERE existing.user_id = ? AND existing.format = ?
          AND existing.slot_number = candidate.slot_number AND existing.deleted_at IS NULL
     )
     ORDER BY candidate.slot_number ASC
     LIMIT 1
    RETURNING id, user_id, format, slot_number, title, schema_version,
              payload_json, revision, created_at, updated_at, deleted_at
  `;
  const create = db.prepare(createSql);
  for (let slot = 1; slot <= 5; slot += 1) {
    const id = `statement-plan-${slot}`;
    const result = create.all(id, 'user-a', '5v5', `Plan ${slot}`, plan(id, '5v5', `Plan ${slot}`),
      '2026-11-04T12:00:00.000Z', '2026-11-04T12:00:00.000Z', null, null, 'user-a', '5v5');
    assert.equal(result.length, 1);
    assert.equal(result[0].slot_number, slot);
  }
  const sixth = create.all('statement-plan-6', 'user-a', '5v5', 'Sixth', plan('statement-plan-6'),
    '2026-11-04T12:00:00.000Z', '2026-11-04T12:00:00.000Z', null, null, 'user-a', '5v5');
  assert.equal(sixth.length, 0);
  db.close();
});

test('revision compare-and-swap rejects stale updates', () => {
  const db = database();
  insertPlan(db, { id: 'revision-plan', slot: 1 });
  const stale = db.prepare(`
    UPDATE tactical_plans SET title = ?, payload_json = ?, revision = revision + 1
     WHERE id = ? AND user_id = ? AND revision = ? AND deleted_at IS NULL
  `).run('Stale', plan('revision-plan', '5v5', 'Stale'), 'revision-plan', 'user-a', 7);
  assert.equal(Number(stale.changes), 0);
  const fresh = db.prepare(`
    UPDATE tactical_plans SET title = ?, payload_json = ?, revision = revision + 1
     WHERE id = ? AND user_id = ? AND revision = ? AND deleted_at IS NULL
  `).run('Fresh', plan('revision-plan', '5v5', 'Fresh'), 'revision-plan', 'user-a', 1);
  assert.equal(Number(fresh.changes), 1);
  assert.equal(db.prepare('SELECT revision FROM tactical_plans WHERE id = ?').get('revision-plan').revision, 2);
  db.close();
});
