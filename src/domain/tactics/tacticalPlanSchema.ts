import { createTacticalCurveControlPoint } from './geometry.ts';

/**
 * TAAMEN Tactical Plan Schema v1.
 *
 * The editor currently uses percentage coordinates for players and a fixed
 * 900x540 SVG coordinate space for drawings. This module is the single
 * serialization boundary: persisted/exported plans use normalized 0..1
 * coordinates for every pitch element.
 */

export const TACTICAL_PLAN_FORMAT = 'taamen-tactical-plan' as const;
export const TACTICAL_PLAN_SCHEMA_VERSION = 1 as const;
export const TACTICAL_PITCH_WIDTH = 900;
export const TACTICAL_PITCH_HEIGHT = 540;
export const MAX_TACTICAL_DRAWINGS = 250;
export const MAX_TACTICAL_DRAWING_POINTS = 800;
export const MAX_TACTICAL_PLAN_JSON_BYTES = 2 * 1024 * 1024;
export const MAX_TACTICAL_TOTAL_POINTS = 50_000;

export type TacticalPlanGameFormat = '5v5' | '7v7';
export type TacticalTeam = 'home' | 'away';
export type TacticalDrawingKind = 'pass' | 'run' | 'press' | 'curve' | 'multiCurve' | 'zone';
export type TacticalStyleToken =
  | 'pass-solid-white'
  | 'run-dash-yellow'
  | 'press-dot-pink'
  | 'curve-solid-violet'
  | 'multi-curve-dash-cyan'
  | 'zone-fill-amber';

export type NormalizedPoint = { x: number; y: number };

export type TacticalPlanPlayer = {
  id: string;
  team: TacticalTeam;
  number: number;
  name: string;
  position: NormalizedPoint;
};

export type TacticalPlanDrawing = {
  id: string;
  kind: TacticalDrawingKind;
  styleToken: TacticalStyleToken;
  start: NormalizedPoint;
  end: NormalizedPoint;
  /** Full geometry, including the quadratic control point or every sampled point. */
  points?: NormalizedPoint[];
};

export type TacticalPlanDocument = {
  format: typeof TACTICAL_PLAN_FORMAT;
  schemaVersion: typeof TACTICAL_PLAN_SCHEMA_VERSION;
  id: string;
  metadata: {
    title: string;
    notes: string;
    gameFormat: TacticalPlanGameFormat;
    formation: string;
    createdAt: string;
    updatedAt: string;
  };
  pitch: {
    coordinateSystem: 'normalized-0-1';
    width: 1;
    height: 1;
    orientation: 'landscape';
    /** The current V13 editor has no explicit attack-direction control. */
    attackDirection: 'unspecified';
  };
  players: TacticalPlanPlayer[];
  drawings: TacticalPlanDrawing[];
  /** The current renderer paints drawings first and player tokens above them. */
  layerOrder: ['drawings', 'players'];
};

export type TacticalBoardPlayerState = {
  id: string;
  team: TacticalTeam;
  number: number;
  name: string;
  /** Current editor coordinate: percentage 0..100. */
  x: number;
  y: number;
};

export type TacticalBoardDrawingState = {
  id: string;
  kind: TacticalDrawingKind;
  /** Current editor coordinate: SVG units 0..900. */
  x1: number;
  /** Current editor coordinate: SVG units 0..540. */
  y1: number;
  x2: number;
  y2: number;
  /** Current editor coordinate: SVG units. */
  points?: Array<{ x: number; y: number }>;
};

export type TacticalBoardState = {
  id: string;
  gameFormat: TacticalPlanGameFormat;
  formation: string;
  title: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  players: TacticalBoardPlayerState[];
  drawings: TacticalBoardDrawingState[];
};

export class TacticalPlanValidationError extends Error {
  readonly code: 'invalid' | 'unsupported-version' | 'too-large';

  constructor(code: 'invalid' | 'unsupported-version' | 'too-large') {
    super(
      code === 'unsupported-version'
        ? 'Unsupported TAAMEN tactical plan schema version'
        : code === 'too-large'
          ? 'TAAMEN tactical plan file is too large'
          : 'Invalid TAAMEN tactical plan',
    );
    this.name = 'TacticalPlanValidationError';
    this.code = code;
  }
}

const STYLE_TOKEN_BY_KIND: Record<TacticalDrawingKind, TacticalStyleToken> = {
  pass: 'pass-solid-white',
  run: 'run-dash-yellow',
  press: 'press-dot-pink',
  curve: 'curve-solid-violet',
  multiCurve: 'multi-curve-dash-cyan',
  zone: 'zone-fill-amber',
};
const DRAWING_KINDS = new Set<TacticalDrawingKind>(['pass', 'run', 'press', 'curve', 'multiCurve', 'zone']);
const STYLE_TOKENS = new Set<TacticalStyleToken>(Object.values(STYLE_TOKEN_BY_KIND));
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const DEFAULT_FORMATIONS: Record<TacticalPlanGameFormat, string[]> = {
  '5v5': ['1-2-1', '1-1-2', '2-1-1', '3-1', '2-2'],
  '7v7': ['2-3-1', '3-2-1', '2-2-2', '3-1-2', '4-1-1', '2-1-3'],
};

type LegacyV2Plan = {
  id?: unknown;
  schemaVersion?: unknown;
  title?: unknown;
  format?: unknown;
  formation?: unknown;
  notes?: unknown;
  players?: unknown;
  objects?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function containsUnsafeKeys(value: unknown, depth = 0): boolean {
  if (depth > 20) return true;
  if (Array.isArray(value)) return value.some((item) => containsUnsafeKeys(item, depth + 1));
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) => FORBIDDEN_KEYS.has(key) || containsUnsafeKeys(child, depth + 1));
}

function assertJsonSize(value: unknown): void {
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    throw new TacticalPlanValidationError('invalid');
  }
  if (new TextEncoder().encode(json).byteLength > MAX_TACTICAL_PLAN_JSON_BYTES) {
    throw new TacticalPlanValidationError('too-large');
  }
}

function finiteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function boundedString(value: unknown, maxLength: number, allowEmpty = true): value is string {
  return typeof value === 'string' && value.length <= maxLength && (allowEmpty || value.trim().length > 0);
}

function isoDate(value: unknown, fallback: string): string {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return fallback;
}

function expectedPlayers(format: TacticalPlanGameFormat): number {
  return format === '5v5' ? 5 : 7;
}

function validateEditorPlayers(value: unknown, format: TacticalPlanGameFormat): value is TacticalBoardPlayerState[] {
  const teamSize = expectedPlayers(format);
  if (!Array.isArray(value) || value.length !== teamSize * 2) return false;
  const ids = new Set<string>();
  const numbers: Record<TacticalTeam, Set<number>> = { home: new Set(), away: new Set() };
  const counts: Record<TacticalTeam, number> = { home: 0, away: 0 };
  for (const item of value) {
    if (!isRecord(item)) return false;
    if (!boundedString(item.id, 120, false) || FORBIDDEN_KEYS.has(item.id)) return false;
    if (item.team !== 'home' && item.team !== 'away') return false;
    if (!Number.isInteger(item.number) || !finiteInRange(item.number, 1, 99)) return false;
    if (!boundedString(item.name, 28)) return false;
    if (!finiteInRange(item.x, 0, 100) || !finiteInRange(item.y, 0, 100)) return false;
    if (ids.has(item.id) || numbers[item.team].has(item.number)) return false;
    ids.add(item.id);
    numbers[item.team].add(item.number);
    counts[item.team] += 1;
  }
  return counts.home === teamSize && counts.away === teamSize;
}

function validateEditorDrawings(value: unknown): value is TacticalBoardDrawingState[] {
  if (!Array.isArray(value) || value.length > MAX_TACTICAL_DRAWINGS) return false;
  const ids = new Set<string>();
  let totalPoints = 0;
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 120) return false;
    if (!DRAWING_KINDS.has(item.kind as TacticalDrawingKind)) return false;
    if (!finiteInRange(item.x1, 0, TACTICAL_PITCH_WIDTH) || !finiteInRange(item.x2, 0, TACTICAL_PITCH_WIDTH)) return false;
    if (!finiteInRange(item.y1, 0, TACTICAL_PITCH_HEIGHT) || !finiteInRange(item.y2, 0, TACTICAL_PITCH_HEIGHT)) return false;
    if (ids.has(item.id)) return false;
    ids.add(item.id);
    if (item.points !== undefined) {
      if (!Array.isArray(item.points) || item.points.length > MAX_TACTICAL_DRAWING_POINTS) return false;
      totalPoints += item.points.length;
      if (totalPoints > MAX_TACTICAL_TOTAL_POINTS) return false;
      for (const [pointIndex, point] of item.points.entries()) {
        if (!isRecord(point)) return false;
        const isCurveControlPoint = item.kind === 'curve' && pointIndex === 1;
        const xValid = isCurveControlPoint
          ? finiteInRange(point.x, -105, TACTICAL_PITCH_WIDTH + 105)
          : finiteInRange(point.x, 0, TACTICAL_PITCH_WIDTH);
        const yValid = isCurveControlPoint
          ? finiteInRange(point.y, -105, TACTICAL_PITCH_HEIGHT + 105)
          : finiteInRange(point.y, 0, TACTICAL_PITCH_HEIGHT);
        if (!xValid || !yValid) return false;
      }
    }
    if (item.points !== undefined && item.kind === 'curve' && item.points.length !== 3) return false;
    if (item.points !== undefined && item.kind === 'multiCurve' && item.points.length < 2) return false;
  }
  return true;
}

function validateNormalizedPoint(value: unknown): value is NormalizedPoint {
  return isRecord(value) && finiteInRange(value.x, 0, 1) && finiteInRange(value.y, 0, 1);
}

function validateDocument(value: unknown): value is TacticalPlanDocument {
  if (!isRecord(value) || value.format !== TACTICAL_PLAN_FORMAT) return false;
  if (value.schemaVersion !== TACTICAL_PLAN_SCHEMA_VERSION) return false;
  if (!boundedString(value.id, 120, false) || FORBIDDEN_KEYS.has(value.id)) return false;
  if (!isRecord(value.metadata) || !isRecord(value.pitch)) return false;
  const metadata = value.metadata;
  const pitch = value.pitch;
  if (!boundedString(metadata.title, 70) || !boundedString(metadata.notes, 1000)) return false;
  if (metadata.gameFormat !== '5v5' && metadata.gameFormat !== '7v7') return false;
  if (!boundedString(metadata.formation, 20, false) || !DEFAULT_FORMATIONS[metadata.gameFormat].includes(metadata.formation)) return false;
  if (!boundedString(metadata.createdAt, 40, false) || !Number.isFinite(Date.parse(metadata.createdAt))) return false;
  if (!boundedString(metadata.updatedAt, 40, false) || !Number.isFinite(Date.parse(metadata.updatedAt))) return false;
  if (pitch.coordinateSystem !== 'normalized-0-1' || pitch.width !== 1 || pitch.height !== 1) return false;
  if (pitch.orientation !== 'landscape' || pitch.attackDirection !== 'unspecified') return false;
  if (!Array.isArray(value.layerOrder) || value.layerOrder.length !== 2 || value.layerOrder[0] !== 'drawings' || value.layerOrder[1] !== 'players') return false;
  if (!Array.isArray(value.players) || value.players.length !== expectedPlayers(metadata.gameFormat) * 2) return false;
  const playerIds = new Set<string>();
  const playerNumbers: Record<TacticalTeam, Set<number>> = { home: new Set(), away: new Set() };
  const playerCounts: Record<TacticalTeam, number> = { home: 0, away: 0 };
  for (const player of value.players) {
    if (!isRecord(player) || !boundedString(player.id, 120, false) || FORBIDDEN_KEYS.has(player.id)) return false;
    if (player.team !== 'home' && player.team !== 'away') return false;
    if (!Number.isInteger(player.number) || !finiteInRange(player.number, 1, 99)) return false;
    if (!boundedString(player.name, 28) || !validateNormalizedPoint(player.position)) return false;
    if (playerIds.has(player.id) || playerNumbers[player.team].has(player.number)) return false;
    playerIds.add(player.id);
    playerNumbers[player.team].add(player.number);
    playerCounts[player.team] += 1;
  }
  const teamSize = expectedPlayers(metadata.gameFormat);
  if (playerCounts.home !== teamSize || playerCounts.away !== teamSize) return false;
  if (!Array.isArray(value.drawings) || value.drawings.length > MAX_TACTICAL_DRAWINGS) return false;
  const drawingIds = new Set<string>();
  let totalPoints = 0;
  for (const drawing of value.drawings) {
    if (!isRecord(drawing) || !boundedString(drawing.id, 120, false) || FORBIDDEN_KEYS.has(drawing.id)) return false;
    if (!DRAWING_KINDS.has(drawing.kind as TacticalDrawingKind)) return false;
    if (drawing.styleToken !== STYLE_TOKEN_BY_KIND[drawing.kind as TacticalDrawingKind] || !STYLE_TOKENS.has(drawing.styleToken as TacticalStyleToken)) return false;
    if (!validateNormalizedPoint(drawing.start) || !validateNormalizedPoint(drawing.end)) return false;
    if (drawingIds.has(drawing.id)) return false;
    drawingIds.add(drawing.id);
    if (drawing.points !== undefined) {
      if (!Array.isArray(drawing.points) || drawing.points.length > MAX_TACTICAL_DRAWING_POINTS) return false;
      totalPoints += drawing.points.length;
      if (totalPoints > MAX_TACTICAL_TOTAL_POINTS) return false;
      if (!drawing.points.every(validateNormalizedPoint)) return false;
    }
    if (drawing.kind === 'curve' && (!Array.isArray(drawing.points) || drawing.points.length !== 3)) return false;
    if (drawing.kind === 'multiCurve' && (!Array.isArray(drawing.points) || drawing.points.length < 2)) return false;
  }
  return true;
}

export function isTacticalPlanDocument(value: unknown): value is TacticalPlanDocument {
  return validateDocument(value);
}

function fallbackCurveControl(start: { x: number; y: number }, end: { x: number; y: number }) {
  return createTacticalCurveControlPoint(start, end, TACTICAL_PITCH_WIDTH, TACTICAL_PITCH_HEIGHT);
}

export function serializeTacticalPlan(
  state: Omit<TacticalBoardState, 'createdAt' | 'updatedAt'> & { createdAt?: string; updatedAt?: string },
  now = new Date(),
): TacticalPlanDocument {
  if (state.gameFormat !== '5v5' && state.gameFormat !== '7v7') throw new TacticalPlanValidationError('invalid');
  if (!DEFAULT_FORMATIONS[state.gameFormat].includes(state.formation)) throw new TacticalPlanValidationError('invalid');
  if (!validateEditorPlayers(state.players, state.gameFormat) || !validateEditorDrawings(state.drawings)) {
    throw new TacticalPlanValidationError('invalid');
  }
  const fallbackTime = now.toISOString();
  const createdAt = isoDate(state.createdAt, fallbackTime);
  const updatedAt = isoDate(state.updatedAt, fallbackTime);
  const document: TacticalPlanDocument = {
    format: TACTICAL_PLAN_FORMAT,
    schemaVersion: TACTICAL_PLAN_SCHEMA_VERSION,
    id: state.id,
    metadata: {
      title: state.title.trim().slice(0, 70),
      notes: state.notes.slice(0, 1000),
      gameFormat: state.gameFormat,
      formation: state.formation,
      createdAt,
      updatedAt,
    },
    pitch: {
      coordinateSystem: 'normalized-0-1',
      width: 1,
      height: 1,
      orientation: 'landscape',
      attackDirection: 'unspecified',
    },
    players: state.players.map((player) => ({
      id: player.id,
      team: player.team,
      number: player.number,
      name: player.name,
      position: { x: player.x / 100, y: player.y / 100 },
    })),
    drawings: state.drawings.map((drawing) => {
      const start = { x: drawing.x1, y: drawing.y1 };
      const end = { x: drawing.x2, y: drawing.y2 };
      const geometry = drawing.points ?? (drawing.kind === 'curve'
        ? [start, fallbackCurveControl(start, end), end]
        : drawing.kind === 'multiCurve'
          ? [start, { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }, end]
          : undefined);
      return {
        id: drawing.id,
        kind: drawing.kind,
        styleToken: STYLE_TOKEN_BY_KIND[drawing.kind],
        start: { x: start.x / TACTICAL_PITCH_WIDTH, y: start.y / TACTICAL_PITCH_HEIGHT },
        end: { x: end.x / TACTICAL_PITCH_WIDTH, y: end.y / TACTICAL_PITCH_HEIGHT },
        ...(geometry ? {
          // A quadratic Bézier control point can mathematically fall just
          // outside the pitch even when both route endpoints are inside it.
          // Clamp that presentation-only point at the serialization boundary
          // so Schema v1 and the AI context remain normalized to 0..1.
          points: geometry.map((point) => ({
            x: Math.max(0, Math.min(TACTICAL_PITCH_WIDTH, point.x)) / TACTICAL_PITCH_WIDTH,
            y: Math.max(0, Math.min(TACTICAL_PITCH_HEIGHT, point.y)) / TACTICAL_PITCH_HEIGHT,
          })),
        } : {}),
      };
    }),
    layerOrder: ['drawings', 'players'],
  };
  if (!validateDocument(document)) throw new TacticalPlanValidationError('invalid');
  assertJsonSize(document);
  return document;
}

export function restoreTacticalPlan(value: unknown): TacticalBoardState {
  const document = parseTacticalPlan(value);
  return {
    id: document.id,
    gameFormat: document.metadata.gameFormat,
    formation: document.metadata.formation,
    title: document.metadata.title,
    notes: document.metadata.notes,
    createdAt: document.metadata.createdAt,
    updatedAt: document.metadata.updatedAt,
    players: document.players.map((player) => ({
      id: player.id,
      team: player.team,
      number: player.number,
      name: player.name,
      x: player.position.x * 100,
      y: player.position.y * 100,
    })),
    drawings: document.drawings.map((drawing) => ({
      id: drawing.id,
      kind: drawing.kind,
      x1: drawing.start.x * TACTICAL_PITCH_WIDTH,
      y1: drawing.start.y * TACTICAL_PITCH_HEIGHT,
      x2: drawing.end.x * TACTICAL_PITCH_WIDTH,
      y2: drawing.end.y * TACTICAL_PITCH_HEIGHT,
      ...(drawing.points ? {
        points: drawing.points.map((point) => ({ x: point.x * TACTICAL_PITCH_WIDTH, y: point.y * TACTICAL_PITCH_HEIGHT })),
      } : {}),
    })),
  };
}

/**
 * Accept canonical v1 documents and the V13 legacy editor record (schema v2).
 * Legacy records are converted in memory; callers decide when to persist the
 * converted document. The source record is never mutated or deleted.
 */
export function parseTacticalPlan(value: unknown, now = new Date()): TacticalPlanDocument {
  if (!isRecord(value) || containsUnsafeKeys(value)) throw new TacticalPlanValidationError('invalid');
  if (value.format === TACTICAL_PLAN_FORMAT) {
    if (value.schemaVersion !== TACTICAL_PLAN_SCHEMA_VERSION) throw new TacticalPlanValidationError('unsupported-version');
    if (!validateDocument(value)) throw new TacticalPlanValidationError('invalid');
    assertJsonSize(value);
    return value;
  }
  const legacy = value as LegacyV2Plan;
  if ((legacy.schemaVersion !== undefined && legacy.schemaVersion !== 1 && legacy.schemaVersion !== 2) || (legacy.format !== '5v5' && legacy.format !== '7v7')) {
    throw new TacticalPlanValidationError('unsupported-version');
  }
  if (!Array.isArray(legacy.players) || !Array.isArray(legacy.objects)) throw new TacticalPlanValidationError('invalid');
  const gameFormat = legacy.format;
  const currentTime = now.toISOString();
  const updatedAt = isoDate(legacy.updatedAt, currentTime);
  const createdAt = isoDate(legacy.createdAt, updatedAt);
  const formation = typeof legacy.formation === 'string' && DEFAULT_FORMATIONS[gameFormat].includes(legacy.formation)
    ? legacy.formation
    : DEFAULT_FORMATIONS[gameFormat][0];
  const title = typeof legacy.title === 'string' ? legacy.title.slice(0, 70) : 'TAAMEN tactical plan';
  const notes = typeof legacy.notes === 'string' ? legacy.notes.slice(0, 1000) : '';
  const players = legacy.players.map((item: unknown) => {
    if (!isRecord(item)) return item;
    return {
      id: item.id,
      team: item.team,
      number: item.number,
      name: typeof item.name === 'string' ? item.name : '',
      x: item.x,
      y: item.y,
    };
  });
  const drawings = legacy.objects.map((item: unknown) => {
    if (!isRecord(item)) return item;
    return {
      id: item.id,
      kind: item.kind,
      x1: item.x1,
      y1: item.y1,
      x2: item.x2,
      y2: item.y2,
      ...(item.points === undefined ? {} : { points: item.points }),
    };
  });
  if (!validateEditorPlayers(players, gameFormat) || !validateEditorDrawings(drawings)) {
    throw new TacticalPlanValidationError('invalid');
  }
  return serializeTacticalPlan({
    id: typeof legacy.id === 'string' && legacy.id.trim() ? legacy.id : `plan-v3-${gameFormat}`,
    gameFormat,
    formation,
    title,
    notes,
    createdAt,
    updatedAt,
    players,
    drawings,
  }, now);
}

export function parseTacticalPlanJson(json: string, now = new Date()): TacticalPlanDocument {
  const bytes = new TextEncoder().encode(json).byteLength;
  if (bytes > MAX_TACTICAL_PLAN_JSON_BYTES) throw new TacticalPlanValidationError('too-large');
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new TacticalPlanValidationError('invalid');
  }
  return parseTacticalPlan(parsed, now);
}
