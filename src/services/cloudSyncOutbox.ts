import { getAll, deleteItem, putItem } from './localDb';
import type { CloudSyncOperation } from './cloudSyncProtocol';

export type CloudSyncQueueItem = {
  id: string;
  accountScope: string;
  operation: CloudSyncOperation;
  createdAt: number;
  attempts: number;
  lastError?: string;
};

/**
 * Persistent, account-partitioned local outbox. accountScope is only a local partition key;
 * the Worker always derives the real owner from its verified session cookie.
 * This service is deliberately not wired to normal writes until V19 consent + session flows exist.
 */
export async function enqueueCloudSyncOperation(
  accountScope: string,
  operation: CloudSyncOperation,
  options: { cloudSyncConsentAccepted: boolean },
) {
  if (!options.cloudSyncConsentAccepted) throw new Error('Cloud sync consent is required before queueing personal data.');
  if (typeof accountScope !== 'string' || !accountScope.trim() || accountScope.length > 120) {
    throw new Error('A verified account scope is required for the local sync queue.');
  }
  const item: CloudSyncQueueItem = {
    id: operation.operationId,
    accountScope,
    operation,
    createdAt: Date.now(),
    attempts: 0,
  };
  await putItem('syncQueue', item);
  return item;
}

export async function listCloudSyncQueue(accountScope: string): Promise<CloudSyncQueueItem[]> {
  if (typeof accountScope !== 'string' || !accountScope.trim()) return [];
  return (await getAll<CloudSyncQueueItem>('syncQueue'))
    .filter((item) => item.accountScope === accountScope)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

export async function acknowledgeCloudSyncOperation(operationId: string) {
  if (typeof operationId !== 'string' || !operationId.trim()) return;
  await deleteItem('syncQueue', operationId);
}

export async function markCloudSyncAttempt(operationId: string, message: string) {
  const item = (await getAll<CloudSyncQueueItem>('syncQueue')).find((candidate) => candidate.id === operationId);
  if (!item) return;
  await putItem('syncQueue', {
    ...item,
    attempts: Math.min(1000, item.attempts + 1),
    lastError: message.slice(0, 240),
  });
}
