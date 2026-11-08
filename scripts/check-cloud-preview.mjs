const baseUrl = (process.env.TAAMEN_PREVIEW_URL || 'http://localhost:4173').replace(/\/+$/, '');
const target = new URL(baseUrl);
const productionHost = target.hostname === 'taamenn.com' || target.hostname.endsWith('.taamenn.com');
const localHost = ['localhost', '127.0.0.1', '::1'].includes(target.hostname);
const previewConfirmed = process.env.TAAMEN_PREVIEW_CONFIRMED === 'ISOLATED_PREVIEW_ONLY';

if (productionHost || (!localHost && !previewConfirmed)) {
  console.error('Refusing cloud diagnostics: taamenn.com is Production, and any remote Preview hostname requires TAAMEN_PREVIEW_CONFIRMED=ISOLATED_PREVIEW_ONLY after you verify its separate Worker, D1 and KV bindings.');
  process.exit(1);
}

async function getJson(path, extraHeaders = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json', ...extraHeaders },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(12_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error(`${path} did not return a JSON object`);
  }
  return body;
}

async function postJson(path, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Origin: baseUrl,
      'X-TAAMEN-Requested': '1',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body.error === 'string' ? body.error : `HTTP ${response.status}`;
    throw new Error(`${path} failed: ${message}`);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error(`${path} did not return a JSON object`);
  }
  return body;
}

try {
  const health = await getJson('/api/health');
  if (health.ok !== true) throw new Error('/api/health did not report ok=true');

  // A successful health route reaches Worker bootstrap and validates the KV
  // adapter shape (get/put functions). It does not read or write KV data.
  const [config, session] = await Promise.all([
    getJson('/api/auth/config'),
    getJson('/api/auth/session'),
  ]);

  for (const key of ['email', 'google', 'cloudSync']) {
    if (typeof config[key] !== 'boolean') throw new Error(`/api/auth/config is missing a boolean ${key} field`);
  }
  if (typeof session.authenticated !== 'boolean') throw new Error('/api/auth/session is missing its authenticated state');

  console.log(`Preview API health: PASS (${String(health.service || 'unknown service')})`);
  console.log('Worker boot / KV binding shape: PASS (binding adapter initialized; no KV data operation performed)');
  console.log('KV read/write operation: NOT TESTED — current Wrangler config shares the existing KV namespace with Production; do not write a test key until an isolated Preview namespace is bound.');
  console.log(`Email verification provider: ${config.email ? 'ENABLED' : 'DISABLED'}`);
  console.log(`Google OAuth provider: ${config.google ? 'ENABLED' : 'DISABLED'}`);
  console.log(`Match/archive cloud sync: ${config.cloudSync ? 'ENABLED' : 'DISABLED (expected in V19; V20 activation)'}`);
  console.log(`Current browser session: ${session.authenticated ? 'AUTHENTICATED' : 'GUEST / SIGNED OUT'}`);
  console.log('Cloudflare AI model inference: NOT TESTED by the read-only checks below.');

  const installationId = process.env.TAAMEN_AI_INSTALLATION_ID || '';
  if (installationId) {
    if (!/^[0-9a-f-]{36}$/i.test(installationId)) throw new Error('TAAMEN_AI_INSTALLATION_ID must be the existing browser installation UUID.');
    const quota = await getJson(`/api/ai/quota?installationId=${encodeURIComponent(installationId)}`, { 'X-TAAMEN-Requested': '1', Origin: baseUrl });
    if (quota.ok !== true || !quota.quota || typeof quota.quota.remaining !== 'number') {
      throw new Error('/api/ai/quota returned an invalid quota payload');
    }
    console.log(`AI quota Durable Object: PASS (${quota.quota.remaining} of ${quota.quota.limit} requests remain). The status action refreshes the current-day counter record but does not reserve an inference request.`);
  } else {
    console.log('AI quota Durable Object: NOT TESTED — set TAAMEN_AI_INSTALLATION_ID to the existing UUID from this browser to inspect and refresh the current-day counter status (no inference request is reserved).');
  }

  if (process.env.TAAMEN_AI_SMOKE_TEST === '1') {
    if (process.env.TAAMEN_AI_SMOKE_TEST_CONFIRM !== 'CONSUME_ONE_DAILY_REQUEST') {
      throw new Error('AI smoke test not run: set TAAMEN_AI_SMOKE_TEST_CONFIRM=CONSUME_ONE_DAILY_REQUEST to explicitly authorize one real model request and quota use.');
    }
    if (!installationId || !/^[0-9a-f-]{36}$/i.test(installationId)) {
      throw new Error('AI smoke test requires TAAMEN_AI_INSTALLATION_ID from the existing browser installation.');
    }
    const result = await postJson('/api/ai/chat', {
      installationId,
      profileName: 'TAAMEN Preview verification',
      language: 'en',
      messages: [{ role: 'user', content: 'Reply with exactly: TAAMEN PREVIEW OK.' }],
      context: { totals: { completedMatches: 0, matchesWithPersonalData: 0 }, recentMatches: [] },
    });
    if (result.ok !== true || typeof result.answer !== 'string' || !result.answer.trim()) {
      throw new Error('AI smoke test returned no model answer');
    }
    console.log('Cloudflare AI real model inference: PASS (one daily request consumed).');
    console.log(`Model response: ${result.answer.replace(/[\r\n]+/g, ' ').slice(0, 180)}`);
  }

  if (!config.email && !config.google) {
    console.error('\nCloud sign-in is not ready: configure the isolated Preview-only EmailJS auth template and/or Google OAuth credentials before testing OTP or OAuth.');
    process.exitCode = 2;
  }
} catch (error) {
  console.error(`TAAMEN Preview check failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error(`Target: ${baseUrl}`);
  console.error('Use a separately configured Preview Worker and set TAAMEN_PREVIEW_CONFIRMED=ISOLATED_PREVIEW_ONLY only after checking its Worker, D1 and KV bindings.');
  process.exitCode = 1;
}
