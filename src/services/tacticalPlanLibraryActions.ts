import {
  assertTacticalPlanLibraryCapacity,
  parseTacticalPlanLibraryEntry,
  TacticalPlanLibraryError,
  type TacticalPlanLibraryEntry,
} from '../domain/tactics/tacticalPlanLibrary.ts';
import { parseTacticalPlan, type TacticalPlanDocument } from '../domain/tactics/tacticalPlanSchema.ts';
import type { TacticalPlanLibraryRepository } from './tacticalPlanLibraryRepository';

/** Persist the current draft through the authenticated cloud repository. */
export async function saveTacticalPlanToLibrary(
  repository: TacticalPlanLibraryRepository,
  currentEntries: readonly TacticalPlanLibraryEntry[],
  document: TacticalPlanDocument,
  title: string,
  slotNumber?: number,
): Promise<TacticalPlanLibraryEntry> {
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle.length > 70) throw new TacticalPlanLibraryError('invalid-title');

  assertTacticalPlanLibraryCapacity(currentEntries, document.metadata.gameFormat);
  if (slotNumber !== undefined) {
    if (!Number.isInteger(slotNumber) || slotNumber < 1 || slotNumber > 5) throw new TacticalPlanLibraryError('invalid-slot');
    if (currentEntries.some((entry) => entry.gameFormat === document.metadata.gameFormat && entry.slotNumber === slotNumber)) {
      throw new TacticalPlanLibraryError('slot-occupied');
    }
  }
  const created = parseTacticalPlanLibraryEntry(await repository.create({ document, title: cleanTitle, slotNumber }));
  if (created.gameFormat !== document.metadata.gameFormat || created.title !== cleanTitle || created.revision !== 1
    || (slotNumber !== undefined && created.slotNumber !== slotNumber)) {
    throw new TacticalPlanLibraryError('invalid-entry');
  }
  return created;
}

/** Rename a plan without allowing the server response to change its identity or game format. */
export async function renameTacticalPlanInLibrary(
  repository: TacticalPlanLibraryRepository,
  entry: TacticalPlanLibraryEntry,
  title: string,
): Promise<TacticalPlanLibraryEntry> {
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle.length > 70) throw new TacticalPlanLibraryError('invalid-title');

  const updated = parseTacticalPlanLibraryEntry(await repository.rename({
    id: entry.id,
    format: entry.gameFormat,
    title: cleanTitle,
    expectedRevision: entry.revision,
  }));
  if (updated.id !== entry.id || updated.gameFormat !== entry.gameFormat || updated.createdAt !== entry.createdAt
    || updated.title !== cleanTitle || updated.revision !== entry.revision + 1 || updated.slotNumber !== entry.slotNumber) {
    throw new TacticalPlanLibraryError('invalid-entry');
  }
  return updated;
}

/** Replace a complete saved document only when the caller has the current server revision. */
export async function updateTacticalPlanInLibrary(
  repository: TacticalPlanLibraryRepository,
  entry: TacticalPlanLibraryEntry,
  document: TacticalPlanDocument,
): Promise<TacticalPlanLibraryEntry> {
  const updated = parseTacticalPlanLibraryEntry(await repository.update({
    id: entry.id,
    format: entry.gameFormat,
    document: parseTacticalPlan(document),
    expectedRevision: entry.revision,
  }));
  if (updated.id !== entry.id || updated.gameFormat !== entry.gameFormat
    || updated.createdAt !== entry.createdAt || updated.slotNumber !== entry.slotNumber
    || updated.revision !== entry.revision + 1) {
    throw new TacticalPlanLibraryError('invalid-entry');
  }
  return updated;
}

/** Delete only the cloud entry selected by its id and immutable game format. */
export async function deleteTacticalPlanFromLibrary(
  repository: TacticalPlanLibraryRepository,
  entry: Pick<TacticalPlanLibraryEntry, 'id' | 'gameFormat' | 'revision'>,
): Promise<void> {
  await repository.delete({ id: entry.id, format: entry.gameFormat, expectedRevision: entry.revision });
}

/** Apply a validated library document through the board's guarded replacement callback. */
export async function openTacticalPlanFromLibrary(
  entry: TacticalPlanLibraryEntry,
  onLoadPlan: (plan: TacticalPlanDocument) => void | boolean | Promise<void | boolean>,
): Promise<boolean> {
  const validated = parseTacticalPlan(entry.document);
  const result = await onLoadPlan(validated);
  return result !== false;
}
