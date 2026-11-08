import {
  parseTacticalPlan,
  type TacticalPlanDocument,
  type TacticalPlanDrawing,
  type TacticalPlanGameFormat,
} from '../domain/tactics/tacticalPlanSchema.ts';

export const TACTICAL_AI_HANDOFF_KEY = 'taamen-ai-tactical-plan-handoff-v1';
export const TACTICAL_AI_HANDOFF_VERSION = 1 as const;
export const TACTICAL_AI_HANDOFF_TTL_MS = 30 * 60 * 1000;
export const MAX_TACTICAL_AI_CONTEXT_CHARS = 8_000;
export const MAX_TACTICAL_AI_CONTEXT_BYTES = 12 * 1024;
export const MAX_TACTICAL_AI_DRAWINGS = 18;
export const MAX_TACTICAL_AI_DRAWING_POINTS = 8;
/** sessionStorage should never need more than the bounded plan plus its small envelope. */
export const MAX_TACTICAL_AI_HANDOFF_BYTES = 16 * 1024;

export type TacticalAIPlayerContext = {
  team: 'home' | 'away';
  number: number;
  name: string;
  x: number;
  y: number;
};

export type TacticalAIDrawingContext = {
  kind: TacticalPlanDrawing['kind'];
  styleToken: TacticalPlanDrawing['styleToken'];
  start: { x: number; y: number };
  end: { x: number; y: number };
  points?: Array<{ x: number; y: number }>;
  originalPointCount: number;
  sampled: boolean;
};

/** A compact, validated description of one explicitly selected tactical board. */
export type TacticalAIPlanContext = {
  version: typeof TACTICAL_AI_HANDOFF_VERSION;
  title: string;
  gameFormat: TacticalPlanGameFormat;
  formation: string;
  notes: string;
  orientation: 'landscape';
  attackDirection: 'unspecified';
  coordinateMeaning: 'x: 0-100 from left to right; y: 0-100 from top to bottom';
  players: TacticalAIPlayerContext[];
  drawings: TacticalAIDrawingContext[];
  drawingSummary: {
    total: number;
    included: number;
    omitted: number;
    sampled: number;
  };
};

type TacticalAIHandoff = {
  version: typeof TACTICAL_AI_HANDOFF_VERSION;
  createdAt: number;
  plan: TacticalAIPlanContext;
};

const DRAWING_KINDS = new Set<TacticalPlanDrawing['kind']>([
  'pass', 'run', 'press', 'curve', 'multiCurve', 'zone',
]);
const STYLE_TOKENS = new Set<TacticalPlanDrawing['styleToken']>([
  'pass-solid-white', 'run-dash-yellow', 'press-dot-pink',
  'curve-solid-violet', 'multi-curve-dash-cyan', 'zone-fill-amber',
]);

function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 10;
}

function samplePoints(points: Array<{ x: number; y: number }>, limit: number) {
  if (points.length <= limit) return points.map(point => ({ x: roundCoordinate(point.x), y: roundCoordinate(point.y) }));
  const selected: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < limit; index += 1) {
    const sourceIndex = Math.round(index * (points.length - 1) / (limit - 1));
    const point = points[sourceIndex];
    const previous = selected[selected.length - 1];
    const normalized = { x: roundCoordinate(point.x), y: roundCoordinate(point.y) };
    if (!previous || previous.x !== normalized.x || previous.y !== normalized.y) selected.push(normalized);
  }
  return selected;
}

function compactDrawing(drawing: TacticalPlanDrawing): TacticalAIDrawingContext {
  const sourcePoints = drawing.points ?? [];
  const points = sourcePoints.length ? samplePoints(sourcePoints, MAX_TACTICAL_AI_DRAWING_POINTS) : undefined;
  return {
    kind: drawing.kind,
    styleToken: drawing.styleToken,
    start: { x: roundCoordinate(drawing.start.x), y: roundCoordinate(drawing.start.y) },
    end: { x: roundCoordinate(drawing.end.x), y: roundCoordinate(drawing.end.y) },
    ...(points ? { points } : {}),
    originalPointCount: sourcePoints.length,
    sampled: sourcePoints.length > MAX_TACTICAL_AI_DRAWING_POINTS,
  };
}

/**
 * Convert a canonical tactical document into a bounded AI-only representation.
 * The canonical document itself remains the source of truth and is never modified.
 */
export function buildTacticalAIPlanContext(value: TacticalPlanDocument | unknown): TacticalAIPlanContext {
  const document = parseTacticalPlan(value);
  const allDrawings = document.drawings;
  const includedDrawings = allDrawings.slice(0, MAX_TACTICAL_AI_DRAWINGS).map(compactDrawing);
  const plan: TacticalAIPlanContext = {
    version: TACTICAL_AI_HANDOFF_VERSION,
    title: document.metadata.title.slice(0, 70),
    gameFormat: document.metadata.gameFormat,
    formation: document.metadata.formation.slice(0, 20),
    notes: document.metadata.notes.slice(0, 320),
    orientation: 'landscape',
    attackDirection: 'unspecified',
    coordinateMeaning: 'x: 0-100 from left to right; y: 0-100 from top to bottom',
    players: document.players.map(player => ({
      team: player.team,
      number: player.number,
      name: player.name.slice(0, 28),
      x: roundCoordinate(player.position.x),
      y: roundCoordinate(player.position.y),
    })),
    drawings: includedDrawings,
    drawingSummary: {
      total: allDrawings.length,
      included: includedDrawings.length,
      omitted: Math.max(0, allDrawings.length - includedDrawings.length),
      sampled: includedDrawings.filter(drawing => drawing.sampled).length,
    },
  };

  // Keep both character and UTF-8 byte ceilings; Arabic text can use multiple bytes per character.
  const exceedsClientLimit = () => {
    const serialized = JSON.stringify(plan);
    return serialized.length > MAX_TACTICAL_AI_CONTEXT_CHARS
      || new TextEncoder().encode(serialized).byteLength > MAX_TACTICAL_AI_CONTEXT_BYTES;
  };
  while (exceedsClientLimit() && plan.drawings.length > 0) {
    plan.drawings.pop();
    plan.drawingSummary.included = plan.drawings.length;
    plan.drawingSummary.omitted = plan.drawingSummary.total - plan.drawings.length;
    plan.drawingSummary.sampled = plan.drawings.filter(drawing => drawing.sampled).length;
  }
  if (exceedsClientLimit()) {
    plan.notes = '';
  }
  if (exceedsClientLimit()) {
    throw new Error('Tactical AI context exceeds the allowed size.');
  }
  return plan;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isCoordinate(value: unknown): value is { x: number; y: number } {
  if (!isRecord(value)) return false;
  return typeof value.x === 'number' && Number.isFinite(value.x) && value.x >= 0 && value.x <= 100
    && typeof value.y === 'number' && Number.isFinite(value.y) && value.y >= 0 && value.y <= 100;
}

/** Validate data read back from tab-scoped storage; it is not treated as trusted. */
export function parseTacticalAIPlanContext(value: unknown): TacticalAIPlanContext | null {
  if (!isRecord(value) || value.version !== TACTICAL_AI_HANDOFF_VERSION) return null;
  if (value.gameFormat !== '5v5' && value.gameFormat !== '7v7') return null;
  if (typeof value.title !== 'string' || value.title.length > 70) return null;
  if (typeof value.formation !== 'string' || !value.formation.trim() || value.formation.length > 20) return null;
  if (typeof value.notes !== 'string' || value.notes.length > 320) return null;
  if (value.orientation !== 'landscape' || value.attackDirection !== 'unspecified') return null;
  if (value.coordinateMeaning !== 'x: 0-100 from left to right; y: 0-100 from top to bottom') return null;

  const expectedPerTeam = value.gameFormat === '5v5' ? 5 : 7;
  if (!Array.isArray(value.players) || value.players.length !== expectedPerTeam * 2) return null;
  const teamCounts = { home: 0, away: 0 };
  const numbers = { home: new Set<number>(), away: new Set<number>() };
  const players: TacticalAIPlayerContext[] = [];
  for (const player of value.players) {
    if (!isRecord(player) || (player.team !== 'home' && player.team !== 'away')) return null;
    if (!Number.isInteger(player.number) || Number(player.number) < 1 || Number(player.number) > 99) return null;
    if (typeof player.name !== 'string' || player.name.length > 28 || !isCoordinate({ x: player.x, y: player.y })) return null;
    if (numbers[player.team].has(Number(player.number))) return null;
    numbers[player.team].add(Number(player.number));
    teamCounts[player.team] += 1;
    players.push({ team: player.team, number: Number(player.number), name: player.name, x: Number(player.x), y: Number(player.y) });
  }
  if (teamCounts.home !== expectedPerTeam || teamCounts.away !== expectedPerTeam) return null;

  if (!Array.isArray(value.drawings) || value.drawings.length > MAX_TACTICAL_AI_DRAWINGS) return null;
  const drawings: TacticalAIDrawingContext[] = [];
  for (const drawing of value.drawings) {
    if (!isRecord(drawing) || !DRAWING_KINDS.has(drawing.kind as TacticalPlanDrawing['kind'])) return null;
    if (!STYLE_TOKENS.has(drawing.styleToken as TacticalPlanDrawing['styleToken'])) return null;
    const rawStart = drawing.start;
    const rawEnd = drawing.end;
    if (!isCoordinate(rawStart) || !isCoordinate(rawEnd)) return null;
    if (!Number.isInteger(drawing.originalPointCount) || Number(drawing.originalPointCount) < 0 || Number(drawing.originalPointCount) > 800) return null;
    if (typeof drawing.sampled !== 'boolean' || drawing.sampled !== (Number(drawing.originalPointCount) > MAX_TACTICAL_AI_DRAWING_POINTS)) return null;

    // Narrow untrusted JSON points into a typed array once, then use only this validated copy.
    const rawPoints = drawing.points;
    let points: Array<{ x: number; y: number }> | undefined;
    if (rawPoints !== undefined) {
      if (!Array.isArray(rawPoints) || rawPoints.length > MAX_TACTICAL_AI_DRAWING_POINTS) return null;
      points = [];
      for (const point of rawPoints) {
        if (!isCoordinate(point)) return null;
        points.push({ x: point.x, y: point.y });
      }
    }
    const hasPoints = points !== undefined;
    const pointCount = points?.length ?? 0;
    const kind = drawing.kind as TacticalPlanDrawing['kind'];
    if (hasPoints && pointCount > Number(drawing.originalPointCount)) return null;
    if (kind === 'curve') {
      if (!points || pointCount !== 3 || drawing.originalPointCount !== 3 || drawing.sampled) return null;
      if (points[0].x !== rawStart.x || points[0].y !== rawStart.y
        || points[2].x !== rawEnd.x || points[2].y !== rawEnd.y) return null;
    } else if (kind === 'multiCurve') {
      if (!points || pointCount < 2 || Number(drawing.originalPointCount) < 2) return null;
      if (!drawing.sampled && pointCount !== Number(drawing.originalPointCount)) return null;
      if (points[0].x !== rawStart.x || points[0].y !== rawStart.y
        || points[pointCount - 1].x !== rawEnd.x || points[pointCount - 1].y !== rawEnd.y) return null;
    } else if (hasPoints || drawing.originalPointCount !== 0 || drawing.sampled) {
      // Straight routes and rectangular zones are represented by start/end only.
      return null;
    }
    drawings.push({
      kind,
      styleToken: drawing.styleToken as TacticalPlanDrawing['styleToken'],
      start: { x: rawStart.x, y: rawStart.y },
      end: { x: rawEnd.x, y: rawEnd.y },
      ...(points ? { points } : {}),
      originalPointCount: Number(drawing.originalPointCount),
      sampled: drawing.sampled,
    });
  }

  if (!isRecord(value.drawingSummary)) return null;
  const { total, included, omitted, sampled } = value.drawingSummary;
  const summaryValues = [total, included, omitted, sampled];
  if (summaryValues.some(item => typeof item !== 'number' || !Number.isInteger(item) || item < 0 || item > 250)) return null;
  const totalCount = total as number;
  const includedCount = included as number;
  const omittedCount = omitted as number;
  const sampledCount = sampled as number;
  if (includedCount !== drawings.length || totalCount !== includedCount + omittedCount || sampledCount !== drawings.filter(drawing => drawing.sampled).length) return null;
  if (drawings.some(drawing => drawing.sampled !== (drawing.originalPointCount > MAX_TACTICAL_AI_DRAWING_POINTS))) return null;
  if (drawings.some(drawing => drawing.points && drawing.points.length > drawing.originalPointCount)) return null;

  const parsed: TacticalAIPlanContext = {
    version: TACTICAL_AI_HANDOFF_VERSION,
    title: value.title,
    gameFormat: value.gameFormat,
    formation: value.formation,
    notes: value.notes,
    orientation: 'landscape',
    attackDirection: 'unspecified',
    coordinateMeaning: 'x: 0-100 from left to right; y: 0-100 from top to bottom',
    players,
    drawings,
    drawingSummary: { total: totalCount, included: includedCount, omitted: omittedCount, sampled: sampledCount },
  };
  const serialized = JSON.stringify(parsed);
  return serialized.length <= MAX_TACTICAL_AI_CONTEXT_CHARS
    && new TextEncoder().encode(serialized).byteLength <= MAX_TACTICAL_AI_CONTEXT_BYTES
    ? parsed : null;
}

export type TacticalAIHandoffDetails = {
  plan: TacticalAIPlanContext;
  createdAt: number;
  expiresAt: number;
};

export function writeTacticalPlanAIHandoff(document: TacticalPlanDocument | unknown, now = Date.now()): boolean {
  try {
    if (!Number.isFinite(now) || now < 0) return false;
    const plan = buildTacticalAIPlanContext(document);
    const handoff: TacticalAIHandoff = { version: TACTICAL_AI_HANDOFF_VERSION, createdAt: now, plan };
    const serialized = JSON.stringify(handoff);
    if (new TextEncoder().encode(serialized).byteLength > MAX_TACTICAL_AI_HANDOFF_BYTES) return false;
    sessionStorage.setItem(TACTICAL_AI_HANDOFF_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

/** Read and validate the handoff envelope so the UI can expire its attachment badge on time. */
export function readTacticalPlanAIHandoffDetails(now = Date.now()): TacticalAIHandoffDetails | null {
  try {
    const raw = sessionStorage.getItem(TACTICAL_AI_HANDOFF_KEY);
    if (!raw) return null;
    if (new TextEncoder().encode(raw).byteLength > MAX_TACTICAL_AI_HANDOFF_BYTES) {
      sessionStorage.removeItem(TACTICAL_AI_HANDOFF_KEY);
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== TACTICAL_AI_HANDOFF_VERSION
      || typeof parsed.createdAt !== 'number' || !Number.isFinite(parsed.createdAt)
      || parsed.createdAt < 0 || parsed.createdAt > now
      || now - parsed.createdAt >= TACTICAL_AI_HANDOFF_TTL_MS) {
      sessionStorage.removeItem(TACTICAL_AI_HANDOFF_KEY);
      return null;
    }
    const plan = parseTacticalAIPlanContext(parsed.plan);
    if (!plan) {
      sessionStorage.removeItem(TACTICAL_AI_HANDOFF_KEY);
      return null;
    }
    return { plan, createdAt: parsed.createdAt, expiresAt: parsed.createdAt + TACTICAL_AI_HANDOFF_TTL_MS };
  } catch {
    clearTacticalPlanAIHandoff();
    return null;
  }
}

export function readTacticalPlanAIHandoff(now = Date.now()): TacticalAIPlanContext | null {
  return readTacticalPlanAIHandoffDetails(now)?.plan ?? null;
}

export function clearTacticalPlanAIHandoff(): void {
  try { sessionStorage.removeItem(TACTICAL_AI_HANDOFF_KEY); } catch { /* Storage may be unavailable. */ }
}
