/**
 * Static privacy invariants for the TAAMEN client.
 *
 * These are genuine "must not exist" checks on source and build output. Behavioural
 * guarantees (authentication, authorization, sessions, persistence) are covered by
 * the test suites, not by string matching.
 *
 * Exit code 1 means private material reached a place it must never reach.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

function walk(dir, filter) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, filter));
    else if (filter(full)) out.push(full);
  }
  return out;
}

const relative = file => path.relative(root, file).replaceAll('\\', '/');

const sourceFiles = walk(path.join(root, 'src'), file => /\.(ts|tsx|json)$/.test(file));
const publicFiles = walk(path.join(root, 'public'), () => true);
const distClient = path.join(root, 'dist/client');
const distRoot = fs.existsSync(distClient) ? distClient : path.join(root, 'dist');
const distFiles = walk(distRoot, file => /\.(js|css|html|json)$/.test(file));

// ---------------------------------------------------------------------------
// 1. Recognition codes must not exist in the client at all.
// ---------------------------------------------------------------------------
const CODE_PATTERN = /user#[A-Z0-9]{4,}/;
for (const file of [...sourceFiles, ...publicFiles, ...distFiles]) {
  const text = fs.readFileSync(file, 'utf8');
  const found = text.match(CODE_PATTERN);
  if (found) fail(`Recognition code ${found[0]} is present in ${relative(file)}`);
}

// ---------------------------------------------------------------------------
// 2. The historical archive must not be shipped to the browser.
// ---------------------------------------------------------------------------
if (fs.existsSync(path.join(root, 'src/data/historicalArchive.ts'))) {
  fail('src/data/historicalArchive.ts exists; historical records must not live in the client');
}
for (const retiredFile of [
  'src/config/featuredMembers.ts', 'src/components/FeaturedMember.tsx',
  'src/pages/HistoricalMatchCenter.tsx', 'backend/src/featuredMembers.mjs',
  'backend/src/sessions.mjs', 'backend/src/dto.mjs',
]) {
  if (fs.existsSync(path.join(root, retiredFile))) fail(`${retiredFile} is a retired V10 feature and must not ship.`);
}
for (const file of [...sourceFiles, ...publicFiles, ...distFiles]) {
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes('legacy-taamenn')) {
    fail(`Legacy historical marker "legacy-taamenn" is present in ${relative(file)}`);
  }
  if (text.includes('historicalArchive')) {
    fail(`Reference to the embedded historical archive is present in ${relative(file)}`);
  }
}

// ---------------------------------------------------------------------------
// 3. Cross-check against the real operator data when it is available locally.
//    Absent on a clean checkout, which is itself the desired state.
// ---------------------------------------------------------------------------
const legacyPath = path.join(root, 'backend/legacy-private-matches.json');
const externalLegacyPath = process.env.TAAMEN_PRIVATE_ARCHIVE_PATH || '';
const clientText = [...sourceFiles, ...publicFiles, ...distFiles]
  .map(file => fs.readFileSync(file, 'utf8'))
  .join('\n');

if (fs.existsSync(legacyPath)) {
  fail('Private historical data is inside the source tree. Move it outside the repository and set TAAMEN_LEGACY_FILE explicitly when needed.');
}
if (externalLegacyPath) {
  if (!fs.existsSync(externalLegacyPath)) {
    fail('TAAMEN_PRIVATE_ARCHIVE_PATH does not exist.');
  } else {
    const legacy = JSON.parse(fs.readFileSync(externalLegacyPath, 'utf8'));
    if (!Array.isArray(legacy)) {
      fail('TAAMEN_PRIVATE_ARCHIVE_PATH must point to a JSON array of historical matches.');
    } else {
      const leaked = new Set();
      for (const match of legacy) {
        if (match.story && clientText.includes(match.story)) leaked.add(`story of ${match.id}`);
        if (match.id && clientText.includes(JSON.stringify(match.id))) leaked.add(`id ${match.id}`);
      }
      if (leaked.size) fail(`Private historical content reached the client: ${[...leaked].join(', ')}`);
      else notes.push(`Cross-checked ${legacy.length} externally stored private records against the client: none present.`);
    }
  }
} else {
  notes.push('Private historical archive is outside the source tree (expected). Set TAAMEN_PRIVATE_ARCHIVE_PATH for a local comparison.');
}


const dataPath = path.join(root, 'backend/data.json');
if (fs.existsSync(dataPath)) {
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const leaked = new Set();
  for (const member of data.members || []) {
    if (member.memberCode && clientText.includes(member.memberCode)) leaked.add(member.memberCode);
    if (member.passwordHash?.digest && clientText.includes(member.passwordHash.digest)) leaked.add(`${member.username} hash`);
    if (member.arabicName && clientText.includes(member.arabicName)) leaked.add(member.arabicName);
  }
  if (leaked.size) fail(`Operator member data reached the client: ${[...leaked].join(', ')}`);
  else notes.push(`Cross-checked ${(data.members || []).length} operator member records against the client: none present.`);
} else {
  notes.push('backend/data.json is absent (expected on a clean checkout).');
}

// ---------------------------------------------------------------------------
// 4. Credential material must not appear in the client.
// ---------------------------------------------------------------------------
for (const file of [...sourceFiles, ...distFiles]) {
  const text = fs.readFileSync(file, 'utf8');
  if (/passwordHash|scryptSync/.test(text)) {
    fail(`Credential handling appears in client file ${relative(file)}`);
  }
  if (/\b[0-9a-f]{128}\b/.test(text)) {
    fail(`A 64-byte hex digest appears in client file ${relative(file)}`);
  }
}

// ---------------------------------------------------------------------------
// 5. The support recipient must be server-side only.
// ---------------------------------------------------------------------------
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/);
  if (email && !/name@example\.com|@[\w-]*example/.test(email[0])) {
    fail(`A real email address (${email[0]}) is hardcoded in ${relative(file)}`);
  }
  if (/to_email|supportRecipient/.test(text)) {
    fail(`${relative(file)} chooses an email recipient in the client; the server must own this`);
  }
}

const EMAILJS_CLIENT_LEAK = /7xyuge5ZLIgBevcbL|service_13mkb9h|api\.emailjs\.com|VITE_EMAILJS_/;
for (const file of [...sourceFiles, ...publicFiles, ...distFiles]) {
  const text = fs.readFileSync(file, 'utf8');
  if (EMAILJS_CLIENT_LEAK.test(text)) {
    fail(`Client EmailJS configuration reached ${relative(file)}; Support must use the backend contact route`);
  }
}

// ---------------------------------------------------------------------------
// 6. The service worker must never cache the API.
// ---------------------------------------------------------------------------
const swPath = path.join(root, 'public/sw.js');
if (!fs.existsSync(swPath)) {
  fail('public/sw.js is missing');
} else {
  const sw = fs.readFileSync(swPath, 'utf8');
  if (!/\/api\//.test(sw)) fail('public/sw.js does not mention /api/, so it cannot be bypassing it');
  if (!/url\.pathname\.startsWith\('\/api\/'\)/.test(sw)) {
    fail('public/sw.js must bypass requests whose path starts with /api/');
  }
  if (!/url\.pathname\.startsWith\('\/share\/'\)/.test(sw)) {
    fail('public/sw.js must not cache unique /share/ token URLs');
  }
  if (!/taamen-shell-v19/.test(sw) && !/VERSION='v19'/.test(sw)) {
    fail('public/sw.js cache version must be v19 after verified-account UI and auth changes');
  }
  const precache = sw.match(/const PRECACHE\s*=\s*\[(.*?)\]/s);
  if (precache && precache[1].includes('/api')) fail('public/sw.js precaches an /api path');
}

const spa404 = path.join(root, 'public/404.html');
if (!fs.existsSync(spa404)) {
  fail('public/404.html is missing');
} else {
  const html = fs.readFileSync(spa404, 'utf8');
  if (html.includes('/src/main.tsx')) {
    fail('public/404.html must not load Vite source /src/main.tsx in production');
  }
  if (!html.includes('taamen-spa-path')) {
    fail('public/404.html must preserve the original path for share routes');
  }
}

// ---------------------------------------------------------------------------
// 7. Operator data must be ignored by git.
// ---------------------------------------------------------------------------
const gitignore = fs.existsSync(path.join(root, '.gitignore'))
  ? fs.readFileSync(path.join(root, '.gitignore'), 'utf8')
  : '';
for (const entry of ['backend/data.json', 'backend/sessions.json']) {
  if (!gitignore.split(/\r?\n/).some(line => line.trim() === entry)) {
    fail(`${entry} is not listed in .gitignore`);
  }
}
if (!gitignore.split(/\r?\n/).some(line => line.trim() === 'backend/legacy-private-matches.json')) {
  fail('backend/legacy-private-matches.json must be gitignored because private match history must remain outside source control');
}

const wranglerPath = path.join(root, 'wrangler.jsonc');
if (!fs.existsSync(wranglerPath)) {
  fail('wrangler.jsonc is missing');
} else {
  const wrangler = fs.readFileSync(wranglerPath, 'utf8');
  if (!/"directory"\s*:\s*"dist\/client"/.test(wrangler)) {
    fail('wrangler.jsonc assets.directory must be dist/client (Vite client outDir)');
  }
  if (!/"not_found_handling"\s*:\s*"single-page-application"/.test(wrangler)) {
    fail('wrangler.jsonc must keep SPA not_found_handling');
  }
  if (!/"run_worker_first"\s*:\s*\[\s*"\/api\/\*"\s*\]/.test(wrangler)) {
    fail('wrangler.jsonc must keep run_worker_first ["/api/*"]');
  }
  if (!/"binding"\s*:\s*"TAAMEN_KV"/.test(wrangler)) {
    fail('wrangler.jsonc must bind TAAMEN_KV');
  }
  if (!/"ai"\s*:\s*\{\s*"binding"\s*:\s*"AI"(?:\s*,\s*"remote"\s*:\s*true)?\s*\}/.test(wrangler)) {
    fail('wrangler.jsonc must bind Workers AI as AI');
  }
  if (!/"ai"\s*:\s*\{\s*"binding"\s*:\s*"AI"\s*,\s*"remote"\s*:\s*true\s*\}/.test(wrangler)) {
    fail('wrangler.jsonc must use the remote Workers AI binding for Cloudflare Vite preview');
  }
  if (!/"name"\s*:\s*"AI_QUOTA"/.test(wrangler) || !/"class_name"\s*:\s*"AiDailyQuota"/.test(wrangler)) {
    fail('wrangler.jsonc must bind the AiDailyQuota Durable Object as AI_QUOTA');
  }
  if (!/"new_sqlite_classes"\s*:\s*\[\s*"AiDailyQuota"\s*\]/.test(wrangler) || !/v11-ai-quota-v1/.test(wrangler)) {
    fail('wrangler.jsonc must include the V11 SQLite Durable Object migration');
  }
  const planIdentityPath = path.join(root, 'worker/planIdentity.js');
  const planWorkerPath = path.join(root, 'worker/tacticalPlans.js');
  const planMigrationPath = path.join(root, 'migrations/0001_create_tactical_plan_library.sql');
  const cloudRepositoryPath = path.join(root, 'src/services/cloudTacticalPlanLibraryRepository.ts');
  for (const required of [planIdentityPath, planWorkerPath, planMigrationPath, cloudRepositoryPath]) {
    if (!fs.existsSync(required)) fail(`${relative(required)} is required for V17 Cloud Storage Foundation`);
  }
  if (fs.existsSync(planIdentityPath)) {
    const identity = fs.readFileSync(planIdentityPath, 'utf8');
    if (!identity.includes("from './cloudAuth.js'") || !identity.includes('resolveAuthenticatedCloudUser')) {
      fail('V19 tactical-plan identity must delegate to the verified D1 session resolver');
    }
  }
  if (fs.existsSync(planWorkerPath)) {
    const planWorker = fs.readFileSync(planWorkerPath, 'utf8');
    if (!planWorker.includes('expectedRevision') || !planWorker.includes('revision_conflict') || !planWorker.includes('user_id = ?')) {
      fail('V17 tactical plan Worker must enforce account ownership and optimistic revisions');
    }
    if (!planWorker.includes('MAX_PLAN_BYTES = 256 * 1024')) fail('V17 Worker must enforce the 256 KiB plan limit');
  }
  if (fs.existsSync(planMigrationPath)) {
    const migration = fs.readFileSync(planMigrationPath, 'utf8');
    for (const marker of ['FOREIGN KEY (user_id)', 'uq_tactical_plans_active_slot', 'deleted_at IS NULL', 'json_valid(payload_json)', 'revision INTEGER NOT NULL']) {
      if (!migration.includes(marker)) fail(`V17 D1 migration is missing required invariant: ${marker}`);
    }
  }
  if (fs.existsSync(cloudRepositoryPath)) {
    const cloudRepository = fs.readFileSync(cloudRepositoryPath, 'utf8');
    if (!cloudRepository.includes('assertCloudPlanSize') || !cloudRepository.includes('parseTacticalPlanLibraryEntry')) {
      fail('V17 client repository must validate cloud records and enforce the local plan-size boundary');
    }
  }
  const syncWorkerPath = path.join(root, 'worker/syncEngine.js');
  const syncMigrationPath = path.join(root, 'migrations/0002_cloud_sync_engine.sql');
  const syncIntegrationTestPath = path.join(root, 'worker/syncEngine.sqlite.integration.test.mjs');
  const syncClientPath = path.join(root, 'src/services/cloudSyncClient.ts');
  const syncProtocolPath = path.join(root, 'src/services/cloudSyncProtocol.ts');
  for (const required of [syncWorkerPath, syncMigrationPath, syncIntegrationTestPath, syncClientPath, syncProtocolPath]) {
    if (!fs.existsSync(required)) fail(`${relative(required)} is required for V18 Cloud Sync Engine`);
  }
  if (fs.existsSync(syncWorkerPath)) {
    const syncWorker = fs.readFileSync(syncWorkerPath, 'utf8');
    for (const marker of ['idempotency_key_reused', 'revision_conflict', 'MAX_OPERATIONS_PER_REQUEST = 25', 'MAX_RECORD_BYTES = 64 * 1024', 'not_authenticated']) {
      if (!syncWorker.includes(marker)) fail(`V18 sync Worker is missing required safety invariant: ${marker}`);
    }
    if (!syncWorker.includes('resolveAuthenticatedCloudUser')) fail('V18 sync Worker must use the verified session identity seam');
    if (!syncWorker.includes('requireCloudSyncEnabled: true')) fail('V19 must keep general match sync disabled until the V20 migration and review UX are ready');
  }
  const authMigrationPath = path.join(root, 'migrations/0003_verified_cloud_accounts.sql');
  const authWorkerPath = path.join(root, 'worker/cloudAuth.js');
  const authTestPath = path.join(root, 'worker/cloudAuth.test.mjs');
  const authClientPath = path.join(root, 'src/services/cloudAuthClient.ts');
  const authEntryPath = path.join(root, 'src/components/AuthEntry.tsx');
  const profilePath = path.join(root, 'src/components/Profile.tsx');
  for (const required of [authMigrationPath, authWorkerPath, authTestPath, authClientPath, authEntryPath, profilePath]) {
    if (!fs.existsSync(required)) fail(`${relative(required)} is required for V19 Verified Cloud Accounts`);
  }
  if (fs.existsSync(authWorkerPath)) {
    const auth = fs.readFileSync(authWorkerPath, 'utf8');
    for (const marker of ['HttpOnly', "sameSite: 'Lax'", "sameSite: 'Strict'", 'AUTH_PEPPER', 'email_auth_challenges', 'cloud_sessions', 'google_oauth_states', 'browser_binding_hash', 'X-TAAMEN-Requested']) {
      if (!auth.includes(marker)) fail(`V19 auth Worker is missing required security invariant: ${marker}`);
    }
    if (!/code_challenge_method:\s*'S256'/.test(auth)) fail('V19 Google OAuth must use PKCE S256');
    if (/localStorage|IndexedDB|LocalProfile/.test(auth)) fail('V19 auth Worker must never use browser-local profile data as identity');
  }
  if (fs.existsSync(authMigrationPath)) {
    const authMigration = fs.readFileSync(authMigrationPath, 'utf8');
    for (const marker of ['account_identities', 'email_auth_challenges', 'auth_rate_limits', 'cloud_sessions', 'google_oauth_states', 'cloud_sync_enabled', 'FOREIGN KEY (user_id)']) {
      if (!authMigration.includes(marker)) fail(`V19 migration is missing required account/session invariant: ${marker}`);
    }
  }
  if (fs.existsSync(authEntryPath)) {
    const authEntry = fs.readFileSync(authEntryPath, 'utf8');
    for (const marker of ['Local profile', 'Cloud account', 'HelpCircle', 'Continue with Google', 'Continue with email']) {
      if (!authEntry.includes(marker)) fail(`V19 access entry is missing required account option/help label: ${marker}`);
    }
    if (/Continue as guest|المتابعة كزائر/.test(authEntry)) {
      fail('Guest mode must stay in the independent first-visit welcome, not inside the authentication screen');
    }
    const welcomeEntry = fs.readFileSync(path.join(root, 'src/components/FirstVisitExperience.tsx'), 'utf8');
    if (!welcomeEntry.includes('copy.continueGuest')) fail('First-visit welcome must offer the independent guest entry action');
    const localProfileSetup = fs.readFileSync(path.join(root, 'src/components/ProfileSetup.tsx'), 'utf8');
    if (/Continue as guest|المتابعة كزائر/.test(localProfileSetup)) fail('Local profile registration must return to account options, not expose guest mode inside registration');
  }
  if (fs.existsSync(profilePath)) {
    const profile = fs.readFileSync(profilePath, 'utf8');
    for (const marker of ['cloudUser', 'cloudAuthClient.updateProfile', 'cloudAuthClient.saveSyncConsent', 'cloudAuthClient.listSessions', 'revokeSession', 'phone', 'avatarData']) {
      if (!profile.includes(marker)) fail(`V19 account/profile UX is missing required behavior: ${marker}`);
    }
  }
  if (fs.existsSync(syncMigrationPath)) {
    const syncMigration = fs.readFileSync(syncMigrationPath, 'utf8');
    for (const marker of ['sync_records', 'sync_cursor_state', 'sync_changes', 'sync_operations', 'sync_rate_limits', 'last_operation_id', 'last_operation_hash', 'FOREIGN KEY (user_id)', 'json_valid(payload_json)', 'PRIMARY KEY (user_id, cursor)', 'UNIQUE (user_id, entity_type, entity_id)']) {
      if (!syncMigration.includes(marker)) fail(`V18 sync migration is missing required invariant: ${marker}`);
    }
  }
  const productionBlock = wrangler.match(/"production"\s*:\s*\{([\s\S]*?)\n\s*\}\s*\n\s*\}\s*\n\s*\}/);
  if (!/"binding"\s*:\s*"TAAMEN_DB"/.test(wrangler) || !/"database_id"\s*:\s*"6ba51e17-9844-4161-acf2-faa8122bf7c5"/.test(wrangler)) {
    fail('V18 must retain the confirmed TAAMEN_DB Preview binding');
  }
  if (productionBlock && /"d1_databases"\s*:/.test(productionBlock[1])) {
    fail('Preview D1 must never be inherited or copied into the production environment');
  }
  if (/"r2_buckets"\s*:/.test(wrangler)) fail('V18 must not provision an R2 bucket; structured text records stay in D1');
  const workerEntry = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
  if (!workerEntry.includes("url.pathname === '/api/sync/push'") || !workerEntry.includes('handleSyncEngine')) {
    fail('Worker entry must dispatch sync API routes before the legacy KV bootstrap');
  }
  const aiWorkerPath = path.join(root, 'worker/ai.js');
  if (!fs.existsSync(aiWorkerPath)) {
    fail('worker/ai.js is missing');
  } else {
    const aiWorker = fs.readFileSync(aiWorkerPath, 'utf8');
    if (!aiWorker.includes("'@cf/openai/gpt-oss-120b'") || !/reasoning_effort:\s*'low'/.test(aiWorker)) {
      fail('worker/ai.js must use GPT-OSS-120B with low reasoning');
    }
    if (!/GLOBAL_DAILY_LIMIT\s*=\s*18/.test(aiWorker) || !/USER_DAILY_LIMIT\s*=\s*10/.test(aiWorker)) {
      fail('worker/ai.js must retain the reviewed daily request limits');
    }
    if (/api[_-]?key|bearer\s+[A-Za-z0-9_-]{20,}/i.test(aiWorker)) {
      fail('worker/ai.js must not contain a provider API key');
    }
  }
  const aiWorkerEntry = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
  if (!aiWorkerEntry.includes("url.pathname.startsWith('/api/ai/')") || !aiWorkerEntry.includes('export { AiDailyQuota }')) {
    fail('worker/index.js must route TAAMEN AI and export the Durable Object class');
  }
  if (!/"id"\s*:\s*"7698f62403814e81b6f2ca13a8eb9cbc"/.test(wrangler)) {
    fail('wrangler.jsonc must use the confirmed TAAMEN_KV namespace id 7698f62403814e81b6f2ca13a8eb9cbc');
  }
  if (/taamen-kv-replace-before-deploy|taamen-kv-local-preview/.test(wrangler)) {
    fail('wrangler.jsonc still contains a placeholder KV namespace id');
  }
  const homePath = path.join(root, 'src/pages/Home.tsx');
  const assistantPath = path.join(root, 'src/pages/Assistant.tsx');
  const homeSource = fs.existsSync(homePath) ? fs.readFileSync(homePath, 'utf8') : '';
  const assistantSource = fs.existsSync(assistantPath) ? fs.readFileSync(assistantPath, 'utf8') : '';
  if (!homeSource.includes('home-ai-card') || !homeSource.includes('go(\'assistant\')') || !homeSource.includes('BETA')) {
    fail('Home must promote TAAMEN AI with the new BETA card');
  }
  if (!assistantSource.includes('TAAMEN AI') || !assistantSource.includes('assistant-beta-badge')) {
    fail('The assistant page must use the TAAMEN AI BETA identity');
  }
  if (fs.existsSync(path.join(root, 'src/pages/Trophy.tsx')) || fs.existsSync(path.join(root, 'src/config/campaign.ts'))) {
    fail('The retired Challenge #01 product surface must not ship in V13');
  }
  const publicRoutesPath = path.join(root, 'src/config/publicRoutes.ts');
  const sitemapPath = path.join(root, 'public/sitemap.xml');
  if (!fs.existsSync(publicRoutesPath) || !fs.existsSync(sitemapPath)) {
    fail('Public route registry and public/sitemap.xml must both exist');
  } else {
    const routeSource = fs.readFileSync(publicRoutesPath, 'utf8');
    const sitemap = fs.readFileSync(sitemapPath, 'utf8');
    const list = routeSource.match(/PUBLIC_SITEMAP_PATHS\s*=\s*\[([\s\S]*?)\]/);
    const paths = list ? [...list[1].matchAll(/[\'\"]([^\'\"]+)[\'\"]/g)].map(match => match[1]) : [];
    const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
    const expected = paths.map(route => route === '/' ? 'https://taamenn.com/' : `https://taamenn.com${route}`);
    if (expected.length !== urls.length || expected.some(url => !urls.includes(url))) {
      fail('public/sitemap.xml must list every route from PUBLIC_SITEMAP_PATHS exactly once');
    }
    if (paths.includes('/trophy') || urls.some(url => url.endsWith('/trophy'))) fail('Retired /trophy campaign routes must not appear in the public sitemap');
    if (sitemap.includes('/api/') || sitemap.includes('/share/')) fail('Sitemap must not expose API or tokenized share URLs');
  }
  if (!/"EMAILJS_SERVICE_ID"\s*:\s*"service_13mkb9h"/.test(wrangler)
    || !/"EMAILJS_CONTACT_TEMPLATE_ID"\s*:\s*"template_jsugxta"/.test(wrangler)
    || !/"EMAILJS_AUTOREPLY_TEMPLATE_ID"\s*:\s*"template_4pj4xlm"/.test(wrangler)
    || !/"EMAILJS_PUBLIC_KEY"\s*:\s*"7xyuge5ZLIgBevcbL"/.test(wrangler)) {
    fail('wrangler.jsonc must keep the authoritative EmailJS public IDs');
  }
  const productionEnv = wrangler.match(/"production"\s*:\s*\{[\s\S]*?\n    \}/);
  if (!productionEnv) {
    fail('wrangler.jsonc must define env.production for Cloudflare Vite CLOUDFLARE_ENV=production');
  } else {
    const block = productionEnv[0];
    if (!/"REQUIRE_HTTPS"\s*:\s*"true"/.test(block)) {
      fail('wrangler.jsonc env.production must set REQUIRE_HTTPS=true');
    }
    if (!/"NODE_ENV"\s*:\s*"production"/.test(block)) {
      fail('wrangler.jsonc env.production must set NODE_ENV=production');
    }
    if (!/"id"\s*:\s*"7698f62403814e81b6f2ca13a8eb9cbc"/.test(block)) {
      fail('wrangler.jsonc env.production must bind the confirmed TAAMEN_KV id');
    }
    if (!/"EMAILJS_SERVICE_ID"\s*:\s*"service_13mkb9h"/.test(block)
      || !/"EMAILJS_CONTACT_TEMPLATE_ID"\s*:\s*"template_jsugxta"/.test(block)
      || !/"EMAILJS_AUTOREPLY_TEMPLATE_ID"\s*:\s*"template_4pj4xlm"/.test(block)
      || !/"EMAILJS_PUBLIC_KEY"\s*:\s*"7xyuge5ZLIgBevcbL"/.test(block)) {
      fail('wrangler.jsonc env.production must keep the authoritative EmailJS public IDs');
    }
  }
  const topLevelVars = wrangler.match(/"vars"\s*:\s*\{[\s\S]*?\n  \}/);
  if (!topLevelVars || !/"REQUIRE_HTTPS"\s*:\s*"false"/.test(topLevelVars[0])) {
    fail('wrangler.jsonc top-level vars must keep REQUIRE_HTTPS=false for local Worker preview');
  }
  if (/"TAAMEN_SUPPORT_RECIPIENT"/.test(wrangler) || /"EMAILJS_PRIVATE_KEY"/.test(wrangler)) {
    fail('wrangler.jsonc must not declare secrets as vars');
  }
}

// ---------------------------------------------------------------------------
// 8. Official branding asset integrity.
//     SHA-256 of the supplied TAAMEN brand mark committed with the product.
//     Update this digest only when the product owner replaces that official asset.
// ---------------------------------------------------------------------------
const logoPath = path.join(root, 'public/assets/taamen-brand-mark.png');
const EXPECTED_LOGO_SHA256 = 'be96fd7400c6013efd5a53c4246e57286585a46fb0c3bc8fdbfd7c7c671ae251';
if (!fs.existsSync(logoPath)) {
  fail('public/assets/taamen-brand-mark.png is missing');
} else {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(logoPath)).digest('hex');
  if (actual !== EXPECTED_LOGO_SHA256) fail('The official TAAMEN logo asset was modified');
}

// ---------------------------------------------------------------------------
if (!distFiles.length) {
  notes.push(`${path.relative(root, distRoot) || 'dist/'} is absent: build output was not inspected. Run \`npm run build\` then re-run this check.`);
}

for (const note of notes) console.log(`note: ${note}`);

if (failures.length) {
  console.error(`\nTAAMEN client privacy invariants: FAIL (${failures.length})`);
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log(`\nTAAMEN client privacy invariants: PASS`);
console.log(`Inspected ${sourceFiles.length} source, ${publicFiles.length} public, ${distFiles.length} build files.`);
