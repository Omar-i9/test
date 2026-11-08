import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_TACTICAL_PLAN_JSON_BYTES,
  TACTICAL_PLAN_FORMAT,
  TACTICAL_PLAN_SCHEMA_VERSION,
  TacticalPlanValidationError,
  isTacticalPlanDocument,
  parseTacticalPlan,
  parseTacticalPlanJson,
  restoreTacticalPlan,
  serializeTacticalPlan,
  type TacticalBoardState,
  type TacticalPlanGameFormat,
} from './tacticalPlanSchema.ts';

const formations: Record<TacticalPlanGameFormat, string> = { '5v5': '1-2-1', '7v7': '2-3-1' };

function board(format: TacticalPlanGameFormat): TacticalBoardState {
  const size = format === '5v5' ? 5 : 7;
  const players = (['home', 'away'] as const).flatMap((team) => Array.from({ length: size }, (_, index) => ({
    id: `${team}-${index + 1}`,
    team,
    number: index + 1,
    name: `${team}-${index + 1}`,
    x: team === 'home' ? 8 + index * 11.25 : 92 - index * 11.25,
    y: 8 + index * 13.4,
  })));
  return {
    id: `plan-v3-${format}`,
    gameFormat: format,
    formation: formations[format],
    title: `Test ${format}`,
    notes: 'Preserve full pitch geometry.',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-04T10:00:00.000Z',
    players,
    drawings: [
      { id: 'pass-1', kind: 'pass', x1: 130, y1: 145, x2: 680, y2: 310 },
      { id: 'run-1', kind: 'run', x1: 200, y1: 400, x2: 750, y2: 90 },
      { id: 'press-1', kind: 'press', x1: 440, y1: 250, x2: 590, y2: 170 },
      { id: 'curve-1', kind: 'curve', x1: 170, y1: 230, x2: 650, y2: 380, points: [{ x: 170, y: 230 }, { x: 388, y: 180 }, { x: 650, y: 380 }] },
      { id: 'multi-1', kind: 'multiCurve', x1: 90, y1: 80, x2: 810, y2: 470, points: [{ x: 90, y: 80 }, { x: 210, y: 150 }, { x: 360, y: 110 }, { x: 520, y: 350 }, { x: 810, y: 470 }] },
      { id: 'zone-1', kind: 'zone', x1: 300, y1: 120, x2: 520, y2: 390 },
    ],
  };
}

function closeTo(actual: number, expected: number, epsilon = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} differs from ${expected}`);
}

for (const format of ['5v5', '7v7'] as const) {
  test(`${format}: serializer stores every player and drawing in normalized coordinates`, () => {
    const source = board(format);
    const document = serializeTacticalPlan(source, new Date('2026-11-04T12:00:00.000Z'));
    assert.equal(document.format, TACTICAL_PLAN_FORMAT);
    assert.equal(document.schemaVersion, TACTICAL_PLAN_SCHEMA_VERSION);
    assert.equal(document.metadata.gameFormat, format);
    assert.equal(document.players.length, format === '5v5' ? 10 : 14);
    assert.equal(document.drawings.length, 6);
    assert.deepEqual(document.layerOrder, ['drawings', 'players']);
    for (const player of document.players) {
      assert.ok(player.position.x >= 0 && player.position.x <= 1);
      assert.ok(player.position.y >= 0 && player.position.y <= 1);
    }
    for (const drawing of document.drawings) {
      assert.ok(drawing.start.x >= 0 && drawing.start.x <= 1);
      assert.ok(drawing.start.y >= 0 && drawing.start.y <= 1);
      assert.ok(drawing.end.x >= 0 && drawing.end.x <= 1);
      assert.ok(drawing.end.y >= 0 && drawing.end.y <= 1);
      assert.ok(drawing.styleToken.length > 0);
    }
    assert.equal(isTacticalPlanDocument(document), true);
  });

  test(`${format}: serialize -> restore round-trip preserves editor geometry and drawing order`, () => {
    const source = board(format);
    const document = serializeTacticalPlan(source);
    const restored = restoreTacticalPlan(document);
    assert.equal(restored.gameFormat, source.gameFormat);
    assert.equal(restored.formation, source.formation);
    assert.equal(restored.title, source.title);
    assert.equal(restored.notes, source.notes);
    assert.deepEqual(restored.players.map((player) => ({ id: player.id, team: player.team, number: player.number, name: player.name })),
      source.players.map((player) => ({ id: player.id, team: player.team, number: player.number, name: player.name })));
    restored.players.forEach((player, index) => {
      closeTo(player.x, source.players[index].x);
      closeTo(player.y, source.players[index].y);
    });
    assert.deepEqual(restored.drawings.map((drawing) => drawing.id), source.drawings.map((drawing) => drawing.id));
    restored.drawings.forEach((drawing, index) => {
      const original = source.drawings[index];
      assert.equal(drawing.kind, original.kind);
      closeTo(drawing.x1, original.x1);
      closeTo(drawing.y1, original.y1);
      closeTo(drawing.x2, original.x2);
      closeTo(drawing.y2, original.y2);
      assert.equal(drawing.points?.length, original.points?.length);
      drawing.points?.forEach((point, pointIndex) => {
        closeTo(point.x, original.points![pointIndex].x);
        closeTo(point.y, original.points![pointIndex].y);
      });
    });
  });
}

test('V13 schema v2 records migrate to schema v1 without losing SVG curve points', () => {
  const source = board('5v5');
  const legacy = {
    id: 'plan-v3-5v5', schemaVersion: 2, title: source.title, format: source.gameFormat,
    formation: source.formation, notes: source.notes, players: source.players, objects: source.drawings,
    updatedAt: Date.parse(source.updatedAt),
  };
  const migrated = parseTacticalPlan(legacy);
  assert.equal(migrated.format, TACTICAL_PLAN_FORMAT);
  assert.equal(migrated.schemaVersion, 1);
  assert.equal(migrated.drawings.find((item) => item.kind === 'curve')?.points?.length, 3);
  assert.equal(migrated.drawings.find((item) => item.kind === 'multiCurve')?.points?.length, 5);
  const restored = restoreTacticalPlan(migrated);
  assert.equal(restored.drawings.length, source.drawings.length);
  restored.drawings.forEach((drawing, index) => {
    const original = source.drawings[index];
    assert.equal(drawing.kind, original.kind);
    closeTo(drawing.x1, original.x1); closeTo(drawing.y1, original.y1);
    closeTo(drawing.x2, original.x2); closeTo(drawing.y2, original.y2);
    assert.equal(drawing.points?.length, original.points?.length);
    drawing.points?.forEach((point, pointIndex) => {
      closeTo(point.x, original.points![pointIndex].x);
      closeTo(point.y, original.points![pointIndex].y);
    });
  });
});

test('JSON parser enforces the byte limit before parsing and rejects malformed JSON', () => {
  const tooLarge = ' '.repeat(MAX_TACTICAL_PLAN_JSON_BYTES + 1);
  assert.throws(() => parseTacticalPlanJson(tooLarge), (error: unknown) => error instanceof TacticalPlanValidationError && error.code === 'too-large');
  assert.throws(() => parseTacticalPlanJson('{not json'), (error: unknown) => error instanceof TacticalPlanValidationError && error.code === 'invalid');
});

test('unsafe object keys and excessive aggregate drawing points fail closed', () => {
  const valid = serializeTacticalPlan(board('5v5'));
  const unsafe = structuredClone(valid) as unknown as Record<string, unknown>;
  Object.defineProperty(unsafe, '__proto__', { value: { polluted: true }, enumerable: true });
  assert.throws(() => parseTacticalPlan(unsafe));

  const tooManyPoints = structuredClone(valid);
  tooManyPoints.drawings = Array.from({ length: 70 }, (_, index) => ({
    id: `multi-${index}`, kind: 'multiCurve' as const, styleToken: 'multi-curve-dash-cyan' as const,
    start: { x: 0, y: 0 }, end: { x: 1, y: 1 },
    points: Array.from({ length: 800 }, (_, pointIndex) => ({ x: (pointIndex % 2), y: (pointIndex % 3) / 2 })),
  }));
  assert.throws(() => parseTacticalPlan(tooManyPoints));
});

test('invalid normalized coordinates, duplicate ids, styles and format counts fail closed', () => {
  const valid = serializeTacticalPlan(board('5v5'));
  const badCoordinate = structuredClone(valid);
  badCoordinate.players[0].position.x = 1.1;
  assert.throws(() => parseTacticalPlan(badCoordinate));

  const duplicateId = structuredClone(valid);
  duplicateId.players[1].id = duplicateId.players[0].id;
  assert.throws(() => parseTacticalPlan(duplicateId));

  const badStyle = structuredClone(valid);
  badStyle.drawings[0].styleToken = 'url(javascript:alert(1))' as never;
  assert.throws(() => parseTacticalPlan(badStyle));

  const wrongCount = structuredClone(valid);
  wrongCount.players.pop();
  assert.throws(() => parseTacticalPlan(wrongCount));
});

test('curve control points that extend beyond a pitch edge are clamped during serialization', () => {
  const source = board('5v5');
  source.drawings = [{
    id: 'edge-curve', kind: 'curve', x1: 5, y1: 160, x2: 5, y2: 420,
    points: [{ x: 5, y: 160 }, { x: -47, y: 290 }, { x: 5, y: 420 }],
  }];

  const document = serializeTacticalPlan(source);
  const control = document.drawings[0].points?.[1];
  assert.ok(control);
  assert.equal(control.x, 0);
  assert.ok(control.y >= 0 && control.y <= 1);

  const restored = restoreTacticalPlan(document);
  assert.equal(restored.drawings[0].points?.[1].x, 0);
});

test('legacy curved routes without stored points are materialized with the current renderer geometry', () => {
  const source = board('5v5');
  const legacy = { id: source.id, schemaVersion: 2, title: source.title, format: '5v5', formation: source.formation, notes: source.notes, players: source.players, objects: source.drawings.map(({ points: _points, ...drawing }) => drawing), updatedAt: Date.parse(source.updatedAt) };
  const migrated = parseTacticalPlan(legacy);
  assert.equal(migrated.drawings.find((drawing) => drawing.kind === 'curve')?.points?.length, 3);
  assert.equal(migrated.drawings.find((drawing) => drawing.kind === 'multiCurve')?.points?.length, 3);
});

test('unsupported future schema versions are distinguished from malformed documents', () => {
  const future = { ...serializeTacticalPlan(board('7v7')), schemaVersion: 99 };
  assert.throws(() => parseTacticalPlan(future), (error: unknown) => error instanceof TacticalPlanValidationError && error.code === 'unsupported-version');
});
