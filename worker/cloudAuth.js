const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
const ACCOUNT_POLICY_VERSION = '2.3';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const SESSION_COOKIE = 'taamen_session';
const CSRF_COOKIE = 'taamen_csrf';
const GOOGLE_BIND_COOKIE = 'taamen_oauth_bind';
const CSRF_HEADER = 'X-TAAMEN-CSRF';
const REQUEST_HEADER = 'X-TAAMEN-Requested';

class AuthError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

function json(status, payload, extraHeaders = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, private',
    'Pragma': 'no-cache',
    'Vary': 'Cookie',
  });
  for (const [name, value] of Object.entries(extraHeaders)) {
    if (name.toLowerCase() === 'set-cookie' && Array.isArray(value)) {
      for (const cookie of value) headers.append('Set-Cookie', cookie);
    } else {
      headers.set(name, String(value));
    }
  }
  return new Response(JSON.stringify(payload), { status, headers });
}

function redirect(url, cookies = []) {
  const headers = new Headers({ Location: url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}

function nowIso(clock) { return clock().toISOString(); }
function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}
function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function randomToken(length = 32) { return base64Url(randomBytes(length)); }
function randomUuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((v) => v.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}
function cookieMap(request) {
  const out = new Map();
  const raw = request.headers.get('cookie') || '';
  for (const item of raw.split(';')) {
    const index = item.indexOf('=');
    if (index < 1) continue;
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    if (key && value) out.set(key, value);
  }
  return out;
}
function cookieNames(url) {
  return url.protocol === 'https:'
    ? { session: `__Host-${SESSION_COOKIE}`, csrf: `__Host-${CSRF_COOKIE}`, secure: true }
    : { session: SESSION_COOKIE, csrf: CSRF_COOKIE, secure: false };
}
function cookieValue(request, url, kind) {
  const names = cookieNames(url);
  const map = cookieMap(request);
  // Never fall back from __Host- cookies on HTTPS: doing so would re-open a subdomain cookie-injection path.
  if (names.secure) return map.get(names[kind]) || '';
  return map.get(names[kind]) || '';
}
function oauthBindingCookie(url, value, maxAge = 600) {
  const secure = url.protocol === 'https:';
  return serializeCookie(secure ? `__Host-${GOOGLE_BIND_COOKIE}` : GOOGLE_BIND_COOKIE, value, {
    httpOnly: true, secure, sameSite: 'Lax', maxAge,
  });
}
function oauthBindingValue(request, url) {
  const key = url.protocol === 'https:' ? `__Host-${GOOGLE_BIND_COOKIE}` : GOOGLE_BIND_COOKIE;
  return cookieMap(request).get(key) || '';
}
function pepperReady(env) { return typeof env?.AUTH_PEPPER === 'string' && env.AUTH_PEPPER.length >= 32; }
function serializeCookie(name, value, { httpOnly = false, secure = true, sameSite = 'Lax', maxAge = 0 } = {}) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=${sameSite}${httpOnly ? '; HttpOnly' : ''}${secure ? '; Secure' : ''}`;
}
function sessionCookies(url, token, csrfToken) {
  const names = cookieNames(url);
  return [
    serializeCookie(names.session, token, { httpOnly: true, secure: names.secure, sameSite: 'Lax', maxAge: Math.floor(SESSION_TTL_MS / 1000) }),
    serializeCookie(names.csrf, csrfToken, { secure: names.secure, sameSite: 'Strict', maxAge: Math.floor(SESSION_TTL_MS / 1000) }),
  ];
}
function clearCookies(url) {
  const names = cookieNames(url);
  return [
    serializeCookie(names.session, '', { httpOnly: true, secure: names.secure, sameSite: 'Lax', maxAge: 0 }),
    serializeCookie(names.csrf, '', { secure: names.secure, sameSite: 'Strict', maxAge: 0 }),
  ];
}
function requireDb(env) {
  if (!env?.TAAMEN_DB?.prepare) throw new AuthError(503, 'cloud_database_unavailable', 'Cloud accounts are temporarily unavailable.');
  return env.TAAMEN_DB;
}
function requireSameOrigin(request, url, { requireRequestHeader = true } = {}) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== url.origin) throw new AuthError(403, 'origin_rejected', 'This request must come from TAAMEN.');
  if (requireRequestHeader && request.headers.get(REQUEST_HEADER) !== '1') {
    throw new AuthError(403, 'csrf_header_required', 'The required TAAMEN request header is missing.');
  }
  const site = request.headers.get('sec-fetch-site');
  if (site && !['same-origin', 'same-site', 'none'].includes(site)) {
    throw new AuthError(403, 'origin_rejected', 'Cross-site requests are not allowed.');
  }
}
async function readBody(request, maxBytes = 8192) {
  const contentType = request.headers.get('content-type') || '';
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) throw new AuthError(415, 'json_required', 'A JSON request is required.');
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new AuthError(413, 'body_too_large', 'The request is too large.');
  if (!request.body) throw new AuthError(400, 'invalid_json', 'A JSON request body is required.');
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new AuthError(413, 'body_too_large', 'The request is too large.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value;
  } catch {
    throw new AuthError(400, 'invalid_json', 'The request body is invalid.');
  }
}
function normalizeEmail(value) {
  if (typeof value !== 'string') throw new AuthError(400, 'invalid_email', 'Enter a valid email address.');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError(400, 'invalid_email', 'Enter a valid email address.');
  }
  return email;
}
function cleanName(value, required = false) {
  if (typeof value !== 'string') throw new AuthError(400, 'invalid_name', 'Enter a valid name.');
  const name = value.trim().replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ');
  if ((required && !name) || name.length > 60) throw new AuthError(400, 'invalid_name', 'Names must contain 1–60 characters.');
  return name;
}
function isLocalHost(url) { return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'; }
function requireHttps(request, env, url) {
  if (env.REQUIRE_HTTPS === 'true' && url.protocol !== 'https:' && !isLocalHost(url)) {
    throw new AuthError(400, 'https_required', 'Secure HTTPS is required for account access.');
  }
}
function userAgent(request) { return (request.headers.get('user-agent') || '').slice(0, 180); }

async function rateLimit(db, key, { limit, nowMs }) {
  const windowStart = Math.floor(nowMs / RATE_WINDOW_MS) * RATE_WINDOW_MS;
  await db.prepare(`
    INSERT INTO auth_rate_limits(scope_key, window_start, request_count)
    VALUES(?, ?, 1)
    ON CONFLICT(scope_key) DO UPDATE SET
      request_count = CASE WHEN auth_rate_limits.window_start = excluded.window_start THEN MIN(auth_rate_limits.request_count + 1, ?) ELSE 1 END,
      window_start = excluded.window_start
  `).bind(key, windowStart, limit + 1).run();
  const row = await db.prepare('SELECT request_count FROM auth_rate_limits WHERE scope_key = ? LIMIT 1').bind(key).first();
  if (Number(row?.request_count || 0) > limit) throw new AuthError(429, 'rate_limited', 'Too many attempts. Wait a little and try again.');
}

async function sendEmailCode(env, { email, firstName, code }) {
  const serviceId = env.EMAILJS_SERVICE_ID;
  const templateId = env.EMAILJS_AUTH_TEMPLATE_ID;
  const publicKey = env.EMAILJS_PUBLIC_KEY;
  if (!serviceId || !templateId || !publicKey) return false;
  const payload = {
    service_id: serviceId,
    template_id: templateId,
    user_id: publicKey,
    template_params: {
      to_email: email,
      to_name: firstName || 'TAAMEN user',
      otp_code: code,
      verification_code: code,
      app_name: 'TAAMEN',
      expires_minutes: '10',
    },
  };
  if (env.EMAILJS_PRIVATE_KEY) payload.accessToken = env.EMAILJS_PRIVATE_KEY;
  try {
    const response = await fetch(EMAILJS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: env.EMAILJS_ORIGIN || 'https://taamenn.com' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) await response.body?.cancel().catch(() => {});
    return response.ok;
  } catch {
    return false;
  }
}

async function getSession(request, env, { requireCsrf = false } = {}) {
  const url = new URL(request.url);
  const token = cookieValue(request, url, 'session');
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) return null;
  const db = requireDb(env);
  const tokenHash = await sha256(`${env.AUTH_PEPPER || ''}:${token}`);
  const row = await db.prepare(`
    SELECT s.id AS session_id, s.user_id, s.csrf_hash, s.expires_at, s.revoked_at, s.last_seen_at,
           u.status, u.email, u.email_verified_at, u.display_first_name, u.display_last_name,
           u.created_at AS account_created_at, u.cloud_sync_consent_at, u.cloud_sync_consent_version,
           u.cloud_sync_enabled, u.account_policy_accepted_at, u.account_policy_version
      FROM cloud_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? LIMIT 1
  `).bind(tokenHash).first();
  if (!row || row.revoked_at || row.status !== 'active' || Date.parse(row.expires_at) <= Date.now()) return null;
  if (requireCsrf) {
    const csrfCookie = cookieValue(request, url, 'csrf');
    const csrfHeader = request.headers.get(CSRF_HEADER) || '';
    if (!csrfCookie || !safeEqual(csrfCookie, csrfHeader)) return null;
    const csrfHash = await sha256(`${env.AUTH_PEPPER || ''}:${csrfCookie}`);
    if (!safeEqual(csrfHash, row.csrf_hash)) return null;
  }
  const lastSeen = Date.parse(row.last_seen_at || '');
  if (!Number.isFinite(lastSeen) || Date.now() - lastSeen >= 5 * 60 * 1000) {
    const touchedAt = new Date().toISOString();
    await db.prepare('UPDATE cloud_sessions SET last_seen_at = ? WHERE id = ? AND revoked_at IS NULL').bind(touchedAt, row.session_id).run();
    row.last_seen_at = touchedAt;
  }
  return row;
}

export async function resolveAuthenticatedCloudUser(request, env) {
  const session = await getSession(request, env, { requireCsrf: request.method.toUpperCase() !== 'GET' && request.method.toUpperCase() !== 'HEAD' });
  if (!session) return null;
  return {
    id: session.user_id,
    status: session.status,
    cloudSyncConsented: Boolean(session.cloud_sync_consent_at),
    cloudSyncEnabled: Number(session.cloud_sync_enabled) === 1,
  };
}

async function issueSession(db, request, env, url, userId, clock) {
  const token = randomToken(32);
  const csrfToken = randomToken(32);
  const now = clock();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);
  // Keep the session ledger bounded without deleting recently revoked rows needed for audit/debugging.
  await db.prepare('DELETE FROM cloud_sessions WHERE expires_at < ? OR revoked_at < ?')
    .bind(now.toISOString(), new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()).run();
  await db.prepare(`
    INSERT INTO cloud_sessions(id, user_id, token_hash, csrf_hash, created_at, expires_at, last_seen_at, user_agent)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    randomUuid(), userId,
    await sha256(`${env.AUTH_PEPPER || ''}:${token}`),
    await sha256(`${env.AUTH_PEPPER || ''}:${csrfToken}`),
    now.toISOString(), expires.toISOString(), now.toISOString(), userAgent(request),
  ).run();
  return { cookies: sessionCookies(url, token, csrfToken), csrfToken };
}

async function publicUser(db, userId) {
  const row = await db.prepare(`
    SELECT id, email, email_verified_at, display_first_name, display_last_name, created_at, status,
           cloud_sync_consent_at, cloud_sync_consent_version, cloud_sync_enabled,
           account_policy_accepted_at, account_policy_version
      FROM users WHERE id = ? LIMIT 1
  `).bind(userId).first();
  if (!row) throw new AuthError(401, 'not_authenticated', 'A verified cloud account is required.');
  const identities = await db.prepare('SELECT provider, email, email_verified_at FROM account_identities WHERE user_id = ? ORDER BY provider').bind(userId).all();
  return {
    id: row.id,
    email: row.email,
    emailVerified: Boolean(row.email_verified_at),
    firstName: row.display_first_name || '',
    lastName: row.display_last_name || '',
    createdAt: row.created_at,
    status: row.status,
    providers: (identities.results || []).map((item) => item.provider),
    identities: (identities.results || []).map((item) => ({ provider: item.provider, email: item.email, emailVerified: Boolean(item.email_verified_at) })),
    accountPolicy: { acceptedAt: row.account_policy_accepted_at || null, version: row.account_policy_version || null },
    cloudSync: {
      consented: Boolean(row.cloud_sync_consent_at),
      consentVersion: row.cloud_sync_consent_version || null,
      enabled: Number(row.cloud_sync_enabled) === 1,
      available: false,
    },
  };
}

async function createOrLinkEmailUser(db, { email, firstName, lastName, now }) {
  const [primaryOwner, existingIdentity] = await Promise.all([
    db.prepare('SELECT id, status FROM users WHERE lower(email) = ? LIMIT 1').bind(email).first(),
    db.prepare(`SELECT u.id, u.status FROM account_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = 'email' AND i.provider_subject = ? LIMIT 1`).bind(email).first(),
  ]);
  // A legacy/corrupt cross-account collision must fail closed. Never choose one
  // account merely because an identity row or primary-email row was found first.
  if (primaryOwner && existingIdentity && primaryOwner.id !== existingIdentity.id) {
    throw new AuthError(409, 'email_identity_collision', 'This email is associated with conflicting TAAMEN accounts. Contact support before proceeding.');
  }
  if (existingIdentity) {
    if (existingIdentity.status !== 'active') throw new AuthError(403, 'account_disabled', 'This account is not active.');
    await db.prepare(`UPDATE account_identities SET email_verified_at = ?, updated_at = ? WHERE provider = 'email' AND provider_subject = ? AND user_id = ?`).bind(now, now, email, existingIdentity.id).run();
    await db.prepare(`UPDATE users SET email_verified_at = CASE WHEN lower(email) = ? THEN COALESCE(email_verified_at, ?) ELSE email_verified_at END, updated_at = ? WHERE id = ?`).bind(email, now, now, existingIdentity.id).run();
    return existingIdentity.id;
  }
  let user = primaryOwner;
  if (user && user.status !== 'active') throw new AuthError(403, 'account_disabled', 'This account is not active.');
  if (!user) {
    const id = randomUuid();
    try {
      await db.prepare(`
        INSERT INTO users(id, status, created_at, updated_at, email, email_verified_at, display_first_name, display_last_name)
        VALUES(?, 'active', ?, ?, ?, ?, ?, ?)
      `).bind(id, now, now, email, now, firstName, lastName).run();
      user = { id, status: 'active' };
    } catch {
      user = await db.prepare('SELECT id, status FROM users WHERE lower(email) = ? LIMIT 1').bind(email).first();
      if (!user || user.status !== 'active') throw new AuthError(409, 'account_creation_conflict', 'The account could not be created. Try again.');
    }
  } else {
    await db.prepare(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?),
      display_first_name = CASE WHEN display_first_name = '' THEN ? ELSE display_first_name END,
      display_last_name = CASE WHEN display_last_name = '' THEN ? ELSE display_last_name END,
      updated_at = ? WHERE id = ?`).bind(now, firstName, lastName, now, user.id).run();
  }
  const identityId = randomUuid();
  try {
    await db.prepare(`
      INSERT INTO account_identities(id, user_id, provider, provider_subject, email, email_verified_at, created_at, updated_at)
      VALUES(?, ?, 'email', ?, ?, ?, ?, ?)
      ON CONFLICT(provider, provider_subject) DO NOTHING
    `).bind(identityId, user.id, email, email, now, now, now).run();
  } catch {
    throw new AuthError(409, 'email_identity_conflict', 'This email identity is already attached to another account.');
  }
  const resolved = await db.prepare(`SELECT user_id FROM account_identities WHERE provider = 'email' AND provider_subject = ? LIMIT 1`).bind(email).first();
  if (!resolved || resolved.user_id !== user.id) throw new AuthError(409, 'email_identity_conflict', 'This email identity is already attached to another account.');
  return user.id;
}

async function createOrLinkGoogleUser(db, profile, now) {
  const { sub, email, given_name: givenName = '', family_name: familyName = '' } = profile;
  let identity = await db.prepare(`
    SELECT u.id, u.status FROM account_identities i JOIN users u ON u.id = i.user_id
     WHERE i.provider = 'google' AND i.provider_subject = ? LIMIT 1
  `).bind(sub).first();
  if (identity) {
    if (identity.status !== 'active') throw new AuthError(403, 'account_disabled', 'This account is not active.');
    await db.prepare(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?`)
      .bind(now, now, identity.id).run();
    return identity.id;
  }
  let user = await db.prepare('SELECT id, status FROM users WHERE lower(email) = ? LIMIT 1').bind(email).first();
  if (user && user.status !== 'active') throw new AuthError(403, 'account_disabled', 'This account is not active.');
  if (!user) {
    const id = randomUuid();
    try {
      await db.prepare(`
        INSERT INTO users(id, status, created_at, updated_at, email, email_verified_at, display_first_name, display_last_name)
        VALUES(?, 'active', ?, ?, ?, ?, ?, ?)
      `).bind(id, now, now, email, now, cleanName(givenName), cleanName(familyName)).run();
      user = { id, status: 'active' };
    } catch {
      user = await db.prepare('SELECT id, status FROM users WHERE lower(email) = ? LIMIT 1').bind(email).first();
      if (!user || user.status !== 'active') throw new AuthError(409, 'account_creation_conflict', 'The account could not be created. Try again.');
    }
  } else {
    await db.prepare(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?),
      display_first_name = CASE WHEN display_first_name = '' THEN ? ELSE display_first_name END,
      display_last_name = CASE WHEN display_last_name = '' THEN ? ELSE display_last_name END,
      updated_at = ? WHERE id = ?`).bind(now, cleanName(givenName), cleanName(familyName), now, user.id).run();
  }
  await db.prepare(`
    INSERT INTO account_identities(id, user_id, provider, provider_subject, email, email_verified_at, created_at, updated_at)
    VALUES(?, ?, 'google', ?, ?, ?, ?, ?)
    ON CONFLICT(provider, provider_subject) DO NOTHING
  `).bind(randomUuid(), user.id, sub, email, now, now, now).run();
  return user.id;
}

async function recordAccountPolicyAcceptance(db, userId, version, now) {
  if (version !== ACCOUNT_POLICY_VERSION) throw new AuthError(428, 'policy_acceptance_required', 'Review and accept the current account privacy terms before signing in.');
  await db.prepare('UPDATE users SET account_policy_accepted_at = ?, account_policy_version = ?, updated_at = ? WHERE id = ? AND status = \'active\'')
    .bind(now, version, now, userId).run();
}

async function emailRequest(request, env, url, clock) {
  requireSameOrigin(request, url);
  const body = await readBody(request);
  if (body.acceptPolicy !== true || body.policyVersion !== ACCOUNT_POLICY_VERSION) throw new AuthError(428, 'policy_acceptance_required', 'Review and explicitly accept the current account privacy terms before requesting a code.');
  const email = normalizeEmail(body.email);
  const firstName = cleanName(body.firstName, true);
  const lastName = cleanName(body.lastName || '');
  if (!pepperReady(env)) throw new AuthError(503, 'auth_not_configured', 'Email sign-in is not configured yet.');
  const db = requireDb(env);
  const now = clock();
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  await rateLimit(db, `email:${await sha256(`${env.AUTH_PEPPER}:${email}`)}`, { limit: 3, nowMs: now.getTime() });
  await rateLimit(db, `ip:${await sha256(`${env.AUTH_PEPPER}:${ip}`)}`, { limit: 10, nowMs: now.getTime() });
  await db.prepare('DELETE FROM auth_rate_limits WHERE window_start < ?').bind(now.getTime() - 24 * 60 * 60 * 1000).run();
  await db.prepare('DELETE FROM email_auth_challenges WHERE expires_at < ? OR consumed_at IS NOT NULL OR attempts >= 5')
    .bind(now.toISOString()).run();
  // A resend invalidates every still-live code for this address before a new one is issued.
  await db.prepare(`UPDATE email_auth_challenges SET consumed_at = ? WHERE email = ? AND purpose = 'signin' AND consumed_at IS NULL AND expires_at > ? AND attempts < 5`)
    .bind(now.toISOString(), email, now.toISOString()).run();
  let randomNumber = 0;
  // Rejection sampling avoids modulo bias in the six-digit code space.
  do {
    const random = randomBytes(4);
    randomNumber = ((random[0] << 24) | (random[1] << 16) | (random[2] << 8) | random[3]) >>> 0;
  } while (randomNumber >= 4294000000);
  const code = String(randomNumber % 1000000).padStart(6, '0');
  const id = randomUuid();
  const codeHash = await sha256(`${env.AUTH_PEPPER}:${id}:${code}`);
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS).toISOString();
  await db.prepare(`INSERT INTO email_auth_challenges(id, email, first_name, last_name, policy_version, code_hash, attempts, expires_at, created_at, purpose)
    VALUES(?, ?, ?, ?, ?, ?, 0, ?, ?, 'signin')`)
    .bind(id, email, firstName, lastName, ACCOUNT_POLICY_VERSION, codeHash, expiresAt, now.toISOString()).run();
  const sent = await sendEmailCode(env, { email, firstName, code });
  if (!sent) {
    await db.prepare('DELETE FROM email_auth_challenges WHERE id = ?').bind(id).run();
    throw new AuthError(503, 'email_delivery_unavailable', 'Email verification is temporarily unavailable.');
  }
  return json(200, { ok: true, challengeId: id, expiresInSeconds: OTP_TTL_MS / 1000, message: 'If this address can be used, a sign-in code has been sent.' });
}

async function emailVerify(request, env, url, clock) {
  requireSameOrigin(request, url);
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  const challengeId = typeof body.challengeId === 'string' ? body.challengeId : '';
  const code = typeof body.code === 'string' ? body.code.replace(/\s/g, '') : '';
  if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !/^\d{6}$/.test(code)) {
    throw new AuthError(400, 'invalid_code', 'Enter the six-digit code from your email.');
  }
  if (!pepperReady(env)) throw new AuthError(503, 'auth_not_configured', 'Email sign-in is not configured yet.');
  const db = requireDb(env);
  const now = clock();
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  await rateLimit(db, `verify:${await sha256(`${env.AUTH_PEPPER}:${ip}`)}`, { limit: 15, nowMs: now.getTime() });
  const challenge = await db.prepare(`SELECT * FROM email_auth_challenges WHERE id = ? AND email = ? AND purpose = 'signin' LIMIT 1`)
    .bind(challengeId, email).first();
  if (!challenge || challenge.consumed_at || Date.parse(challenge.expires_at) <= now.getTime() || Number(challenge.attempts) >= 5 || challenge.policy_version !== ACCOUNT_POLICY_VERSION) {
    throw new AuthError(400, 'challenge_expired', 'This code is no longer valid. Request a new one.');
  }
  const expected = await sha256(`${env.AUTH_PEPPER}:${challengeId}:${code}`);
  if (!safeEqual(expected, challenge.code_hash)) {
    await db.prepare('UPDATE email_auth_challenges SET attempts = attempts + 1 WHERE id = ? AND consumed_at IS NULL AND attempts < 5').bind(challengeId).run();
    throw new AuthError(400, 'invalid_code', 'The code is incorrect. Check it and try again.');
  }
  const consumed = await db.prepare(`UPDATE email_auth_challenges SET consumed_at = ? WHERE id = ? AND purpose = 'signin' AND consumed_at IS NULL AND expires_at > ? AND attempts < 5`)
    .bind(now.toISOString(), challengeId, now.toISOString()).run();
  if (Number(consumed.meta?.changes ?? 0) !== 1) throw new AuthError(409, 'challenge_already_used', 'This code has already been used. Request a new one.');
  const userId = await createOrLinkEmailUser(db, {
    email,
    firstName: cleanName(challenge.first_name || ''),
    lastName: cleanName(challenge.last_name || ''),
    now: now.toISOString(),
  });
  await recordAccountPolicyAcceptance(db, userId, challenge.policy_version, now.toISOString());
  const session = await issueSession(db, request, env, url, userId, clock);
  const user = await publicUser(db, userId);
  return json(200, { ok: true, authenticated: true, user }, { 'Set-Cookie': session.cookies });
}

async function emailLinkRequest(request, env, url, clock) {
  requireSameOrigin(request, url);
  const session = await authenticated(request, env, { csrf: true });
  const body = await readBody(request, 4096);
  const email = normalizeEmail(body.email);
  if (!pepperReady(env) || !env.EMAILJS_SERVICE_ID || !env.EMAILJS_AUTH_TEMPLATE_ID || !env.EMAILJS_PUBLIC_KEY) {
    throw new AuthError(503, 'email_link_unavailable', 'Email verification is not configured yet.');
  }
  const db = requireDb(env);
  const now = clock();
  const owner = await db.prepare(`SELECT id FROM users WHERE lower(email) = ? LIMIT 1`).bind(email).first();
  if (owner && owner.id !== session.user_id) throw new AuthError(409, 'email_owned_by_other_account', 'This email belongs to a different TAAMEN account.');
  const existingIdentity = await db.prepare(`SELECT user_id FROM account_identities WHERE provider = 'email' AND provider_subject = ? LIMIT 1`).bind(email).first();
  if (existingIdentity) {
    if (existingIdentity.user_id === session.user_id) throw new AuthError(409, 'provider_already_linked', 'This email is already linked to your account.');
    throw new AuthError(409, 'email_identity_in_use', 'This email is already linked to a different account.');
  }
  const alreadyLinked = await db.prepare(`SELECT 1 AS present FROM account_identities WHERE user_id = ? AND provider = 'email' LIMIT 1`).bind(session.user_id).first();
  if (alreadyLinked) throw new AuthError(409, 'provider_already_linked', 'An email identity is already linked to this account.');
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  await rateLimit(db, `email-link:${await sha256(`${env.AUTH_PEPPER}:${email}`)}`, { limit: 3, nowMs: now.getTime() });
  await rateLimit(db, `email-link-ip:${await sha256(`${env.AUTH_PEPPER}:${ip}`)}`, { limit: 10, nowMs: now.getTime() });
  await db.prepare(`UPDATE email_auth_challenges SET consumed_at = ? WHERE email = ? AND purpose = 'link' AND user_id = ? AND consumed_at IS NULL`)
    .bind(now.toISOString(), email, session.user_id).run();
  let randomNumber = 0;
  do {
    const random = randomBytes(4);
    randomNumber = ((random[0] << 24) | (random[1] << 16) | (random[2] << 8) | random[3]) >>> 0;
  } while (randomNumber >= 4294000000);
  const code = String(randomNumber % 1000000).padStart(6, '0');
  const id = randomUuid();
  const codeHash = await sha256(`${env.AUTH_PEPPER}:${id}:${code}`);
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS).toISOString();
  const account = await db.prepare('SELECT display_first_name FROM users WHERE id = ? AND status = \'active\' LIMIT 1').bind(session.user_id).first();
  await db.prepare(`INSERT INTO email_auth_challenges(id, email, first_name, last_name, policy_version, code_hash, attempts, expires_at, created_at, purpose, user_id)
    VALUES(?, ?, ?, '', ?, ?, 0, ?, ?, 'link', ?)`)
    .bind(id, email, account?.display_first_name || '', ACCOUNT_POLICY_VERSION, codeHash, expiresAt, now.toISOString(), session.user_id).run();
  const sent = await sendEmailCode(env, { email, firstName: account?.display_first_name || '', code });
  if (!sent) {
    await db.prepare('DELETE FROM email_auth_challenges WHERE id = ? AND user_id = ?').bind(id, session.user_id).run();
    throw new AuthError(503, 'email_delivery_unavailable', 'Email verification is temporarily unavailable.');
  }
  return json(200, { ok: true, challengeId: id, expiresInSeconds: OTP_TTL_MS / 1000, message: 'A verification code has been sent to this address.' });
}

async function emailLinkVerify(request, env, url, clock) {
  requireSameOrigin(request, url);
  const session = await authenticated(request, env, { csrf: true });
  const body = await readBody(request, 4096);
  const email = normalizeEmail(body.email);
  const challengeId = typeof body.challengeId === 'string' ? body.challengeId : '';
  const code = typeof body.code === 'string' ? body.code.replace(/\s/g, '') : '';
  if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !/^\d{6}$/.test(code)) throw new AuthError(400, 'invalid_code', 'Enter the six-digit code from your email.');
  if (!pepperReady(env)) throw new AuthError(503, 'auth_not_configured', 'Email verification is not configured yet.');
  const db = requireDb(env);
  const now = clock();
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  await rateLimit(db, `email-link-verify:${await sha256(`${env.AUTH_PEPPER}:${ip}`)}`, { limit: 15, nowMs: now.getTime() });
  const challenge = await db.prepare(`SELECT * FROM email_auth_challenges WHERE id = ? AND email = ? AND purpose = 'link' AND user_id = ? LIMIT 1`)
    .bind(challengeId, email, session.user_id).first();
  if (!challenge || challenge.consumed_at || Date.parse(challenge.expires_at) <= now.getTime() || Number(challenge.attempts) >= 5 || challenge.policy_version !== ACCOUNT_POLICY_VERSION) {
    throw new AuthError(400, 'challenge_expired', 'This verification code is no longer valid. Request a new one.');
  }
  const expected = await sha256(`${env.AUTH_PEPPER}:${challengeId}:${code}`);
  if (!safeEqual(expected, challenge.code_hash)) {
    await db.prepare(`UPDATE email_auth_challenges SET attempts = attempts + 1 WHERE id = ? AND purpose = 'link' AND user_id = ? AND consumed_at IS NULL AND attempts < 5`)
      .bind(challengeId, session.user_id).run();
    throw new AuthError(400, 'invalid_code', 'The code is incorrect. Check it and try again.');
  }
  const owner = await db.prepare(`SELECT id FROM users WHERE lower(email) = ? LIMIT 1`).bind(email).first();
  if (owner && owner.id !== session.user_id) throw new AuthError(409, 'email_owned_by_other_account', 'This email belongs to a different TAAMEN account.');
  const currentIdentity = await db.prepare(`SELECT user_id FROM account_identities WHERE provider = 'email' AND provider_subject = ? LIMIT 1`).bind(email).first();
  if (currentIdentity && currentIdentity.user_id !== session.user_id) throw new AuthError(409, 'email_identity_in_use', 'This email is already linked to a different account.');
  const provider = await db.prepare(`SELECT 1 AS present FROM account_identities WHERE user_id = ? AND provider = 'email' LIMIT 1`).bind(session.user_id).first();
  if (provider) throw new AuthError(409, 'provider_already_linked', 'An email identity is already linked to this account.');
  const consumed = await db.prepare(`UPDATE email_auth_challenges SET consumed_at = ? WHERE id = ? AND purpose = 'link' AND user_id = ? AND consumed_at IS NULL AND expires_at > ? AND attempts < 5`)
    .bind(now.toISOString(), challengeId, session.user_id, now.toISOString()).run();
  if (Number(consumed.meta?.changes ?? 0) !== 1) throw new AuthError(409, 'challenge_already_used', 'This verification code has already been used.');
  try {
    await db.prepare(`INSERT INTO account_identities(id, user_id, provider, provider_subject, email, email_verified_at, created_at, updated_at)
      VALUES(?, ?, 'email', ?, ?, ?, ?, ?)`)
      .bind(randomUuid(), session.user_id, email, email, now.toISOString(), now.toISOString(), now.toISOString()).run();
  } catch {
    throw new AuthError(409, 'email_identity_conflict', 'This email could not be linked to the current account.');
  }
  return json(200, { ok: true, user: await publicUser(db, session.user_id) });
}

async function googleStart(request, env, url, clock) {
  if (request.method !== 'POST') throw new AuthError(405, 'method_not_allowed', 'Method not allowed.');
  requireHttps(request, env, url);
  requireSameOrigin(request, url);
  const body = await readBody(request, 4096);
  const policyVersion = body.policyVersion || '';
  if (body.acceptPolicy !== true || policyVersion !== ACCOUNT_POLICY_VERSION) throw new AuthError(428, 'policy_acceptance_required', 'Review and explicitly accept the current account privacy terms before signing in.');
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI || !pepperReady(env)) {
    throw new AuthError(503, 'google_signin_unavailable', 'Google sign-in is not configured yet.');
  }
  const state = randomToken(32);
  const browserBinding = randomToken(32);
  const verifier = randomToken(48);
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const now = clock();
  const returnTo = '/#home';
  const db = requireDb(env);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  await rateLimit(db, `google:${await sha256(`${env.AUTH_PEPPER}:${ip}`)}`, { limit: 20, nowMs: now.getTime() });
  await db.prepare('DELETE FROM auth_rate_limits WHERE window_start < ?').bind(now.getTime() - 24 * 60 * 60 * 1000).run();
  await db.prepare('DELETE FROM google_oauth_states WHERE expires_at < ?').bind(now.toISOString()).run();
  await db.prepare(`INSERT INTO google_oauth_states(state_hash, code_verifier, browser_binding_hash, return_path, policy_version, expires_at, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?)`)
    .bind(await sha256(`${env.AUTH_PEPPER}:${state}`), verifier, await sha256(`${env.AUTH_PEPPER}:${browserBinding}`), returnTo,
      policyVersion, new Date(now.getTime() + 10 * 60 * 1000).toISOString(), now.toISOString()).run();
  const authUrl = new URL(GOOGLE_AUTH_ENDPOINT);
  authUrl.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return json(200, { ok: true, authorizationUrl: authUrl.toString() }, { 'Set-Cookie': [oauthBindingCookie(url, browserBinding)] });
}

async function googleLinkStart(request, env, url, clock) {
  if (request.method !== 'POST') throw new AuthError(405, 'method_not_allowed', 'Google linking must be started by a same-origin POST request.');
  requireHttps(request, env, url);
  requireSameOrigin(request, url);
  const session = await authenticated(request, env, { csrf: true });
  if (session.account_policy_version !== ACCOUNT_POLICY_VERSION || !session.account_policy_accepted_at) {
    throw new AuthError(428, 'policy_acceptance_required', 'Review the current account privacy terms before linking a provider.');
  }
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI || !pepperReady(env)) {
    throw new AuthError(503, 'google_link_unavailable', 'Google linking is not configured yet.');
  }
  const db = requireDb(env);
  const alreadyLinked = await db.prepare(`SELECT 1 AS present FROM account_identities WHERE user_id = ? AND provider = 'google' LIMIT 1`).bind(session.user_id).first();
  if (alreadyLinked) throw new AuthError(409, 'provider_already_linked', 'A Google identity is already linked to this account.');
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = clock();
  await rateLimit(db, `google-link:${await sha256(`${env.AUTH_PEPPER}:${ip}`)}`, { limit: 10, nowMs: now.getTime() });
  const state = randomToken(32);
  const browserBinding = randomToken(32);
  const verifier = randomToken(48);
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  await db.prepare(`INSERT INTO google_oauth_states(state_hash, code_verifier, browser_binding_hash, return_path, policy_version, expires_at, created_at, purpose, user_id)
    VALUES(?, ?, ?, '/#profile', ?, ?, ?, 'link', ?)`)
    .bind(await sha256(`${env.AUTH_PEPPER}:${state}`), verifier, await sha256(`${env.AUTH_PEPPER}:${browserBinding}`), ACCOUNT_POLICY_VERSION, expiresAt, now.toISOString(), session.user_id).run();
  const authUrl = new URL(GOOGLE_AUTH_ENDPOINT);
  authUrl.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: env.GOOGLE_REDIRECT_URI, response_type: 'code',
    scope: 'openid email profile', state, code_challenge: challenge, code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return json(200, { ok: true, authorizationUrl: authUrl.toString() }, { 'Set-Cookie': [oauthBindingCookie(url, browserBinding)] });
}

async function googleCallback(request, env, url, clock) {
  if (request.method !== 'GET') throw new AuthError(405, 'method_not_allowed', 'Method not allowed.');
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const providerError = url.searchParams.get('error') || '';
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(state) || (code && code.length > 2048) || (!code && !providerError) || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI || !pepperReady(env)) {
    throw new AuthError(400, 'google_callback_invalid', 'Google sign-in could not be completed.');
  }
  const db = requireDb(env);
  const stateHash = await sha256(`${env.AUTH_PEPPER}:${state}`);
  const stored = await db.prepare('SELECT code_verifier, browser_binding_hash, return_path, policy_version, expires_at, purpose, user_id FROM google_oauth_states WHERE state_hash = ? LIMIT 1').bind(stateHash).first();
  await db.prepare('DELETE FROM google_oauth_states WHERE state_hash = ?').bind(stateHash).run();
  const browserBinding = oauthBindingValue(request, url);
  const bindingHash = browserBinding ? await sha256(`${env.AUTH_PEPPER}:${browserBinding}`) : '';
  if (!stored || stored.policy_version !== ACCOUNT_POLICY_VERSION || Date.parse(stored.expires_at) <= clock().getTime() || !safeEqual(bindingHash, stored.browser_binding_hash)) {
    throw new AuthError(400, 'google_state_expired', 'Google sign-in expired. Start again.');
  }
  if (providerError) {
    const target = new URL(stored.return_path || (stored.purpose === 'link' ? '/#profile' : '/#home'), url.origin);
    if (stored.purpose === 'link') target.searchParams.set('auth_link_error', providerError === 'access_denied' ? 'google_access_denied' : 'google_authorization_failed');
    else target.searchParams.set('auth_error', providerError === 'access_denied' ? 'google_access_denied' : 'google_authorization_failed');
    return redirect(target.toString(), [oauthBindingCookie(url, '', 0)]);
  }

  let tokenResponse;
  try {
    tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
        code_verifier: stored.code_verifier,
      }),
    });
  } catch {
    if (stored.purpose === 'link') {
      const target = new URL('/', url.origin); target.searchParams.set('auth_link_error', 'google_provider_unavailable'); target.hash = 'profile';
      return redirect(target.toString(), [oauthBindingCookie(url, '', 0)]);
    }
    throw new AuthError(503, 'google_provider_unavailable', 'Google could not be reached. Try again.');
  }
  const tokenPayload = await tokenResponse.json().catch(() => null);
  if (!tokenResponse.ok || !tokenPayload?.access_token) {
    if (stored.purpose === 'link') {
      const target = new URL('/', url.origin); target.searchParams.set('auth_link_error', 'google_token_exchange_failed'); target.hash = 'profile';
      return redirect(target.toString(), [oauthBindingCookie(url, '', 0)]);
    }
    throw new AuthError(401, 'google_token_exchange_failed', 'Google could not verify this sign-in.');
  }
  let profileResponse;
  let profile;
  try {
    profileResponse = await fetch(GOOGLE_USERINFO_ENDPOINT, { headers: { Authorization: `Bearer ${tokenPayload.access_token}` } });
    profile = await profileResponse.json().catch(() => null);
  } catch {
    if (stored.purpose === 'link') {
      const target = new URL('/', url.origin); target.searchParams.set('auth_link_error', 'google_link_failed'); target.hash = 'profile';
      return redirect(target.toString(), [oauthBindingCookie(url, '', 0)]);
    }
    throw new AuthError(503, 'google_provider_unavailable', 'Google identity could not be reached. Try again.');
  }
  if (!profileResponse.ok || typeof profile?.sub !== 'string' || typeof profile?.email !== 'string' || profile.email_verified !== true) {
    if (stored.purpose === 'link') {
      const target = new URL('/', url.origin); target.searchParams.set('auth_link_error', 'google_identity_unverified'); target.hash = 'profile';
      return redirect(target.toString(), [oauthBindingCookie(url, '', 0)]);
    }
    throw new AuthError(401, 'google_identity_unverified', 'Google did not provide a verified email address.');
  }
  const email = normalizeEmail(profile.email);
  const acceptedAt = clock().toISOString();
  if (stored.purpose === 'link') {
    try {
      const currentSession = await getSession(request, env);
      if (!currentSession || currentSession.user_id !== stored.user_id) {
        throw new AuthError(401, 'google_link_session_mismatch', 'Your account session changed. Sign in to the intended account and try linking again.');
      }
      const existingGoogleIdentity = await db.prepare(`SELECT user_id FROM account_identities WHERE provider = 'google' AND provider_subject = ? LIMIT 1`).bind(profile.sub).first();
      if (existingGoogleIdentity && existingGoogleIdentity.user_id !== currentSession.user_id) {
        throw new AuthError(409, 'google_identity_in_use', 'This Google identity is already linked to a different TAAMEN account.');
      }
      const accountProvider = await db.prepare(`SELECT provider_subject FROM account_identities WHERE user_id = ? AND provider = 'google' LIMIT 1`).bind(currentSession.user_id).first();
      if (accountProvider && accountProvider.provider_subject !== profile.sub) {
        throw new AuthError(409, 'provider_already_linked', 'A different Google identity is already linked to this account.');
      }
      if (!existingGoogleIdentity) {
        try {
          await db.prepare(`INSERT INTO account_identities(id, user_id, provider, provider_subject, email, email_verified_at, created_at, updated_at)
            VALUES(?, ?, 'google', ?, ?, ?, ?, ?)`)
            .bind(randomUuid(), currentSession.user_id, profile.sub, email, acceptedAt, acceptedAt, acceptedAt).run();
        } catch {
          const raced = await db.prepare(`SELECT user_id FROM account_identities WHERE provider = 'google' AND provider_subject = ? LIMIT 1`).bind(profile.sub).first();
          if (!raced || raced.user_id !== currentSession.user_id) throw new AuthError(409, 'google_identity_in_use', 'This Google identity is already linked to a different TAAMEN account.');
        }
      }
      const target = new URL(stored.return_path || '/#profile', url.origin);
      target.searchParams.set('auth_link', 'google_success');
      return redirect(target.toString(), [oauthBindingCookie(url, '', 0)]);
    } catch (error) {
      if (!(error instanceof AuthError) || error.status >= 500) throw error;
      const target = new URL('/', url.origin);
      target.searchParams.set('auth_link_error', error.code || 'google_link_failed');
      target.hash = 'profile';
      return redirect(target.toString(), [oauthBindingCookie(url, '', 0)]);
    }
  }
  const userId = await createOrLinkGoogleUser(db, { ...profile, email }, acceptedAt);
  await recordAccountPolicyAcceptance(db, userId, stored.policy_version, acceptedAt);
  const session = await issueSession(db, request, env, url, userId, clock);
  const target = new URL(stored.return_path || '/#home', url.origin);
  return redirect(target.toString(), [...session.cookies, oauthBindingCookie(url, '', 0)]);
}

async function authenticated(request, env, { csrf = false } = {}) {
  const session = await getSession(request, env, { requireCsrf: csrf });
  if (!session) throw new AuthError(401, csrf ? 'session_or_csrf_invalid' : 'not_authenticated', 'A verified cloud account is required.');
  return session;
}

async function updateProfile(request, env, url, clock) {
  requireSameOrigin(request, url);
  const session = await authenticated(request, env, { csrf: true });
  const body = await readBody(request);
  const firstName = cleanName(body.firstName, true);
  const lastName = cleanName(body.lastName || '');
  const now = nowIso(clock);
  const db = requireDb(env);
  await db.prepare('UPDATE users SET display_first_name = ?, display_last_name = ?, updated_at = ? WHERE id = ? AND status = \'active\'')
    .bind(firstName, lastName, now, session.user_id).run();
  return json(200, { ok: true, user: await publicUser(db, session.user_id) });
}


async function refreshCsrf(request, env, url) {
  requireSameOrigin(request, url);
  const session = await authenticated(request, env);
  const csrfToken = randomToken(32);
  await requireDb(env).prepare('UPDATE cloud_sessions SET csrf_hash = ? WHERE id = ? AND revoked_at IS NULL')
    .bind(await sha256(`${env.AUTH_PEPPER}:${csrfToken}`), session.session_id).run();
  return json(200, { ok: true }, { 'Set-Cookie': [serializeCookie(cookieNames(url).csrf, csrfToken, {
    secure: cookieNames(url).secure, sameSite: 'Strict', maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })] });
}

async function syncConsent(request, env, url, clock) {
  requireSameOrigin(request, url);
  const session = await authenticated(request, env, { csrf: true });
  const body = await readBody(request);
  if (body.accepted !== true && body.accepted !== false) throw new AuthError(400, 'invalid_consent', 'Choose whether to accept the cloud synchronization policy.');
  const version = 'cloud-sync-1';
  const now = nowIso(clock);
  await requireDb(env).prepare(`UPDATE users SET cloud_sync_consent_at = ?, cloud_sync_consent_version = ?, cloud_sync_enabled = 0, updated_at = ? WHERE id = ?`)
    .bind(body.accepted ? now : null, body.accepted ? version : null, now, session.user_id).run();
  return json(200, { ok: true, consented: body.accepted, syncEnabled: false, activation: 'v20' });
}

async function listSessions(request, env) {
  const session = await authenticated(request, env);
  const rows = await requireDb(env).prepare(`SELECT id, created_at, expires_at, last_seen_at, user_agent FROM cloud_sessions
    WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 20`)
    .bind(session.user_id, new Date().toISOString()).all();
  return json(200, { sessions: (rows.results || []).map((row) => ({
    id: row.id, createdAt: row.created_at, expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at, device: row.user_agent,
    current: row.id === session.session_id,
  })) });
}

async function logout(request, env, url, { all = false } = {}) {
  requireSameOrigin(request, url);
  const session = await authenticated(request, env, { csrf: true });
  const db = requireDb(env);
  const now = new Date().toISOString();
  if (all) {
    await db.prepare('UPDATE cloud_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(now, session.user_id).run();
  } else {
    await db.prepare('UPDATE cloud_sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL')
      .bind(now, session.session_id, session.user_id).run();
  }
  return json(200, { ok: true, signedOutAll: all }, { 'Set-Cookie': clearCookies(url) });
}

async function unlinkProvider(request, env, url) {
  requireSameOrigin(request, url);
  const session = await authenticated(request, env, { csrf: true });
  const body = await readBody(request, 4096);
  const provider = body.provider;
  if (provider !== 'email' && provider !== 'google') throw new AuthError(400, 'invalid_provider', 'Choose a supported account provider.');
  const db = requireDb(env);
  const identity = await db.prepare(`SELECT email FROM account_identities WHERE user_id = ? AND provider = ? LIMIT 1`).bind(session.user_id, provider).first();
  if (!identity) throw new AuthError(404, 'provider_not_linked', 'This provider is not linked to your account.');
  if (provider === 'email') {
    const account = await db.prepare('SELECT email FROM users WHERE id = ? LIMIT 1').bind(session.user_id).first();
    if (String(account?.email || '').toLowerCase() === String(identity.email || '').toLowerCase()) {
      throw new AuthError(409, 'primary_email_identity_required', 'The primary account email identity cannot be unlinked here.');
    }
  }
  // Keep the last identity using one atomic conditional DELETE. Separate
  // count-then-delete checks would allow two concurrent unlink requests to
  // remove the final two methods at the same time.
  const result = await db.prepare(`DELETE FROM account_identities
    WHERE user_id = ? AND provider = ?
      AND (SELECT COUNT(*) FROM account_identities WHERE user_id = ?) > 1`)
    .bind(session.user_id, provider, session.user_id).run();
  if (Number(result.meta?.changes ?? 0) !== 1) {
    const remaining = await db.prepare('SELECT COUNT(*) AS count FROM account_identities WHERE user_id = ?').bind(session.user_id).first();
    if (Number(remaining?.count || 0) <= 1) throw new AuthError(409, 'last_auth_provider_required', 'Keep at least one verified sign-in method linked to this account.');
    throw new AuthError(409, 'provider_unlink_conflict', 'The provider link changed. Refresh the account and try again.');
  }
  return json(200, { ok: true, provider, user: await publicUser(db, session.user_id) });
}

async function revokeSession(request, env, url) {
  requireSameOrigin(request, url);
  const session = await authenticated(request, env, { csrf: true });
  const body = await readBody(request);
  if (typeof body.sessionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.sessionId)) throw new AuthError(400, 'invalid_session_id', 'Choose a valid session.');
  const result = await requireDb(env).prepare('UPDATE cloud_sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL')
    .bind(new Date().toISOString(), body.sessionId, session.user_id).run();
  if (Number(result.meta?.changes ?? 0) !== 1) throw new AuthError(404, 'session_not_found', 'The session was not found.');
  return json(200, { ok: true });
}

export function createCloudAuthHandler({ clock = () => new Date() } = {}) {
  return async function handleCloudAuth(request, env) {
    const url = new URL(request.url);
    try {
      requireHttps(request, env, url);
      if (!url.pathname.startsWith('/api/auth/')) return json(404, { error: 'Not found.', code: 'not_found' });
      const path = url.pathname.slice('/api/auth'.length);
      const method = request.method.toUpperCase();
      if (path === '/config' && method === 'GET') {
        return json(200, {
          email: Boolean(pepperReady(env) && env.EMAILJS_SERVICE_ID && env.EMAILJS_AUTH_TEMPLATE_ID && env.EMAILJS_PUBLIC_KEY),
          google: Boolean(pepperReady(env) && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI),
          cloudSync: false,
        });
      }
      if (path === '/session' && method === 'GET') {
        const session = await getSession(request, env);
        if (!session) return json(200, { authenticated: false });
        const csrfToken = cookieValue(request, url, 'csrf');
        const csrfHash = csrfToken ? await sha256(`${env.AUTH_PEPPER || ''}:${csrfToken}`) : '';
        const validCsrf = safeEqual(csrfHash, session.csrf_hash);
        return json(200, { authenticated: true, user: await publicUser(requireDb(env), session.user_id), csrfReady: validCsrf });
      }
      if (path === '/email/request' && method === 'POST') return await emailRequest(request, env, url, clock);
      if (path === '/email/verify' && method === 'POST') return await emailVerify(request, env, url, clock);
      if (path === '/email/link/request' && method === 'POST') return await emailLinkRequest(request, env, url, clock);
      if (path === '/email/link/verify' && method === 'POST') return await emailLinkVerify(request, env, url, clock);
      if (path === '/google/start') {
        if (method !== 'POST') throw new AuthError(405, 'method_not_allowed', 'Google sign-in must be started by a same-origin POST request.');
        return await googleStart(request, env, url, clock);
      }
      if (path === '/google/link/start') return await googleLinkStart(request, env, url, clock);
      if (path === '/google/callback' && method === 'GET') return await googleCallback(request, env, url, clock);
      if (path === '/csrf' && method === 'POST') return await refreshCsrf(request, env, url);
      if (path === '/profile' && method === 'PATCH') return await updateProfile(request, env, url, clock);
      if (path === '/sync-consent' && method === 'POST') return await syncConsent(request, env, url, clock);
      if (path === '/sessions' && method === 'GET') return await listSessions(request, env);
      if (path === '/sessions/revoke' && method === 'POST') return await revokeSession(request, env, url);
      if (path === '/provider/unlink' && method === 'POST') return await unlinkProvider(request, env, url);
      if (path === '/logout' && method === 'POST') return await logout(request, env, url);
      if (path === '/logout-all' && method === 'POST') return await logout(request, env, url, { all: true });
      if (method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
      return json(404, { error: 'Not found.', code: 'not_found' });
    } catch (error) {
      if (error instanceof AuthError) return json(error.status, { error: error.message, code: error.code });
      console.error('[taamen] cloud auth request failed:', error?.message || 'unknown error');
      return json(500, { error: 'The account request could not be completed.', code: 'auth_internal_error' });
    }
  };
}

export const handleCloudAuth = createCloudAuthHandler();
