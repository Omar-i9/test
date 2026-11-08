import type { CloudSyncOperation, CloudSyncEntityType } from './cloudSyncProtocol';

const API_BASE = (import.meta.env?.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || '/api';

export type CloudSyncPushResult = {
  status: 'applied' | 'conflict';
  operationId: string;
  entityType: CloudSyncEntityType;
  entityId: string;
  revision?: number;
  cursor?: number;
  deletedAt?: string | null;
  expectedRevision?: number | null;
  code?: string;
  replayed: boolean;
};

export type CloudSyncChange = {
  cursor: number;
  entityType: CloudSyncEntityType;
  entityId: string;
  revision: number;
  operation: 'upsert' | 'delete';
  changedAt: string;
  updatedAt: string;
  deletedAt?: string;
  payload?: Record<string, unknown>;
};

export type CloudSyncPullPage = {
  changes: CloudSyncChange[];
  nextCursor: number;
  hasMore: boolean;
  serverTime: string;
};

export class CloudSyncError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'CloudSyncError';
    this.status = status;
    this.code = code;
  }
}

function csrfCookie(): string {
  if (typeof document === 'undefined') return '';
  const parts = document.cookie.split(';').map((part) => part.trim());
  const item = parts.find((part) => part.startsWith('__Host-taamen_csrf=') || part.startsWith('taamen_csrf='));
  if (!item) return '';
  const value = item.slice(item.indexOf('=') + 1);
  try { return decodeURIComponent(value); } catch { return value; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function send<T>(path: string, init: RequestInit, fetcher: typeof fetch): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new CloudSyncError(0, 'TAAMEN could not reach the cloud service. Check your connection and retry.');
  }

  const contentType = response.headers.get('content-type') || '';
  const payload: unknown = contentType.includes('application/json') ? await response.json().catch(() => null) : null;
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.error === 'string'
      ? payload.error
      : 'The cloud synchronization request could not be completed.';
    const code = isRecord(payload) && typeof payload.code === 'string' ? payload.code : undefined;
    throw new CloudSyncError(response.status, message, code);
  }
  if (!isRecord(payload)) throw new CloudSyncError(502, 'The cloud service returned an unexpected response.');
  return payload as T;
}

export function createCloudSyncClient(fetcher: typeof fetch = fetch) {
  return {
    async push(operations: CloudSyncOperation[]): Promise<{ results: CloudSyncPushResult[]; serverTime: string }> {
      if (!Array.isArray(operations) || operations.length < 1 || operations.length > 25) {
        throw new CloudSyncError(400, 'A sync push must contain between 1 and 25 operations.');
      }
      const result = await send<{ results?: unknown; serverTime?: unknown }>('/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-TAAMEN-Requested': '1', ...(csrfCookie() ? { 'X-TAAMEN-CSRF': csrfCookie() } : {}) },
        body: JSON.stringify({ operations }),
      }, fetcher);
      if (!Array.isArray(result.results) || typeof result.serverTime !== 'string') {
        throw new CloudSyncError(502, 'The cloud service returned an invalid sync result.');
      }
      return result as { results: CloudSyncPushResult[]; serverTime: string };
    },

    async pull(cursor = 0, limit = 100): Promise<CloudSyncPullPage> {
      if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new CloudSyncError(400, 'The sync cursor or page limit is invalid.');
      }
      const result = await send<Partial<CloudSyncPullPage>>(
        `/sync/pull?cursor=${encodeURIComponent(String(cursor))}&limit=${encodeURIComponent(String(limit))}`,
        { method: 'GET', headers: { Accept: 'application/json' } },
        fetcher,
      );
      if (!Array.isArray(result.changes)
        || !Number.isSafeInteger(result.nextCursor) || (result.nextCursor as number) < cursor
        || typeof result.hasMore !== 'boolean' || typeof result.serverTime !== 'string') {
        throw new CloudSyncError(502, 'The cloud service returned an invalid sync page.');
      }
      return result as CloudSyncPullPage;
    },
  };
}

export const cloudSyncClient = createCloudSyncClient();
