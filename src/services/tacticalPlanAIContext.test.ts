import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeTacticalPlan, type TacticalBoardPlayerState } from '../domain/tactics/tacticalPlanSchema.ts';
import {
  buildTacticalAIPlanContext,
  clearTacticalPlanAIHandoff,
  MAX_TACTICAL_AI_CONTEXT_CHARS,
  MAX_TACTICAL_AI_CONTEXT_BYTES,
  parseTacticalAIPlanContext,
  readTacticalPlanAIHandoff,
  readTacticalPlanAIHandoffDetails,
  MAX_TACTICAL_AI_HANDOFF_BYTES,
  TACTICAL_AI_HANDOFF_KEY,
  TACTICAL_AI_HANDOFF_TTL_MS,
  writeTacticalPlanAIHandoff,
} from './tacticalPlanAIContext.ts';

function makePlan(format: '5v5' | '7v7' = '5v5') {
  const count = format === '5v5' ? 5 : 7;
  const players: TacticalBoardPlayerState[] = (['home', 'away'] as const).flatMap(team =>
    Array.from({ length: count }, (_, index) => ({
      id: `${team}-${index + 1}`,
      team,
      number: index + 1,
      name: `${team}-${index + 1}`,
      x: team === 'home' ? 10 + index * 10 : 90 - index * 10,
      y: 10 + index * 12,
    })),
  );
  const now = new Date('2026-11-04T12:00:00.000Z').toISOString();
  return serializeTacticalPlan({
    id: `plan-${format}`,
    gameFormat: format,
    formation: format === '5v5' ? '1-2-1' : '2-3-1',
    title: 'Build from the back',
    notes: 'The nearest midfielder supports the first pass.',
    createdAt: now,
    updatedAt: now,
    players,
    drawings: [
      { id: 'pass-1', kind: 'pass', x1: 100, y1: 100, x2: 500, y2: 250 },
      { id: 'curve-1', kind: 'curve', x1: 200, y1: 200, x2: 600, y2: 300, points: [{ x: 200, y: 200 }, { x: 350, y: 100 }, { x: 600, y: 300 }] },
      { id: 'zone-1', kind: 'zone', x1: 300, y1: 150, x2: 500, y2: 380 },
    ],
  });
}

test('AI tactical context includes all players and preserves drawing semantics and normalized coordinates', () => {
  const context = buildTacticalAIPlanContext(makePlan('5v5'));
  assert.equal(context.gameFormat, '5v5');
  assert.equal(context.players.length, 10);
  assert.deepEqual(context.players[0], { team: 'home', number: 1, name: 'home-1', x: 10, y: 10 });
  assert.deepEqual(context.drawings.map(drawing => drawing.kind), ['pass', 'curve', 'zone']);
  assert.equal(context.drawings[1].points?.length, 3);
  assert.equal(context.drawingSummary.total, 3);
  assert.equal(context.attackDirection, 'unspecified');
});

test('AI tactical context accepts 7v7 and preserves both teams without assuming roles from shirt numbers', () => {
  const context = buildTacticalAIPlanContext(makePlan('7v7'));
  assert.equal(context.players.length, 14);
  assert.equal(context.players.filter(player => player.team === 'home').length, 7);
  assert.equal(context.players.filter(player => player.team === 'away').length, 7);
  assert.equal('role' in context.players[0], false);
});

test('AI context samples oversized route geometry and remains under the hard context limit', () => {
  const plan = makePlan('5v5');
  const manyPoints = Array.from({ length: 300 }, (_, index) => ({ x: index * 3, y: index * 1.7 }));
  const withLongRoute = {
    ...plan,
    drawings: [...plan.drawings, ...Array.from({ length: 30 }, (_, index) => ({
      id: `multi-${index}`,
      kind: 'multiCurve' as const,
      styleToken: 'multi-curve-dash-cyan' as const,
      start: { x: 0.1, y: 0.1 },
      end: { x: 0.9, y: 0.9 },
      points: manyPoints.map(point => ({ x: Math.min(1, point.x / 900), y: Math.min(1, point.y / 540) })),
    }))],
  };
  const context = buildTacticalAIPlanContext(withLongRoute);
  const serialized = JSON.stringify(context);
  assert.ok(serialized.length <= MAX_TACTICAL_AI_CONTEXT_CHARS);
  assert.ok(new TextEncoder().encode(serialized).byteLength <= MAX_TACTICAL_AI_CONTEXT_BYTES);
  assert.ok(context.drawingSummary.omitted > 0 || context.drawingSummary.sampled > 0);
  assert.ok(context.drawings.every(drawing => (drawing.points?.length || 0) <= 8));
});

test('AI tactical context parser rejects malformed player counts, unsafe coordinates, and bad drawing tokens', () => {
  const valid = buildTacticalAIPlanContext(makePlan());
  assert.equal(parseTacticalAIPlanContext(valid)?.players.length, 10);
  assert.equal(parseTacticalAIPlanContext({ ...valid, players: valid.players.slice(0, 9) }), null);
  assert.equal(parseTacticalAIPlanContext({ ...valid, players: valid.players.map((player, index) => index ? player : { ...player, x: 101 }) }), null);
  assert.equal(parseTacticalAIPlanContext({ ...valid, drawings: [{ ...valid.drawings[0], styleToken: 'execute-code' }] }), null);
  const curve = valid.drawings.find(drawing => drawing.kind === 'curve')!;
  assert.equal(parseTacticalAIPlanContext({ ...valid, drawings: [{ ...curve, originalPointCount: 2 }] }), null);
  assert.equal(parseTacticalAIPlanContext({ ...valid, drawings: [{ ...curve, points: [{ x: 20, y: 20 }, ...curve.points!.slice(1)] }] }), null);
});

test('parser rejects inconsistent drawing sampling metadata', () => {
  const valid = buildTacticalAIPlanContext(makePlan());
  const sampledCountMismatch = { ...valid, drawingSummary: { ...valid.drawingSummary, sampled: 1 } };
  const badDrawingFlag = { ...valid, drawings: valid.drawings.map((drawing, index) => index ? drawing : { ...drawing, sampled: true }) };
  assert.equal(parseTacticalAIPlanContext(sampledCountMismatch), null);
  assert.equal(parseTacticalAIPlanContext(badDrawingFlag), null);
});

test('handoff is tab-scoped, expires, validates on read, and can be cleared after a successful request', () => {
  const values = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    },
  });
  try {
    const now = Date.now();
    assert.equal(writeTacticalPlanAIHandoff(makePlan(), now), true);
    assert.equal(readTacticalPlanAIHandoff(now)?.title, 'Build from the back');
    assert.equal(readTacticalPlanAIHandoffDetails(now)?.expiresAt, now + TACTICAL_AI_HANDOFF_TTL_MS);
    assert.equal(writeTacticalPlanAIHandoff(makePlan(), Number.NaN), false);
    assert.equal(readTacticalPlanAIHandoff(now + TACTICAL_AI_HANDOFF_TTL_MS), null);
    assert.equal(values.has(TACTICAL_AI_HANDOFF_KEY), false);
    assert.equal(writeTacticalPlanAIHandoff(makePlan(), now), true);
    clearTacticalPlanAIHandoff();
    assert.equal(readTacticalPlanAIHandoff(now), null);
  } finally {
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});


test('handoff reader rejects oversized session storage before JSON parsing', () => {
  const values = new Map<string, string>([[TACTICAL_AI_HANDOFF_KEY, ' '.repeat(MAX_TACTICAL_AI_HANDOFF_BYTES + 1)]]);
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => { values.delete(key); } },
  });
  try {
    assert.equal(readTacticalPlanAIHandoffDetails(), null);
    assert.equal(values.has(TACTICAL_AI_HANDOFF_KEY), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});
