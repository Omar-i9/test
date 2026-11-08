
/** HTTP layer for public contact, push notifications, and bounded AI services. */
const API_BASE = (import.meta.env?.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || '/api';

/** A cross-site form cannot set a custom header, so requiring one blocks CSRF. */
const CSRF_HEADER = 'X-TAAMEN-Requested';

export type ContactResult = {
  ok: true;
  contactSent: boolean;
  autoReplySent: boolean;
};

/** Carries the HTTP status so callers can distinguish "not signed in" from "not allowed". */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}


type RequestOptions = { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown };

function csrfCookie(): string {
  if (typeof document === 'undefined') return '';
  const parts = document.cookie.split(';').map((part) => part.trim());
  const item = parts.find((part) => part.startsWith('__Host-taamen_csrf=') || part.startsWith('taamen_csrf='));
  if (!item) return '';
  const value = item.slice(item.indexOf('=') + 1);
  try { return decodeURIComponent(value); } catch { return value; }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function payloadError(payload: unknown): string | undefined {
  if (!isJsonObject(payload)) return undefined;
  return typeof payload.error === 'string' && payload.error.trim() ? payload.error : undefined;
}

function payloadCode(payload: unknown): string | undefined {
  if (!isJsonObject(payload)) return undefined;
  return typeof payload.code === 'string' && /^[a-z0-9_]{1,64}$/.test(payload.code) ? payload.code : undefined;
}

/**
 * SPA fallbacks and proxy HTML pages must never be treated as API success.
 * This prevents an SPA fallback page from being misreported as a successful API response.
 */
function readJsonPayload(response: Response, raw: unknown): Record<string, unknown> {
  const contentType = response.headers.get('content-type') || '';
  const looksJson = contentType.includes('application/json');
  if (looksJson && isJsonObject(raw)) return raw;
  if (!looksJson && isJsonObject(raw) && (typeof raw.error === 'string' || raw.ok === true || 'authenticated' in raw || 'contactSent' in raw)) {
    return raw;
  }
  const status = response.ok ? 502 : response.status;
  throw new ApiError(status, 'TAAMEN server returned an unexpected response.');
}

function asContactResult(payload: Record<string, unknown>): ContactResult {
  if (payload.ok !== true || payload.contactSent !== true) {
    throw new ApiError(502, 'The message could not be delivered.');
  }
  return {
    ok: true,
    contactSent: true,
    autoReplySent: payload.autoReplySent === true,
  };
}

async function request<T>(path: string, { method = 'GET', body }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    headers[CSRF_HEADER] = '1';
    const csrf = csrfCookie();
    if (csrf) headers['X-TAAMEN-CSRF'] = csrf;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'TAAMEN could not reach the server. Check your connection and try again.');
  }

  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, payloadError(raw) || 'The request could not be completed.', payloadCode(raw));
  }
  return readJsonPayload(response, raw) as T;
}

export const api = {
  /** The support recipient is chosen by the server, never by this call. */
  async sendContactMessage(input: { email: string; message: string; name?: string }) {
    const payload = await request<Record<string, unknown>>('/public/contact', { method: 'POST', body: input });
    return asContactResult(payload);
  },

  pushConfig() {
    return request<{ configured: boolean; publicKey: string | null }>('/push/config');
  },

  savePushSubscription(body: unknown) {
    return request<{ ok: true; subscriptionId: string; enabled: boolean; configured: boolean }>('/push/subscribe', { method: 'POST', body });
  },

  disablePushSubscription(subscriptionId: string) {
    return request<{ ok: true; found: boolean; disabled: boolean }>('/push/unsubscribe', { method: 'POST', body: { subscriptionId } });
  },

  schedulePush(body: unknown) {
    return request<{ ok: true; queued: number; configured: boolean }>('/push/schedule', { method: 'POST', body });
  },

  sendTestPush(subscriptionId: string) {
    return request<{ ok: boolean; sent: number; duplicate: boolean }>('/push/test', { method: 'POST', body: { subscriptionId } });
  },

  tacticalPlans: {
    list(format: '5v5' | '7v7') {
      return request<{ plans: unknown[] }>(`/plans?format=${encodeURIComponent(format)}`);
    },
    get(id: string) {
      return request<{ plan: unknown }>(`/plans/${encodeURIComponent(id)}`);
    },
    create(input: { title: string; document: unknown; slotNumber?: number }) {
      return request<{ plan: unknown }>('/plans', { method: 'POST', body: input });
    },
    update(input: { id: string; format: '5v5' | '7v7'; expectedRevision: number; document: unknown }) {
      const { id, ...body } = input;
      return request<{ plan: unknown }>(`/plans/${encodeURIComponent(id)}`, { method: 'PUT', body });
    },
    rename(input: { id: string; format: '5v5' | '7v7'; expectedRevision: number; title: string }) {
      const { id, ...body } = input;
      return request<{ plan: unknown }>(`/plans/${encodeURIComponent(id)}`, { method: 'PATCH', body });
    },
    delete(input: { id: string; format: '5v5' | '7v7'; expectedRevision: number }) {
      const { id, ...body } = input;
      return request<{ ok: true; id: string; deletedAt: string }>(`/plans/${encodeURIComponent(id)}`, { method: 'DELETE', body });
    },
  },
};
