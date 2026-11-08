import type { Match } from '../data/footballData';
import type { LocalProfile } from './profileDraft';

export type CloudSyncEntityType = 'profile' | 'match';
export type CloudSyncOperationKind = 'upsert' | 'delete';
export type CloudSyncPayload = Record<string, unknown>;

export type CloudSyncOperation = {
  operationId: string;
  entityType: CloudSyncEntityType;
  entityId: string;
  operation: CloudSyncOperationKind;
  expectedRevision: number | null;
  payload?: CloudSyncPayload;
};

function secureOperationId() {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure sync operation ID generation is unavailable.');
  return globalThis.crypto.randomUUID();
}

/** Only the display name is synchronized. Email, phone, verification and image fields stay local. */
export function buildCloudProfilePayload(profile: Pick<LocalProfile, 'firstName' | 'lastName'>): CloudSyncPayload {
  return {
    id: 'current',
    firstName: typeof profile.firstName === 'string' ? profile.firstName.trim() : '',
    lastName: typeof profile.lastName === 'string' ? profile.lastName.trim() : '',
  };
}

/** Strip legacy/import bookkeeping and never include browser-only or account credentials. */
export function buildCloudMatchPayload(match: Match): CloudSyncPayload | null {
  const syncableStatuses = new Set(['UPCOMING', 'ACTIVE', 'COMPLETED_PENDING_RESULT', 'COMPLETED_WITH_RESULT', 'ARCHIVED']);
  if (!match || typeof match.id !== 'string' || !match.id.trim() || match.source === 'legacy'
    || match.visibility === 'PRIVATE' || !syncableStatuses.has(match.status)) return null;
  const {
    createdBy: _createdBy,
    sharedFingerprint: _sharedFingerprint,
    ...safeMatch
  } = match;
  void _createdBy;
  void _sharedFingerprint;
  return {
    ...safeMatch,
    source: 'local',
    visibility: match.visibility ?? 'LOCAL',
  };
}

export function createProfileUpsert(
  profile: Pick<LocalProfile, 'firstName' | 'lastName'>,
  expectedRevision: number | null,
  operationId = secureOperationId(),
): CloudSyncOperation {
  return {
    operationId,
    entityType: 'profile',
    entityId: 'current',
    operation: 'upsert',
    expectedRevision,
    payload: buildCloudProfilePayload(profile),
  };
}

export function createMatchUpsert(
  match: Match,
  expectedRevision: number | null,
  operationId = secureOperationId(),
): CloudSyncOperation | null {
  const payload = buildCloudMatchPayload(match);
  if (!payload) return null;
  return {
    operationId,
    entityType: 'match',
    entityId: match.id,
    operation: 'upsert',
    expectedRevision,
    payload,
  };
}

export function createCloudDelete(
  entityType: CloudSyncEntityType,
  entityId: string,
  expectedRevision: number,
  operationId = secureOperationId(),
): CloudSyncOperation {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw new Error('A valid current revision is required before deleting cloud data.');
  }
  return { operationId, entityType, entityId, operation: 'delete', expectedRevision };
}
