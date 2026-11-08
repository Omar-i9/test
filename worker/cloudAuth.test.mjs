import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import applicationWorker from './index.js';
import { createCloudAuthHandler } from './cloudAuth.js';
import { resolveAuthenticatedCloudUser } from './planIdentity.js';

const ORIGIN = 'https://taamen.test';
const PEPPER = 'v19-test-pepper-'.repeat(5);
const migrations = await Promise.all([
  readFile(new URL('../migrations/0001_create_tactical_plan_library.sql', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/0002_cloud_sync_engine.sql', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/0003_verified_cloud_accounts.sql', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/0004_account_provider_linking.sql', import.meta.url), 'utf8'),
]);

function createSqliteD1() {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON;');
  for (const migration of migrations) database.exec(migration);
  return {
    database,
    prepare(sql) {
      let values = [];
      return {
        sql,
        values,
        bind(...params) { values = params; this.values = params; return this; },
        async first() { return database.prepare(sql).get(...values) ?? null; },
        async all() { return { results: database.prepare(sql).all(...values), success: true }; },
        async run() {
          const result = database.prepare(sql).run(...values);
          return { ...result, meta: { changes: Number(result.changes || 0) } };
        },
      };
    },
    async batch(statements) {
      database.exec('BEGIN IMMEDIATE;');
      try {
        const results = statements.map((statement) => database.prepare(statement.sql).run(...statement.values));
        database.exec('COMMIT;');
        return results;
      } catch (error) {
        database.exec('ROLLBACK;');
        throw error;
      }
    },
  };
}

function envFor(db, extra = {}) {
  return {
    TAAMEN_DB: db,
    AUTH_PEPPER: PEPPER,
    REQUIRE_HTTPS: 'true',
    EMAILJS_SERVICE_ID: 'service_test',
    EMAILJS_AUTH_TEMPLATE_ID: 'template_auth_test',
    EMAILJS_PUBLIC_KEY: 'public_test_key',
    EMAILJS_ORIGIN: ORIGIN,
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    GOOGLE_REDIRECT_URI: `${ORIGIN}/api/auth/google/callback`,
    ...extra,
  };
}

function request(path, method = 'GET', body, headers = {}) {
  const values = new Headers(headers);
  if (method !== 'GET' && method !== 'HEAD') {
    values.set('Origin', ORIGIN);
    values.set('X-TAAMEN-Requested', '1');
    if (body !== undefined) values.set('Content-Type', 'application/json');
  }
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: values,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function payload(response) {
  return response.status === 204 ? null : response.json();
}

function cookiesFrom(response) {
  const cookies = response.headers.getSetCookie?.() || [];
  assert.equal(cookies.length >= 2, true, 'expected both session and CSRF cookies');
  return cookies;
}

function cookieHeader(cookies) {
  return cookies.map((value) => value.split(';', 1)[0]).join('; ');
}

function cookieValue(cookies, prefix) {
  const item = cookies.find((value) => value.startsWith(`${prefix}=`));
  assert.ok(item, `missing cookie ${prefix}`);
  return item.slice(prefix.length + 1).split(';', 1)[0];
}

function requestWithSession(path, method, body, cookies, csrf, extraHeaders = {}) {
  return request(path, method, body, {
    Cookie: cookieHeader(cookies),
    ...(csrf ? { 'X-TAAMEN-CSRF': csrf } : {}),
    ...extraHeaders,
  });
}

test('V19 migration is additive and creates verified identity, OTP, session and OAuth tables', () => {
  const db = createSqliteD1();
  const tables = db.database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
  for (const name of ['users', 'tactical_plans', 'sync_records', 'account_identities', 'email_auth_challenges', 'auth_rate_limits', 'cloud_sessions', 'google_oauth_states']) {
    assert.ok(tables.includes(name), `missing table ${name}`);
  }
  const columns = db.database.prepare('PRAGMA table_info(users)').all().map((row) => row.name);
  for (const name of ['email', 'email_verified_at', 'display_first_name', 'display_last_name', 'cloud_sync_consent_at', 'cloud_sync_consent_version', 'cloud_sync_enabled', 'account_policy_accepted_at', 'account_policy_version']) {
    assert.ok(columns.includes(name), `missing users column ${name}`);
  }
  const challengeColumns = db.database.prepare('PRAGMA table_info(email_auth_challenges)').all().map((row) => row.name);
  const googleStateColumns = db.database.prepare('PRAGMA table_info(google_oauth_states)').all().map((row) => row.name);
  assert.ok(challengeColumns.includes('policy_version'));
  assert.ok(challengeColumns.includes('purpose'));
  assert.ok(challengeColumns.includes('user_id'));
  assert.ok(googleStateColumns.includes('policy_version'));
  assert.ok(googleStateColumns.includes('purpose'));
  assert.ok(googleStateColumns.includes('user_id'));
  assert.equal(challengeColumns.find((name) => name === 'purpose') && db.database.prepare('PRAGMA table_info(email_auth_challenges)').all().find((row) => row.name === 'purpose').dflt_value, '\'signin\'');
  assert.equal(db.database.prepare('PRAGMA table_info(google_oauth_states)').all().find((row) => row.name === 'purpose').dflt_value, '\'signin\'');
  assert.doesNotMatch(migrations[2], /DROP\s+TABLE|DELETE\s+FROM\s+(?:users|tactical_plans|sync_records)/i);
  db.database.close();
});

test('V19 migration preserves existing V17 tactical plans and V18 sync rows', () => {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec(migrations[0]);
  database.exec(migrations[1]);
  database.prepare('INSERT INTO users(id,status,created_at,updated_at) VALUES(?,?,?,?)')
    .run('existing-account', 'active', '2026-11-05T10:00:00.000Z', '2026-11-05T10:00:00.000Z');
  const plan = {
    schemaVersion: 1,
    id: 'existing-plan',
    metadata: { gameFormat: '5v5', title: 'Existing plan' },
  };
  database.prepare(`INSERT INTO tactical_plans(
    id,user_id,format,slot_number,title,schema_version,payload_json,revision,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
    'existing-plan', 'existing-account', '5v5', 1, 'Existing plan', 1,
    JSON.stringify(plan), 1, '2026-11-05T10:00:00.000Z', '2026-11-05T10:00:00.000Z',
  );
  database.prepare(`INSERT INTO sync_records(
    user_id,entity_type,entity_id,payload_json,revision,last_operation_id,last_operation_hash,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?)`).run(
    'existing-account', 'profile', 'current', JSON.stringify({ id: 'current', firstName: 'Existing', lastName: 'User' }),
    1, 'existing-operation-01', 'a'.repeat(64), '2026-11-05T10:00:00.000Z', '2026-11-05T10:00:00.000Z',
  );

  database.exec(migrations[2]);
  database.exec(migrations[3]);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM tactical_plans WHERE id = ?').get('existing-plan').n, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM sync_records WHERE user_id = ?').get('existing-account').n, 1);
  const migrated = database.prepare('SELECT cloud_sync_enabled,email,display_first_name FROM users WHERE id = ?').get('existing-account');
  assert.equal(migrated.cloud_sync_enabled, 0);
  assert.equal(migrated.email, null);
  assert.equal(migrated.display_first_name, '');
  const linkPurpose = database.prepare('PRAGMA table_info(email_auth_challenges)').all().find((row) => row.name === 'purpose');
  assert.equal(linkPurpose.dflt_value, '\'signin\'');
  assert.equal(database.prepare('PRAGMA foreign_key_check').all().length, 0);
  database.close();
});

test('auth routes are dispatched before legacy KV initialization', async () => {
  const response = await applicationWorker.fetch(new Request(`${ORIGIN}/api/auth/config`), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await payload(response), { email: false, google: false, cloudSync: false });
});

test('unverified browser/local profile data cannot become an authenticated cloud identity', async () => {
  const db = createSqliteD1();
  const user = await resolveAuthenticatedCloudUser(request('/api/plans', 'GET'), envFor(db));
  assert.equal(user, null);
  db.database.close();
});

test('email OTP creates a verified cloud account, issues hashed HttpOnly session, and enforces CSRF', async () => {
  const db = createSqliteD1();
  const env = envFor(db);
  const handler = createCloudAuthHandler();
  const originalFetch = globalThis.fetch;
  let sentCode = '';
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    sentCode = body.template_params.otp_code;
    return new Response('OK', { status: 200 });
  };
  try {
    const config = await payload(await handler(request('/api/auth/config'), env));
    assert.deepEqual(config, { email: true, google: true, cloudSync: false });

    const noPolicy = await handler(request('/api/auth/email/request', 'POST', { email: 'no-policy@example.com', firstName: 'NoPolicy' }), env);
    assert.equal(noPolicy.status, 428);
    assert.equal((await payload(noPolicy)).code, 'policy_acceptance_required');

    const requested = await handler(request('/api/auth/email/request', 'POST', {
      email: 'Omar.Test@example.com', firstName: 'Omar', lastName: 'AbuZeineh', acceptPolicy: true, policyVersion: '2.3',
    }, { 'CF-Connecting-IP': '192.0.2.10' }), env);
    assert.equal(requested.status, 200);
    const challenge = await payload(requested);
    assert.match(sentCode, /^\d{6}$/);
    const challengeRow = db.database.prepare('SELECT code_hash, consumed_at FROM email_auth_challenges WHERE id = ?').get(challenge.challengeId);
    assert.ok(challengeRow);
    assert.notEqual(challengeRow.code_hash, sentCode);

    const badCsrf = await handler(request('/api/auth/email/verify', 'POST', {
      email: 'omar.test@example.com', challengeId: challenge.challengeId, code: sentCode,
    }, { 'CF-Connecting-IP': '192.0.2.10' }), env);
    assert.equal(badCsrf.status, 200);
    const login = await payload(badCsrf);
    assert.equal(login.authenticated, true);
    assert.equal(Object.hasOwn(login, 'csrfToken'), false, 'CSRF material stays in its dedicated cookie, not the JSON payload');
    assert.equal(login.user.email, 'omar.test@example.com');
    assert.equal(login.user.emailVerified, true);
    assert.equal(login.user.firstName, 'Omar');
    assert.equal(login.user.lastName, 'AbuZeineh');
    assert.equal(login.user.cloudSync.available, false);
    assert.equal(login.user.accountPolicy.version, '2.3');
    assert.ok(login.user.accountPolicy.acceptedAt);
    const accountPolicy = db.database.prepare('SELECT account_policy_version, account_policy_accepted_at FROM users WHERE id = ?').get(login.user.id);
    assert.equal(accountPolicy.account_policy_version, '2.3');
    assert.ok(accountPolicy.account_policy_accepted_at);
    const cookies = cookiesFrom(badCsrf);
    const sessionCookie = cookies.find((value) => value.startsWith('__Host-taamen_session='));
    assert.match(sessionCookie, /HttpOnly/);
    assert.match(sessionCookie, /Secure/);
    assert.match(sessionCookie, /SameSite=Lax/);
    const csrf = cookieValue(cookies, '__Host-taamen_csrf');

    const sessionResult = await handler(requestWithSession('/api/auth/session', 'GET', undefined, cookies), env);
    const sessionPayload = await payload(sessionResult);
    assert.equal(sessionPayload.authenticated, true);
    assert.equal(sessionPayload.csrfReady, true);
    const sessionId = db.database.prepare('SELECT id FROM cloud_sessions WHERE user_id = ?').get(login.user.id).id;
    const lastSeenBefore = db.database.prepare('SELECT last_seen_at FROM cloud_sessions WHERE id = ?').get(sessionId).last_seen_at;
    await handler(requestWithSession('/api/auth/session', 'GET', undefined, cookies), env);
    const lastSeenAfter = db.database.prepare('SELECT last_seen_at FROM cloud_sessions WHERE id = ?').get(sessionId).last_seen_at;
    assert.equal(lastSeenAfter, lastSeenBefore, 'last_seen_at is throttled rather than rewritten on every request');

    const userId = login.user.id;
    const resolveRequest = requestWithSession('/api/plans', 'POST', {}, cookies, csrf);
    const resolvedIdentity = await resolveAuthenticatedCloudUser(resolveRequest, env);
    assert.equal(resolvedIdentity.id, userId);
    assert.equal(resolvedIdentity.status, 'active');
    assert.equal(resolvedIdentity.cloudSyncConsented, false);
    assert.equal(resolvedIdentity.cloudSyncEnabled, false);
    const noCsrfIdentity = await resolveAuthenticatedCloudUser(requestWithSession('/api/plans', 'POST', {}, cookies), env);
    assert.equal(noCsrfIdentity, null);

    const rejectedProfile = await handler(requestWithSession('/api/auth/profile', 'PATCH', {
      firstName: 'Changed', lastName: 'Name',
    }, cookies, 'wrong-token'), env);
    assert.equal(rejectedProfile.status, 401);

    const updatedProfile = await handler(requestWithSession('/api/auth/profile', 'PATCH', {
      firstName: 'Omar Updated', lastName: 'Family', email: 'attacker@example.com', avatarData: 'not-uploaded',
    }, cookies, csrf), env);
    assert.equal(updatedProfile.status, 200);
    const updated = await payload(updatedProfile);
    assert.equal(updated.user.firstName, 'Omar Updated');
    assert.equal(updated.user.email, 'omar.test@example.com');
    assert.equal(db.database.prepare('SELECT email FROM users WHERE id = ?').get(userId).email, 'omar.test@example.com');

    const consent = await handler(requestWithSession('/api/auth/sync-consent', 'POST', { accepted: true }, cookies, csrf), env);
    assert.equal(consent.status, 200);
    assert.deepEqual(await payload(consent), { ok: true, consented: true, syncEnabled: false, activation: 'v20' });
    const cloudFlags = db.database.prepare('SELECT cloud_sync_consent_at, cloud_sync_enabled FROM users WHERE id = ?').get(userId);
    assert.ok(cloudFlags.cloud_sync_consent_at);
    assert.equal(cloudFlags.cloud_sync_enabled, 0);

    const syncOperation = {
      operationId: 'v19-consent-gate-0001',
      entityType: 'profile', entityId: 'current', operation: 'upsert', expectedRevision: null,
      payload: { id: 'current', firstName: 'Omar Updated', lastName: 'Family' },
    };
    const syncBeforeV20 = await applicationWorker.fetch(requestWithSession('/api/sync/push', 'POST', { operations: [syncOperation] }, cookies, csrf), env);
    assert.equal(syncBeforeV20.status, 403);
    assert.equal((await payload(syncBeforeV20)).code, 'cloud_sync_not_enabled');

    // Only a future V20 activation may set this server-owned flag. The request body cannot set it.
    db.database.prepare('UPDATE users SET cloud_sync_enabled = 1 WHERE id = ?').run(userId);
    const syncAfterV20Activation = await applicationWorker.fetch(requestWithSession('/api/sync/push', 'POST', { operations: [syncOperation] }, cookies, csrf), env);
    assert.equal(syncAfterV20Activation.status, 200);
    assert.equal((await payload(syncAfterV20Activation)).results[0].status, 'applied');

    const sessions = await handler(requestWithSession('/api/auth/sessions', 'GET', undefined, cookies), env);
    assert.equal((await payload(sessions)).sessions.length, 1);

    const logout = await handler(requestWithSession('/api/auth/logout', 'POST', {}, cookies, csrf), env);
    assert.equal(logout.status, 200);
    const afterLogout = await handler(requestWithSession('/api/auth/session', 'GET', undefined, cookies), env);
    assert.equal((await payload(afterLogout)).authenticated, false);

    const consumedAgain = await handler(request('/api/auth/email/verify', 'POST', {
      email: 'omar.test@example.com', challengeId: challenge.challengeId, code: sentCode,
    }), env);
    assert.equal(consumedAgain.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
    db.database.close();
  }
});

test('CSRF cookie can be re-established from a same-origin active session without weakening CSRF checks', async () => {
  const db = createSqliteD1();
  const env = envFor(db);
  const handler = createCloudAuthHandler();
  const userId = 'session-user';
  db.database.prepare('INSERT INTO users(id,status,created_at,updated_at,email,email_verified_at,display_first_name) VALUES(?,?,?,?,?,?,?)')
    .run(userId, 'active', new Date().toISOString(), new Date().toISOString(), 'session@example.com', new Date().toISOString(), 'Session');
  const sessionCookies = await (async () => {
    const originalFetch = globalThis.fetch;
    let code = '';
    globalThis.fetch = async (_url, options) => { code = JSON.parse(options.body).template_params.otp_code; return new Response('ok'); };
    try {
      const requestCode = await handler(request('/api/auth/email/request', 'POST', { email: 'session@example.com', firstName: 'Session', acceptPolicy: true, policyVersion: '2.3' }), env);
      const challenge = await payload(requestCode);
      const login = await handler(request('/api/auth/email/verify', 'POST', { email: 'session@example.com', challengeId: challenge.challengeId, code }), env);
      return cookiesFrom(login);
    } finally { globalThis.fetch = originalFetch; }
  })();
  const staleCsrfRequest = request('/api/auth/session', 'GET', undefined, { Cookie: cookieHeader([sessionCookies[0]]) });
  const stale = await payload(await handler(staleCsrfRequest, env));
  assert.equal(stale.authenticated, true);
  assert.equal(stale.csrfReady, false);
  const refreshed = await handler(request('/api/auth/csrf', 'POST', {}, { Cookie: cookieHeader([sessionCookies[0]]) }), env);
  assert.equal(refreshed.status, 200);
  const newCookie = refreshed.headers.getSetCookie().find((value) => value.startsWith('__Host-taamen_csrf='));
  assert.ok(newCookie);
  const completeCookies = [sessionCookies[0], newCookie];
  const after = await payload(await handler(request('/api/auth/session', 'GET', undefined, { Cookie: cookieHeader(completeCookies) }), env));
  assert.equal(after.csrfReady, true);
  const crossOrigin = new Request(`${ORIGIN}/api/auth/csrf`, {
    method: 'POST', headers: { Origin: 'https://attacker.test', Cookie: cookieHeader(completeCookies), 'X-TAAMEN-Requested': '1' }, body: '{}',
  });
  assert.equal((await handler(crossOrigin, env)).status, 403);
  db.database.close();
});


test('requesting a replacement email code invalidates the previous live challenge', async () => {
  const db = createSqliteD1();
  const env = envFor(db);
  const handler = createCloudAuthHandler();
  const originalFetch = globalThis.fetch;
  let sentCodes = [];
  globalThis.fetch = async (_url, options) => {
    sentCodes.push(JSON.parse(options.body).template_params.otp_code);
    return new Response('OK', { status: 200 });
  };
  try {
    const input = { email: 'resend@example.com', firstName: 'Resend', acceptPolicy: true, policyVersion: '2.3' };
    const first = await payload(await handler(request('/api/auth/email/request', 'POST', input, { 'CF-Connecting-IP': '192.0.2.45' }), env));
    const firstRow = db.database.prepare('SELECT consumed_at FROM email_auth_challenges WHERE id = ?').get(first.challengeId);
    assert.equal(firstRow.consumed_at, null);
    const second = await payload(await handler(request('/api/auth/email/request', 'POST', input, { 'CF-Connecting-IP': '192.0.2.45' }), env));
    assert.notEqual(first.challengeId, second.challengeId);
    const invalidated = db.database.prepare('SELECT consumed_at FROM email_auth_challenges WHERE id = ?').get(first.challengeId);
    assert.ok(invalidated.consumed_at, 'the first code must be marked consumed when a replacement is sent');
    const oldAttempt = await handler(request('/api/auth/email/verify', 'POST', {
      email: input.email, challengeId: first.challengeId, code: sentCodes[0],
    }), env);
    assert.equal(oldAttempt.status, 400);
    assert.equal((await payload(oldAttempt)).code, 'challenge_expired');
  } finally {
    globalThis.fetch = originalFetch;
    db.database.close();
  }
});

test('email verification rejects cross-origin requests and stops after five wrong codes', async () => {
  const db = createSqliteD1();
  const env = envFor(db);
  const handler = createCloudAuthHandler();
  const originalFetch = globalThis.fetch;
  let sentCode = '';
  globalThis.fetch = async (_url, options) => {
    sentCode = JSON.parse(options.body).template_params.otp_code;
    return new Response('OK', { status: 200 });
  };
  try {
    const crossOrigin = new Request(`${ORIGIN}/api/auth/email/request`, {
      method: 'POST',
      headers: { Origin: 'https://attacker.test', 'X-TAAMEN-Requested': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'abuse@example.com', firstName: 'Abuse' }),
    });
    assert.equal((await handler(crossOrigin, env)).status, 403);

    const requested = await handler(request('/api/auth/email/request', 'POST', {
      email: 'attempts@example.com', firstName: 'Attempts', acceptPolicy: true, policyVersion: '2.3',
    }, { 'CF-Connecting-IP': '192.0.2.44' }), env);
    const { challengeId } = await payload(requested);
    assert.match(sentCode, /^\d{6}$/);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const wrongCode = sentCode === '000000' ? '000001' : '000000';
      const response = await handler(request('/api/auth/email/verify', 'POST', {
        email: 'attempts@example.com', challengeId, code: wrongCode,
      }), env);
      assert.equal(response.status, 400);
      assert.equal((await payload(response)).code, 'invalid_code');
    }
    const locked = await handler(request('/api/auth/email/verify', 'POST', {
      email: 'attempts@example.com', challengeId, code: sentCode,
    }), env);
    assert.equal(locked.status, 400);
    assert.equal((await payload(locked)).code, 'challenge_expired');
    assert.equal(db.database.prepare('SELECT attempts FROM email_auth_challenges WHERE id = ?').get(challengeId).attempts, 5);
  } finally {
    globalThis.fetch = originalFetch;
    db.database.close();
  }
});

test('Google OAuth uses PKCE, one-time state and a browser-bound HttpOnly state cookie', async () => {
  const db = createSqliteD1();
  const env = envFor(db);
  const handler = createCloudAuthHandler();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls += 1;
    if (String(url).includes('oauth2.googleapis.com/token')) {
      const form = new URLSearchParams(options.body);
      assert.equal(form.get('client_id'), env.GOOGLE_CLIENT_ID);
      assert.ok(form.get('code_verifier'));
      return Response.json({ access_token: 'mock-access-token' });
    }
    assert.match(String(options.headers.Authorization), /^Bearer mock-access-token$/);
    return Response.json({
      sub: 'google-subject-123', email: 'google.user@example.com', email_verified: true,
      given_name: 'Google', family_name: 'User',
    });
  };
  try {
    const noPolicyStart = await handler(request('/api/auth/google/start', 'POST', { policyVersion: '2.3', acceptPolicy: false }), env);
    assert.equal(noPolicyStart.status, 428);
    assert.equal((await payload(noPolicyStart)).code, 'policy_acceptance_required');
    const wrongMethod = await handler(request('/api/auth/google/start?policyVersion=2.3'), env);
    assert.equal(wrongMethod.status, 405, 'OAuth initiation is not accepted through a navigational GET');
    const firstStart = await handler(request('/api/auth/google/start', 'POST', { policyVersion: '2.3', acceptPolicy: true }), env);
    assert.equal(firstStart.status, 200);
    const firstCookies = firstStart.headers.getSetCookie();
    const bindingCookie = firstCookies.find((value) => value.startsWith('__Host-taamen_oauth_bind='));
    assert.ok(bindingCookie);
    assert.match(bindingCookie, /HttpOnly/);
    const firstPayload = await payload(firstStart);
    const firstState = new URL(firstPayload.authorizationUrl).searchParams.get('state');
    const csrfAttack = await handler(request(`/api/auth/google/callback?code=mock-code&state=${firstState}`), env);
    assert.equal(csrfAttack.status, 400);

    const start = await handler(request('/api/auth/google/start', 'POST', { policyVersion: '2.3', acceptPolicy: true }), env);
    assert.equal(start.status, 200);
    const stateCookie = start.headers.getSetCookie().find((value) => value.startsWith('__Host-taamen_oauth_bind='));
    const stateCookieValue = cookieValue([stateCookie], '__Host-taamen_oauth_bind');
    const startPayload = await payload(start);
    const authorization = new URL(startPayload.authorizationUrl);
    const state = authorization.searchParams.get('state');
    const challenge = authorization.searchParams.get('code_challenge');
    const stored = db.database.prepare('SELECT code_verifier, browser_binding_hash, policy_version FROM google_oauth_states WHERE state_hash IS NOT NULL').get();
    assert.ok(stored);
    assert.equal(stored.policy_version, '2.3');
    const verifierHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stored.code_verifier));
    const challengeBytes = new Uint8Array(verifierHash);
    const base64 = btoa(String.fromCharCode(...challengeBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    assert.equal(base64, challenge);

    const callback = await handler(new Request(`${ORIGIN}/api/auth/google/callback?code=mock-code&state=${state}`, {
      headers: { Cookie: `${stateCookie.split(';', 1)[0]}` },
    }), env);
    assert.equal(callback.status, 302);
    assert.match(callback.headers.get('location'), /#home$/);
    const loginCookies = callback.headers.getSetCookie();
    assert.ok(loginCookies.some((value) => value.startsWith('__Host-taamen_session=')));
    assert.ok(loginCookies.some((value) => value.startsWith('__Host-taamen_csrf=')));
    assert.ok(loginCookies.some((value) => value.startsWith('__Host-taamen_oauth_bind=') && /Max-Age=0/.test(value)));
    const account = db.database.prepare('SELECT id,email,email_verified_at,display_first_name,display_last_name,account_policy_accepted_at,account_policy_version FROM users WHERE email = ?').get('google.user@example.com');
    assert.equal(account.display_first_name, 'Google');
    assert.equal(account.display_last_name, 'User');
    assert.equal(account.account_policy_version, '2.3');
    assert.ok(account.account_policy_accepted_at);
    assert.equal(calls, 2);

    const replay = await handler(new Request(`${ORIGIN}/api/auth/google/callback?code=mock-code&state=${state}`, {
      headers: { Cookie: stateCookie.split(';', 1)[0] },
    }), env);
    assert.equal(replay.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
    db.database.close();
  }
});

test('email identity linking is session-bound, CSRF protected, one-time, and never creates or switches accounts', async () => {
  const db = createSqliteD1();
  const env = envFor(db);
  const handler = createCloudAuthHandler();
  const originalFetch = globalThis.fetch;
  let googleProfile = { sub: 'google-account-owner', email: 'owner@gmail.com', email_verified: true, given_name: 'Owner', family_name: 'Account' };
  let sentCode = '';
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'google-link-test-token' });
    if (String(url).includes('openidconnect.googleapis.com')) return Response.json(googleProfile);
    if (String(url).includes('api.emailjs.com')) {
      sentCode = JSON.parse(options.body).template_params.otp_code;
      return new Response('OK', { status: 200 });
    }
    throw new Error(`Unexpected external request: ${url}`);
  };
  try {
    const signInStart = await handler(request('/api/auth/google/start', 'POST', { acceptPolicy: true, policyVersion: '2.3' }), env);
    const signInStateCookie = signInStart.headers.getSetCookie().find((value) => value.startsWith('__Host-taamen_oauth_bind='));
    const signInState = new URL((await payload(signInStart)).authorizationUrl).searchParams.get('state');
    const signInCallback = await handler(new Request(`${ORIGIN}/api/auth/google/callback?code=login-code&state=${signInState}`, {
      headers: { Cookie: signInStateCookie.split(';', 1)[0] },
    }), env);
    assert.equal(signInCallback.status, 302);
    const sessionCookies = signInCallback.headers.getSetCookie().filter((value) => value.startsWith('__Host-taamen_session=') || value.startsWith('__Host-taamen_csrf='));
    const csrf = cookieValue(sessionCookies, '__Host-taamen_csrf');
    const ownerId = db.database.prepare('SELECT id FROM users WHERE email = ?').get('owner@gmail.com').id;

    const unauthenticated = await handler(request('/api/auth/email/link/request', 'POST', { email: 'extra@example.com' }), env);
    assert.equal(unauthenticated.status, 401);
    const badCsrf = await handler(requestWithSession('/api/auth/email/link/request', 'POST', { email: 'extra@example.com' }, sessionCookies, 'wrong-token'), env);
    assert.equal(badCsrf.status, 401);

    db.database.prepare(`INSERT INTO users(id,status,created_at,updated_at,email,email_verified_at,display_first_name,display_last_name) VALUES(?,?,?,?,?,?,?,?)`)
      .run('other-account', 'active', '2026-11-06T10:00:00.000Z', '2026-11-06T10:00:00.000Z', 'taken@example.com', '2026-11-06T10:00:00.000Z', 'Other', 'Owner');
    const ownedByOther = await handler(requestWithSession('/api/auth/email/link/request', 'POST', { email: 'taken@example.com' }, sessionCookies, csrf), env);
    assert.equal(ownedByOther.status, 409);
    assert.equal((await payload(ownedByOther)).code, 'email_owned_by_other_account');

    const requestLink = await handler(requestWithSession('/api/auth/email/link/request', 'POST', { email: 'Extra@Example.com' }, sessionCookies, csrf), env);
    assert.equal(requestLink.status, 200);
    const challenge = await payload(requestLink);
    assert.match(sentCode, /^\d{6}$/);
    const challengeRow = db.database.prepare('SELECT purpose, user_id FROM email_auth_challenges WHERE id = ?').get(challenge.challengeId);
    assert.equal(challengeRow.purpose, 'link');
    assert.equal(challengeRow.user_id, ownerId);

    const wrongAccount = await handler(requestWithSession('/api/auth/email/link/verify', 'POST', {
      email: 'extra@example.com', challengeId: challenge.challengeId, code: sentCode,
    }, [], ''), env);
    assert.equal(wrongAccount.status, 401);

    const linked = await handler(requestWithSession('/api/auth/email/link/verify', 'POST', {
      email: 'extra@example.com', challengeId: challenge.challengeId, code: sentCode,
    }, sessionCookies, csrf), env);
    assert.equal(linked.status, 200);
    const linkedPayload = await payload(linked);
    assert.equal(linkedPayload.user.id, ownerId);
    assert.deepEqual(linkedPayload.user.providers, ['email', 'google']);
    assert.equal(db.database.prepare('SELECT COUNT(*) AS count FROM users').get().count, 2, 'the linked provider must not create a new account; the second row is the deliberately pre-existing owner-conflict fixture');
    assert.equal(db.database.prepare("SELECT user_id FROM account_identities WHERE provider='email' AND provider_subject='extra@example.com'").get().user_id, ownerId);

    const replay = await handler(requestWithSession('/api/auth/email/link/verify', 'POST', {
      email: 'extra@example.com', challengeId: challenge.challengeId, code: sentCode,
    }, sessionCookies, csrf), env);
    assert.equal(replay.status, 400);
    assert.equal((await payload(replay)).code, 'challenge_expired');
    const currentSession = await handler(requestWithSession('/api/auth/session', 'GET', undefined, sessionCookies), env);
    assert.equal((await payload(currentSession)).user.id, ownerId);
    const noCsrfUnlink = await handler(requestWithSession('/api/auth/provider/unlink', 'POST', { provider: 'email' }, sessionCookies, 'wrong-token'), env);
    assert.equal(noCsrfUnlink.status, 401);
    const unlinked = await handler(requestWithSession('/api/auth/provider/unlink', 'POST', { provider: 'email' }, sessionCookies, csrf), env);
    assert.equal(unlinked.status, 200);
    assert.deepEqual((await payload(unlinked)).user.providers, ['google']);
    assert.equal(db.database.prepare("SELECT COUNT(*) AS count FROM account_identities WHERE user_id = ?").get(ownerId).count, 1);
    const lastProviderUnlink = await handler(requestWithSession('/api/auth/provider/unlink', 'POST', { provider: 'google' }, sessionCookies, csrf), env);
    assert.equal(lastProviderUnlink.status, 409);
    assert.equal((await payload(lastProviderUnlink)).code, 'last_auth_provider_required');
    const preservedSession = await handler(requestWithSession('/api/auth/session', 'GET', undefined, sessionCookies), env);
    assert.equal((await payload(preservedSession)).user.id, ownerId);
  } finally {
    globalThis.fetch = originalFetch;
    db.database.close();
  }
});


test('Google OAuth cancellation returns to the account screen and leaves the current session intact', async () => {
  const db = createSqliteD1();
  const env = envFor(db);
  const handler = createCloudAuthHandler();
  const originalFetch = globalThis.fetch;
  let sentCode = '';
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('api.emailjs.com')) { sentCode = JSON.parse(options.body).template_params.otp_code; return new Response('OK'); }
    throw new Error(`Unexpected external request: ${url}`);
  };
  try {
    const emailStart = await handler(request('/api/auth/email/request', 'POST', {
      email: 'cancel.owner@example.com', firstName: 'Cancel', lastName: 'Owner', acceptPolicy: true, policyVersion: '2.3',
    }), env);
    const challenge = await payload(emailStart);
    const signedIn = await handler(request('/api/auth/email/verify', 'POST', { email: 'cancel.owner@example.com', challengeId: challenge.challengeId, code: sentCode }), env);
    const sessionCookies = cookiesFrom(signedIn);
    const csrf = cookieValue(sessionCookies, '__Host-taamen_csrf');
    const start = await handler(requestWithSession('/api/auth/google/link/start', 'POST', {}, sessionCookies, csrf), env);
    const authorization = new URL((await payload(start)).authorizationUrl);
    const binding = start.headers.getSetCookie().find((value) => value.startsWith('__Host-taamen_oauth_bind='));
    const callbackCookie = `${cookieHeader(sessionCookies)}; ${binding.split(';', 1)[0]}`;
    const denied = await handler(new Request(`${ORIGIN}/api/auth/google/callback?error=access_denied&state=${authorization.searchParams.get('state')}`, { headers: { Cookie: callbackCookie } }), env);
    assert.equal(denied.status, 302);
    assert.match(denied.headers.get('location'), /auth_link_error=google_access_denied/);
    assert.match(denied.headers.get('location'), /#profile$/);
    assert.equal(denied.headers.getSetCookie().some((value) => value.startsWith('__Host-taamen_session=')), false);
    const session = await handler(requestWithSession('/api/auth/session', 'GET', undefined, sessionCookies), env);
    assert.equal((await payload(session)).authenticated, true);
  } finally {
    globalThis.fetch = originalFetch;
    db.database.close();
  }
});

test('Google identity linking preserves the current cloud session and refuses provider ownership conflicts', async () => {
  const db = createSqliteD1();
  const env = envFor(db);
  const handler = createCloudAuthHandler();
  const originalFetch = globalThis.fetch;
  let profile = { sub: 'google-link-subject', email: 'linked.google@example.com', email_verified: true, given_name: 'Linked', family_name: 'Google' };
  let sentCode = '';
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'google-link-flow-token' });
    if (String(url).includes('openidconnect.googleapis.com')) return Response.json(profile);
    if (String(url).includes('api.emailjs.com')) {
      sentCode = JSON.parse(options.body).template_params.otp_code;
      return new Response('OK', { status: 200 });
    }
    throw new Error(`Unexpected external request: ${url}`);
  };
  try {
    const emailStart = await handler(request('/api/auth/email/request', 'POST', {
      email: 'current.user@example.com', firstName: 'Current', lastName: 'User', acceptPolicy: true, policyVersion: '2.3',
    }), env);
    const emailChallenge = await payload(emailStart);
    const sentInSignIn = sentCode;
    const signedIn = await handler(request('/api/auth/email/verify', 'POST', {
      email: 'current.user@example.com', challengeId: emailChallenge.challengeId, code: sentInSignIn,
    }), env);
    assert.equal(signedIn.status, 200);
    const sessionCookies = cookiesFrom(signedIn);
    const csrf = cookieValue(sessionCookies, '__Host-taamen_csrf');
    const userId = (await payload(signedIn)).user.id;

    const noCsrf = await handler(requestWithSession('/api/auth/google/link/start', 'POST', {}, sessionCookies, 'wrong-token'), env);
    assert.equal(noCsrf.status, 401);
    const start = await handler(requestWithSession('/api/auth/google/link/start', 'POST', {}, sessionCookies, csrf), env);
    assert.equal(start.status, 200);
    const startBody = await payload(start);
    const authorize = new URL(startBody.authorizationUrl);
    assert.equal(authorize.hostname, 'accounts.google.com');
    assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
    const oauthCookie = start.headers.getSetCookie().find((value) => value.startsWith('__Host-taamen_oauth_bind='));
    const state = authorize.searchParams.get('state');
    const callbackCookie = `${cookieHeader(sessionCookies)}; ${oauthCookie.split(';', 1)[0]}`;
    const callback = await handler(new Request(`${ORIGIN}/api/auth/google/callback?code=link-code&state=${state}`, { headers: { Cookie: callbackCookie } }), env);
    assert.equal(callback.status, 302);
    assert.match(callback.headers.get('location'), /#profile$/);
    assert.equal(callback.headers.getSetCookie().some((value) => value.startsWith('__Host-taamen_session=')), false, 'linking must not replace or issue a session');
    assert.equal(db.database.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1);
    assert.equal(db.database.prepare("SELECT user_id FROM account_identities WHERE provider='google' AND provider_subject='google-link-subject'").get().user_id, userId);
    const afterLink = await handler(requestWithSession('/api/auth/session', 'GET', undefined, sessionCookies), env);
    const afterLinkPayload = await payload(afterLink);
    assert.equal(afterLinkPayload.user.id, userId);
    assert.deepEqual(afterLinkPayload.user.providers, ['email', 'google']);

    // A different Google identity must not replace the provider already linked to this account.
    const secondStart = await handler(requestWithSession('/api/auth/google/link/start', 'POST', {}, sessionCookies, csrf), env);
    assert.equal(secondStart.status, 409);
    assert.equal((await payload(secondStart)).code, 'provider_already_linked');
    const primaryEmailUnlink = await handler(requestWithSession('/api/auth/provider/unlink', 'POST', { provider: 'email' }, sessionCookies, csrf), env);
    assert.equal(primaryEmailUnlink.status, 409);
    assert.equal((await payload(primaryEmailUnlink)).code, 'primary_email_identity_required');
    const unlinked = await handler(requestWithSession('/api/auth/provider/unlink', 'POST', { provider: 'google' }, sessionCookies, csrf), env);
    assert.equal(unlinked.status, 200);
    assert.deepEqual((await payload(unlinked)).user.providers, ['email']);
    const relinkStart = await handler(requestWithSession('/api/auth/google/link/start', 'POST', {}, sessionCookies, csrf), env);
    assert.equal(relinkStart.status, 200, 'the remaining verified email provider keeps the account usable and allows a later Google relink');
  } finally {
    globalThis.fetch = originalFetch;
    db.database.close();
  }
});
