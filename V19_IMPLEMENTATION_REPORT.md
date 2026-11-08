# TAAMEN V19 — Implementation Report

**Milestone:** Verified Accounts & Session Foundation  
**Date:** 6 November 2026  
**Package version:** `2.0.0` (unchanged)  
**Baseline:** `TAAMEN_2_0_V18_CLOUD_SYNC_ENGINE_HOTFIX_01.zip`  
**Deployment:** Not deployed.  
**Cloudflare:** No account settings, secrets, production Worker, or production database were changed.

## 1. Implemented

- Local / cloud / guest entry chooser with Arabic/English help panels.
- Email OTP and Google OAuth server routes.
- D1 account identity, challenge, rate-limit, session and OAuth-state schema.
- Opaque random session tokens; only SHA-256 peppered hashes are stored in D1.
- `HttpOnly; Secure; SameSite=Lax` session cookie on HTTPS; readable CSRF cookie is `SameSite=Strict`; host-only `__Host-` names are used on HTTPS.
- Same-origin checks, custom request marker, CSRF double-submit + stored hash, 8 KiB JSON ceiling, rate limits, OTP single use, 10-minute challenge TTL and 5-attempt limit.
- Google OAuth Authorization Code + PKCE S256, one-time state hash and browser-bound HttpOnly state cookie.
- Cloud profile names are account-owned and editable; verified email is read-only in profile/settings.
- Avatar, phone, optional local email and device preferences remain in IndexedDB/local settings. Cloud email is not copied to IndexedDB. Cloud first/last name is canonical in D1, with a local display projection for offline UI. Saving local photo/phone fields happens before a remote name update so a network failure does not discard device-owned edits.
- Active session list, revoke other session, current logout, and logout-all.
- Explicit sync preference is stored but the Worker still rejects general match/profile sync unless the server-managed `cloud_sync_enabled` flag is enabled later by V20.
- Service Worker cache namespace advances to V19.

## 2. Migration 0003

`migrations/0003_verified_cloud_accounts.sql` is additive. It extends `users` with email verification, account names and consent fields; creates `account_identities`, `email_auth_challenges`, `auth_rate_limits`, `cloud_sessions`, and `google_oauth_states`; and adds foreign keys and indexes. It does not drop or rewrite V17 tactical plan data or V18 sync data.

The migration is included in the source archive but has not been applied to remote D1 by this implementation run. The operator applies it to the existing Preview database only after the local verification gates pass.

## 3. Intentional provider readiness state

The login UI reports Google/email unavailable until the required environment configuration exists. EmailJS support and auto-reply templates are not reused. A dedicated `EMAILJS_AUTH_TEMPLATE_ID` is required. No client ID, client secret, pepper, token or provider secret is fabricated or committed.

- Bumped the canonical privacy/consent policy to `2.3` and added Arabic/English disclosures for account data, EmailJS OTP delivery, Google OAuth, D1 storage, essential session/CSRF cookies, and the V20 sync boundary. Cloud provider entry requires an explicit checkbox acceptance of policy 2.3; the accepted version and timestamp are stored in D1 on successful verification.

## 4. Known boundaries / not included

- Actual match/archive synchronization and local-data migration remain V20.
- No automatic import of local profile, matches, archives or tactical drafts into the cloud.
- No image/phone storage in D1 or R2.
- No cloud AI chat persistence.
- No email-change workflow or cross-account merge UI.
- No production deployment, production D1, or production secret configuration.

## 5. Release qualification

This is a **Preview implementation candidate**, not production-certified. The current environment could not complete `npm ci` because the npm install process timed out and `node_modules` remained incomplete. Latest checks: Worker 69/69, focused auth 9/9, Backend 27/27, V19 UX source-boundary 7/7, frontend 253 passed with two module-load failures, and `qa:final` PASS (175 source / 34 public / 0 build files). Typecheck and production build stop at missing `@types/node`, `@types/react`, and `@types/react-dom`; browser E2E and live providers remain unverified. See `TAAMEN_V19_QA_REPORT.md` for exact details.

The original V18 archive's lockfile is present in this worktree. The operator's newer Windows `package-lock.json` created by `npm audit fix` was not available to this environment; replace it before running `npm ci` so the V19 archive preserves the dependency set that reported zero vulnerabilities on Windows.
