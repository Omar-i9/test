import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('V19 authentication entry presents local and verified-cloud account paths without embedding guest mode', () => {
  const auth = source('./components/AuthEntry.tsx');
  assert.match(auth, /Local profile/);
  assert.match(auth, /Cloud account/);
  assert.doesNotMatch(auth, /Continue as guest|المتابعة كزائر/);
  assert.match(auth, /onClose/);
  assert.match(auth, /HelpCircle/);
  assert.match(auth, /Continue with Google/);
  assert.match(auth, /Continue with email/);
  assert.match(auth, /لن تُرفع بياناتك المحلية إلى السحابة بمجرد إنشاء حساب/);
  const welcome = source('./components/FirstVisitExperience.tsx');
  assert.match(welcome, /copy\.continueGuest/);
});

test('cloud identity is kept separate from local photo, phone, and local email storage', () => {
  const app = source('./App.tsx');
  const profile = source('./components/Profile.tsx');
  const settings = source('./pages/Settings.tsx');
  assert.match(app, /email:\s*''/);
  assert.match(app, /\.\.\.\(?current\s*\?\?/);
  assert.match(profile, /!cloudMode\s*&&\s*<label>.*Email/s);
  assert.match(profile, /Phone/);
  assert.match(profile, /avatarData/);
  assert.match(profile, /email:\s*cloudUser\s*\?\s*''/);
  assert.doesNotMatch(settings, /Email verification|Verified email address|Confirm email|تأكيد البريد/i, 'email verification controls must not be rendered in Settings');
  assert.match(source('../worker/cloudAuth.js'), /path === '\/email\/verify' && method === 'POST'/, 'email verification remains available in the authentication backend');
  assert.match(profile, /Optional · local only/);
});

test('cloud consent records a future preference but never turns on V18 match sync', () => {
  const auth = source('../worker/cloudAuth.js');
  const sync = source('../worker/syncEngine.js');
  const profile = source('./components/Profile.tsx');
  assert.match(auth, /cloud_sync_enabled\s*=\s*0/);
  assert.match(sync, /requireCloudSyncEnabled:\s*true/);
  assert.match(profile, /لا يوجد رفع أو تنزيل للمباريات حاليًا/);
  assert.match(source('./services/cloudAuthClient.ts'), /activation:\s*'v20'/);
});

test('service worker advances to V19 and bypasses private API requests', () => {
  const sw = source('../public/sw.js');
  assert.match(sw, /VERSION='v19'/);
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
});

test('account privacy policy acceptance is required before provider sign-in', () => {
  const entry = source('./components/AuthEntry.tsx');
  const client = source('./services/cloudAuthClient.ts');
  assert.match(entry, /cloudPolicyAccepted/);
  assert.match(entry, /href=\"\/privacy\"/);
  assert.match(entry, /href=\"\/terms\"/);
  assert.match(client, /policyVersion: POLICY_VERSION/);
  assert.match(client, /'\/auth\/google\/start'/);
  assert.match(client, /method: 'POST', body: \{ acceptPolicy: true, policyVersion: POLICY_VERSION \}/);
  assert.match(client, /authorizationUrl/);
  const app = source('./App.tsx');
  assert.match(app, /تم التحقق وربط حساب TAAMEN Cloud بنجاح/);
  assert.match(app, /تم إنشاء ملفك المحلي/);
});


test('cloud profile saves device-owned fields before attempting an online account-name update', () => {
  const profile = source('./components/Profile.tsx');
  const localSave = profile.indexOf('const deviceProfile = await saveProfile');
  const cloudUpdate = profile.indexOf('cloudAuthClient.updateProfile');
  assert.ok(localSave >= 0 && cloudUpdate > localSave, 'device data must persist before the cloud request');
  assert.match(profile, /photo and phone were saved on this device, but the cloud account name was not updated/i);
  assert.match(profile, /حُفظت الصورة والهاتف على هذا الجهاز، لكن تعذّر تحديث اسم الحساب السحابي/);
});

test('email verification UI shows a live one-time-code expiry countdown', () => {
  const auth = source('./components/AuthEntry.tsx');
  assert.match(auth, /setInterval\(\(\) => setClockNow\(Date\.now\(\)\), 1000\)/);
  assert.match(auth, /secondsRemaining = Math\.max\(0, Math\.ceil\(\(expiresAt - clockNow\) \/ 1000\)\)/);
  assert.match(auth, /Code expires in \$\{expiryLabel\}/);
});

test('guest access stays outside authentication and profile registration screens', () => {
  const auth = source('./components/AuthEntry.tsx');
  const profileSetup = source('./components/ProfileSetup.tsx');
  const welcome = source('./components/FirstVisitExperience.tsx');
  assert.doesNotMatch(auth, /Three clear options|ثلاث طرق واضحة|Browse without signing in/);
  assert.match(auth, /Two clear options|خياران واضحان/);
  assert.doesNotMatch(profileSetup, /Continue as guest|المتابعة كزائر/);
  assert.match(profileSetup, /Back to account options|الرجوع لاختيارات الحساب/);
  assert.match(welcome, /copy\.continueGuest/);
});


test('help hub exposes one replayable tour action and the existing guide action', () => {
  const hub = source('./pages/AccountHub.tsx');
  assert.match(hub, /account-help-title/);
  assert.match(hub, /taamen:start-tour/);
  assert.match(hub, /setGuideOpen\(true\)/);
  assert.match(hub, /ابدأ الجولة التفاعلية/);
  assert.match(hub, /عرض دليل الاستخدام/);
  assert.doesNotMatch(hub, /Acquisition|acquisition/i);
});

test('provider linking buttons are wired to real cloud-auth client methods and worker routes', () => {
  const profile = source('./components/Profile.tsx');
  const client = source('./services/cloudAuthClient.ts');
  const worker = source('../worker/cloudAuth.js');
  assert.match(profile, /cloudAuthClient\.startGoogleLink\(\)/);
  assert.match(profile, /cloudAuthClient\.requestEmailLinkCode\(/);
  assert.match(profile, /cloudAuthClient\.verifyEmailLinkCode\(/);
  assert.match(client, /'\/auth\/google\/link\/start'/);
  assert.match(client, /'\/auth\/email\/link\/request'/);
  assert.match(client, /'\/auth\/email\/link\/verify'/);
  assert.match(client, /unlinkProvider\(provider: CloudProvider\)/);
  assert.match(profile, /cloudAuthClient\.unlinkProvider\(provider\)/);
  assert.match(worker, /path === '\/provider\/unlink'/);
  assert.match(worker, /path === '\/email\/link\/request'/);
  assert.match(worker, /path === '\/email\/link\/verify'/);
  assert.match(worker, /path === '\/google\/link\/start'/);
});

test('provider status separates worker reachability, provider configuration, and linked identities', () => {
  const profile = source('./components/Profile.tsx');
  assert.match(profile, /Worker API/);
  assert.match(profile, /Google OAuth/);
  assert.match(profile, /Match data sync/);
  assert.match(profile, /Not enabled in V19 — planned for V20/);
  assert.match(profile, /Email verification/);
  assert.match(profile, /authConfig\.google/);
  assert.match(profile, /authConfig\.email/);
  assert.match(profile, /cloudUser\.providers/);
});

test('legacy acquisition route is redirected and no acquisition page or entry point is imported', () => {
  const app = source('./App.tsx');
  assert.match(app, /path\s*===\s*'\/acquisition'/);
  assert.match(app, /removed-acquisition/);
  assert.doesNotMatch(app, /AcquisitionPage|SideProjectorsBadge|acquisition-nav/);
  assert.doesNotMatch(source('./config/routes.ts'), /acquisition/i);
  assert.doesNotMatch(source('../public/sitemap.xml'), /acquisition/i);
});

test('language menu is portaled outside Settings layout and responds to viewport changes', () => {
  const picker = source('./components/ShellControls.tsx');
  assert.match(picker, /createPortal\(/);
  assert.match(picker, /position: 'fixed'/);
  assert.match(picker, /document\.body/);
  assert.match(picker, /pointerdown/);
  assert.match(picker, /event\.key === 'Escape'/);
  assert.match(picker, /visualViewport\?\.addEventListener\('resize'/);
  assert.match(picker, /visualViewport\?\.addEventListener\('scroll'/);
});
