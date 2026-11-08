import {
  isTacticalPlanDocument,
  parseTacticalPlan,
  type TacticalPlanDocument,
  type TacticalPlanGameFormat,
} from './tacticalPlanSchema.ts';

export const MAX_TACTICAL_LIBRARY_PLANS_PER_FORMAT = 5;
const FORBIDDEN_LIBRARY_IDS = new Set(['__proto__', 'prototype', 'constructor']);

export type TacticalPlanLibraryEntry = {
  id: string;
  gameFormat: TacticalPlanGameFormat;
  title: string;
  formation: string;
  /** Stable server-assigned position within this format's five cloud slots. */
  slotNumber: number;
  /** Monotonic server revision used for optimistic concurrency. */
  revision: number;
  createdAt: string;
  updatedAt: string;
  document: TacticalPlanDocument;
};

export class TacticalPlanLibraryError extends Error {
  readonly code: 'invalid-entry' | 'limit-reached' | 'not-found' | 'invalid-title' | 'invalid-slot' | 'slot-occupied';

  constructor(code: TacticalPlanLibraryError['code']) {
    const messages = {
      'invalid-entry': 'Invalid tactical plan library entry',
      'limit-reached': 'The tactical plan library is full for this format',
      'not-found': 'Tactical plan library entry was not found',
      'invalid-title': 'Tactical plan title must contain 1–70 characters',
      'invalid-slot': 'The selected tactical plan slot is invalid',
      'slot-occupied': 'The selected tactical plan slot is already occupied',
    };
    super(messages[code]);
    this.name = 'TacticalPlanLibraryError';
    this.code = code;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
}

export function parseTacticalPlanLibraryEntry(value: unknown): TacticalPlanLibraryEntry {
  if (!isPlainRecord(value)) throw new TacticalPlanLibraryError('invalid-entry');
  if (typeof value.id !== 'string' || !value.id.trim() || value.id.length > 120 || FORBIDDEN_LIBRARY_IDS.has(value.id)) {
    throw new TacticalPlanLibraryError('invalid-entry');
  }
  if (value.gameFormat !== '5v5' && value.gameFormat !== '7v7') {
    throw new TacticalPlanLibraryError('invalid-entry');
  }
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 70) {
    throw new TacticalPlanLibraryError('invalid-entry');
  }
  if (typeof value.formation !== 'string' || !value.formation.trim() || value.formation.length > 20) {
    throw new TacticalPlanLibraryError('invalid-entry');
  }
  if (!Number.isInteger(value.slotNumber) || (value.slotNumber as number) < 1 || (value.slotNumber as number) > MAX_TACTICAL_LIBRARY_PLANS_PER_FORMAT) {
    throw new TacticalPlanLibraryError('invalid-entry');
  }
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 1) {
    throw new TacticalPlanLibraryError('invalid-entry');
  }
  if (!validDate(value.createdAt) || !validDate(value.updatedAt) || !isTacticalPlanDocument(value.document)) {
    throw new TacticalPlanLibraryError('invalid-entry');
  }

  const document = parseTacticalPlan(value.document);
  if (document.id !== value.id || document.metadata.gameFormat !== value.gameFormat) {
    throw new TacticalPlanLibraryError('invalid-entry');
  }
  if (document.metadata.title !== value.title || document.metadata.formation !== value.formation
    || document.metadata.createdAt !== value.createdAt || document.metadata.updatedAt !== value.updatedAt) {
    throw new TacticalPlanLibraryError('invalid-entry');
  }

  return {
    id: value.id,
    gameFormat: value.gameFormat,
    title: value.title,
    formation: value.formation,
    slotNumber: value.slotNumber as number,
    revision: value.revision as number,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    document,
  };
}

export function selectTacticalPlanLibraryEntries(
  entries: readonly TacticalPlanLibraryEntry[],
  format: TacticalPlanGameFormat,
): TacticalPlanLibraryEntry[] {
  return entries
    .filter((entry) => entry.gameFormat === format)
    .slice()
    .sort((a, b) => a.slotNumber - b.slotNumber);
}

/** Client-side capacity check for responsive UI. The cloud repository must repeat this atomically on the server. */
export function assertTacticalPlanLibraryCapacity(
  entries: readonly Pick<TacticalPlanLibraryEntry, 'id' | 'gameFormat'>[],
  format: TacticalPlanGameFormat,
  entryId?: string,
): void {
  const occupied = entries.filter((entry) => entry.gameFormat === format && entry.id !== entryId).length;
  if (occupied >= MAX_TACTICAL_LIBRARY_PLANS_PER_FORMAT) {
    throw new TacticalPlanLibraryError('limit-reached');
  }
}

export function createTacticalPlanLibraryEntry(
  source: TacticalPlanDocument,
  id: string,
  title: string,
  now = new Date(),
  serverFields: { slotNumber?: number; revision?: number } = {},
): TacticalPlanLibraryEntry {
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle.length > 70) throw new TacticalPlanLibraryError('invalid-title');
  if (!id.trim() || id.length > 120 || FORBIDDEN_LIBRARY_IDS.has(id)) throw new TacticalPlanLibraryError('invalid-entry');

  const parsed = parseTacticalPlan(source);
  const timestamp = now.toISOString();
  const document: TacticalPlanDocument = {
    ...parsed,
    id,
    metadata: {
      ...parsed.metadata,
      title: cleanTitle,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };

  return {
    id,
    gameFormat: document.metadata.gameFormat,
    title: cleanTitle,
    formation: document.metadata.formation,
    slotNumber: serverFields.slotNumber ?? 1,
    revision: serverFields.revision ?? 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    document,
  };
}

export function renameTacticalPlanLibraryEntry(
  entry: TacticalPlanLibraryEntry,
  title: string,
  now = new Date(),
  serverFields: { slotNumber?: number; revision?: number } = {},
): TacticalPlanLibraryEntry {
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle.length > 70) throw new TacticalPlanLibraryError('invalid-title');
  const timestamp = now.toISOString();
  const document: TacticalPlanDocument = {
    ...entry.document,
    metadata: { ...entry.document.metadata, title: cleanTitle, updatedAt: timestamp },
  };
  return {
    ...entry,
    title: cleanTitle,
    slotNumber: serverFields.slotNumber ?? entry.slotNumber,
    revision: serverFields.revision ?? entry.revision + 1,
    updatedAt: timestamp,
    document,
  };
}

