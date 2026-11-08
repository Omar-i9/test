export type TacticalPitchPoint = { x: number; y: number };

/**
 * Build the quadratic control point used by the tactical board's curve tool.
 * Control points are kept inside the canonical pitch so the rendered route,
 * persisted Schema v1 geometry, and AI context all describe the same shape.
 */
export function createTacticalCurveControlPoint(
  start: TacticalPitchPoint,
  end: TacticalPitchPoint,
  width = 900,
  height = 540,
): TacticalPitchPoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy) || 1;
  const bend = Math.min(105, Math.max(24, distance * 0.2));
  const side = dx * dy >= 0 ? 1 : -1;
  const rawX = (start.x + end.x) / 2 - (dy / distance) * bend * side;
  const rawY = (start.y + end.y) / 2 + (dx / distance) * bend * side;

  return {
    x: Math.max(0, Math.min(width, rawX)),
    y: Math.max(0, Math.min(height, rawY)),
  };
}
