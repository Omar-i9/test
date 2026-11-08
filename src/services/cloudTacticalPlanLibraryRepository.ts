import { ApiError, api } from './apiClient.ts';
import {
  parseTacticalPlanLibraryEntry,
  selectTacticalPlanLibraryEntries,
  type TacticalPlanLibraryEntry,
} from '../domain/tactics/tacticalPlanLibrary.ts';
import type { TacticalPlanDocument, TacticalPlanGameFormat } from '../domain/tactics/tacticalPlanSchema.ts';
import type { TacticalPlanLibraryRepository } from './tacticalPlanLibraryRepository.ts';

const MAX_CLOUD_PLAN_BYTES = 256 * 1024;

function assertCloudPlanSize(document: TacticalPlanDocument) {
  const bytes = new TextEncoder().encode(JSON.stringify(document)).byteLength;
  if (bytes > MAX_CLOUD_PLAN_BYTES) {
    throw new ApiError(413, 'A saved tactical plan cannot exceed 256 KiB.', 'plan_too_large');
  }
}

function parseServerEntry(value: unknown): TacticalPlanLibraryEntry {
  try {
    return parseTacticalPlanLibraryEntry(value);
  } catch {
    throw new ApiError(502, 'The cloud returned an invalid tactical plan record.', 'invalid_server_record');
  }
}

function ensureUniqueSlots(entries: TacticalPlanLibraryEntry[], format: TacticalPlanGameFormat) {
  if (entries.length > 5) {
    throw new ApiError(502, 'The cloud returned more than five plans for this format.', 'server_capacity_violation');
  }
  const slots = new Set<number>();
  for (const entry of entries) {
    if (entry.gameFormat !== format || slots.has(entry.slotNumber)) {
      throw new ApiError(502, 'The cloud returned conflicting plan slots.', 'server_slot_conflict');
    }
    slots.add(entry.slotNumber);
  }
  return selectTacticalPlanLibraryEntries(entries, format);
}

/**
 * Authenticated cloud adapter. It deliberately has no IndexedDB fallback:
 * Local Profiles must not gain a permanent local plan library by accident.
 */
export class CloudTacticalPlanLibraryRepository implements TacticalPlanLibraryRepository {
  async list(format: TacticalPlanGameFormat): Promise<TacticalPlanLibraryEntry[]> {
    const response = await api.tacticalPlans.list(format);
    if (!Array.isArray(response.plans)) {
      throw new ApiError(502, 'The cloud returned an invalid plan list.', 'invalid_server_response');
    }
    if (response.plans.length > 5) {
      throw new ApiError(502, 'The cloud returned more than five plans for this format.', 'server_capacity_violation');
    }
    return ensureUniqueSlots(response.plans.map(parseServerEntry), format);
  }

  async get(input: { id: string }): Promise<TacticalPlanLibraryEntry> {
    const response = await api.tacticalPlans.get(input.id);
    const entry = parseServerEntry(response.plan);
    if (entry.id !== input.id) {
      throw new ApiError(502, 'The cloud returned a different plan than requested.', 'server_identity_mismatch');
    }
    return entry;
  }

  async create(input: { document: TacticalPlanDocument; title: string; slotNumber?: number }): Promise<TacticalPlanLibraryEntry> {
    assertCloudPlanSize(input.document);
    const cleanTitle = input.title.trim();
    const response = await api.tacticalPlans.create({ document: input.document, title: cleanTitle, slotNumber: input.slotNumber });
    const entry = parseServerEntry(response.plan);
    if (entry.gameFormat !== input.document.metadata.gameFormat || entry.title !== cleanTitle || entry.revision !== 1
      || (input.slotNumber !== undefined && entry.slotNumber !== input.slotNumber)) {
      throw new ApiError(502, 'The cloud returned an unexpected new plan record.', 'server_identity_mismatch');
    }
    return entry;
  }

  async update(input: {
    id: string;
    format: TacticalPlanGameFormat;
    document: TacticalPlanDocument;
    expectedRevision: number;
  }): Promise<TacticalPlanLibraryEntry> {
    assertCloudPlanSize(input.document);
    const response = await api.tacticalPlans.update(input);
    const entry = parseServerEntry(response.plan);
    if (entry.id !== input.id || entry.gameFormat !== input.format || entry.revision !== input.expectedRevision + 1) {
      throw new ApiError(502, 'The cloud returned an unexpected updated plan record.', 'server_identity_mismatch');
    }
    return entry;
  }

  async rename(input: {
    id: string;
    format: TacticalPlanGameFormat;
    title: string;
    expectedRevision: number;
  }): Promise<TacticalPlanLibraryEntry> {
    const response = await api.tacticalPlans.rename(input);
    const entry = parseServerEntry(response.plan);
    if (entry.id !== input.id || entry.gameFormat !== input.format || entry.title !== input.title.trim()
      || entry.revision !== input.expectedRevision + 1) {
      throw new ApiError(502, 'The cloud returned an unexpected renamed plan record.', 'server_identity_mismatch');
    }
    return entry;
  }

  async delete(input: {
    id: string;
    format: TacticalPlanGameFormat;
    expectedRevision: number;
  }): Promise<void> {
    const response = await api.tacticalPlans.delete(input);
    if (response.ok !== true || response.id !== input.id || typeof response.deletedAt !== 'string'
      || !Number.isFinite(Date.parse(response.deletedAt))) {
      throw new ApiError(502, 'The cloud returned an invalid delete confirmation.', 'invalid_delete_response');
    }
  }
}

export function createCloudTacticalPlanLibraryRepository(): TacticalPlanLibraryRepository {
  return new CloudTacticalPlanLibraryRepository();
}
