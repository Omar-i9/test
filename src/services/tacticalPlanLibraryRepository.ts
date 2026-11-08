import type { TacticalPlanDocument, TacticalPlanGameFormat } from '../domain/tactics/tacticalPlanSchema';
import type { TacticalPlanLibraryEntry } from '../domain/tactics/tacticalPlanLibrary';

/**
 * Cloud-only persistence contract for a verified account.
 * Local Profiles must never receive a permanent library backed by IndexedDB.
 * Every mutation carries the last server revision to prevent silent last-write-wins.
 */
export interface TacticalPlanLibraryRepository {
  list(format: TacticalPlanGameFormat): Promise<TacticalPlanLibraryEntry[]>;
  get(input: { id: string }): Promise<TacticalPlanLibraryEntry>;
  create(input: { document: TacticalPlanDocument; title: string; slotNumber?: number }): Promise<TacticalPlanLibraryEntry>;
  update(input: { id: string; format: TacticalPlanGameFormat; document: TacticalPlanDocument; expectedRevision: number }): Promise<TacticalPlanLibraryEntry>;
  rename(input: { id: string; format: TacticalPlanGameFormat; title: string; expectedRevision: number }): Promise<TacticalPlanLibraryEntry>;
  delete(input: { id: string; format: TacticalPlanGameFormat; expectedRevision: number }): Promise<void>;
}
