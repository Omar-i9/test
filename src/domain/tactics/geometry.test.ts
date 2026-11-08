import assert from 'node:assert/strict';
import test from 'node:test';
import { createTacticalCurveControlPoint } from './geometry.ts';

test('curve control points stay inside all pitch edges', () => {
  const cases = [
    [{ x: 5, y: 160 }, { x: 5, y: 420 }],
    [{ x: 895, y: 420 }, { x: 895, y: 160 }],
    [{ x: 420, y: 5 }, { x: 160, y: 5 }],
    [{ x: 160, y: 535 }, { x: 420, y: 535 }],
  ] as const;

  for (const [start, end] of cases) {
    const control = createTacticalCurveControlPoint(start, end);
    assert.ok(Number.isFinite(control.x) && control.x >= 0 && control.x <= 900);
    assert.ok(Number.isFinite(control.y) && control.y >= 0 && control.y <= 540);
  }
});

test('curve control point keeps the existing bend calculation away from pitch edges', () => {
  const control = createTacticalCurveControlPoint({ x: 170, y: 230 }, { x: 650, y: 380 });
  const dx = 480;
  const dy = 150;
  const distance = Math.hypot(dx, dy);
  const bend = Math.min(105, Math.max(24, distance * 0.2));
  const side = 1;
  assert.ok(Math.abs(control.x - ((170 + 650) / 2 - (dy / distance) * bend * side)) < 1e-10);
  assert.ok(Math.abs(control.y - ((230 + 380) / 2 + (dx / distance) * bend * side)) < 1e-10);
});
