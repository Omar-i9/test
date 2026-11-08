import { POLICY_VERSION } from '../config/consent';
const API_BASE = (import.meta.env?.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || '/api';

export type CloudProvider = 'email' | 'google';
export type CloudUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  createdAt: string;
  status: 'active' | 'disabled';
  providers: CloudProvider[];
  identities?: Array<{ provider: CloudProvider; email: string; emailVerified: boolean }>;
  accountPolicy: { acceptedAt: string | null; version: string | null };
  cloudSync: { consented: boolean; consentVersion: string | null; enabled: boolean; available: boolean };
};
export type CloudAuthConfig = { email: boolean; google: boolean; cloudSync: boolean };
export type CloudSession = { authenticated: false } | { authenticated: true; user: CloudUser; csrfReady: boolean };
export type CloudSessionDevice = { id: string; createdAt: string; expiresAt: string; lastSeenAt: string; device: string; current: boolean };

export class CloudAuthError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'CloudAuthError';
    this.status = status;
    this.code = code;
  }
}

function csrfCookie(): string {
  if (typeof document === 'undefined') return '';
  const prefix = document.cookie.split(';').map((part) => part.trim());
  const item = prefix.find((part) => part.startsWith('__Host-taamen_csrf=') || part.startsWith('taamen_csrf='));
  if (!item) return '';
  const value = item.slice(item.indexOf('=') + 1);
  try { return decodeURIComponent(value); } catch { return value; }
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = options.method || 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    headers['X-TAAMEN-Requested'] = '1';
    const csrf = csrfCookie();
    if (csrf) headers['X-TAAMEN-CSRF'] = csrf;
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new CloudAuthError(0, 'تعذر الاتصال بخدمة الحسابات. تحقق من اتصالك وحاول مجددًا.', 'network_error');
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    throw new CloudAuthError(response.status,
      typeof record.error === 'string' ? record.error : 'The account request could not be completed.',
      typeof record.code === 'string' ? record.code : undefined);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new CloudAuthError(502, 'The account service returned an invalid response.', 'invalid_response');
  }
  return payload as T;
}

export const cloudAuthClient = {
  getConfig() { return request<CloudAuthConfig>('/auth/config'); },
  async getSession() {
    let session = await request<CloudSession>('/auth/session');
    if (session.authenticated && !session.csrfReady) {
      await request<{ ok: true }>('/auth/csrf', { method: 'POST', body: {} });
      session = await request<CloudSession>('/auth/session');
    }
    return session;
  },
  requestEmailCode(input: { email: string; firstName: string; lastName: string }) {
    return request<{ ok: true; challengeId: string; expiresInSeconds: number; message: string }>('/auth/email/request', { method: 'POST', body: { ...input, acceptPolicy: true, policyVersion: POLICY_VERSION } });
  },
  verifyEmailCode(input: { email: string; challengeId: string; code: string }) {
    return request<{ ok: true; authenticated: true; user: CloudUser }>('/auth/email/verify', { method: 'POST', body: input });
  },
  requestEmailLinkCode(input: { email: string }) {
    return request<{ ok: true; challengeId: string; expiresInSeconds: number; message: string }>('/auth/email/link/request', { method: 'POST', body: input });
  },
  verifyEmailLinkCode(input: { email: string; challengeId: string; code: string }) {
    return request<{ ok: true; user: CloudUser }>('/auth/email/link/verify', { method: 'POST', body: input });
  },
  unlinkProvider(provider: CloudProvider) {
    return request<{ ok: true; provider: CloudProvider; user: CloudUser }>('/auth/provider/unlink', { method: 'POST', body: { provider } });
  },
  updateProfile(input: { firstName: string; lastName: string }) {
    return request<{ ok: true; user: CloudUser }>('/auth/profile', { method: 'PATCH', body: input });
  },
  saveSyncConsent(accepted: boolean) {
    return request<{ ok: true; consented: boolean; syncEnabled: false; activation: 'v20' }>('/auth/sync-consent', { method: 'POST', body: { accepted } });
  },
  listSessions() { return request<{ sessions: CloudSessionDevice[] }>('/auth/sessions'); },
  revokeSession(sessionId: string) { return request<{ ok: true }>('/auth/sessions/revoke', { method: 'POST', body: { sessionId } }); },
  logout() { return request<{ ok: true; signedOutAll: false }>('/auth/logout', { method: 'POST', body: {} }); },
  logoutAll() { return request<{ ok: true; signedOutAll: true }>('/auth/logout-all', { method: 'POST', body: {} }); },
  async startGoogleSignIn() {
    const result = await request<{ ok: true; authorizationUrl: string }>('/auth/google/start', {
      method: 'POST', body: { acceptPolicy: true, policyVersion: POLICY_VERSION },
    });
    const target = new URL(result.authorizationUrl);
    if (target.protocol !== 'https:' || target.hostname !== 'accounts.google.com') {
      throw new CloudAuthError(502, 'The Google authorization URL was not valid.', 'invalid_google_authorization_url');
    }
    window.location.assign(target.toString());
  },
  async startGoogleLink() {
    const result = await request<{ ok: true; authorizationUrl: string }>('/auth/google/link/start', { method: 'POST', body: {} });
    const target = new URL(result.authorizationUrl);
    if (target.protocol !== 'https:' || target.hostname !== 'accounts.google.com') {
      throw new CloudAuthError(502, 'The Google authorization URL was not valid.', 'invalid_google_authorization_url');
    }
    window.location.assign(target.toString());
  },
};
