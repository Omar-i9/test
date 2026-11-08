# TAAMEN 2.0 — V19 Verified Accounts Foundation

**Current source milestone:** V19 implementation candidate (built from V18 Hotfix 01)  
**Application/package version:** `2.0.0` (unchanged)  
**Deployment:** Not deployed.  
**Database:** V17 `0001` and V18 `0002` remain the existing Preview baseline. V19 adds `0003_verified_cloud_accounts.sql`; it is included but has not been applied to the operator's Preview database in this archive.  
**Authentication providers:** Disabled until Preview-only credentials and the dedicated EmailJS authentication template are configured.  
**General match/archive sync:** Still disabled. V19 records a future consent preference only; V20 owns the data migration and actual two-device synchronization release.

Latest local QA: Worker 69/69, backend 27/27, focused cloud-auth 9/9, V19 UX boundary 7/7; frontend partial (253 passed, 2 module-load failures due to missing React/Lucide dependencies). Typecheck and production build are blocked by incomplete dependencies. See the QA report for exact details.

Read [README_V19_AR.md](README_V19_AR.md) for the Arabic operator handoff, [V19_IMPLEMENTATION_REPORT.md](V19_IMPLEMENTATION_REPORT.md) for scope and limitations, [TAAMEN_V19_QA_REPORT.md](TAAMEN_V19_QA_REPORT.md) for tests actually executed, and [docs/authentication/V19_AR.md](docs/authentication/V19_AR.md) for the detailed account/session/privacy design.

## V19 scope

- Three first-entry choices: local profile, verified cloud account, or guest browsing.
- Contextual help for local vs. cloud account permissions and storage behavior.
- Passwordless email verification (six-digit one-time code) and Google OAuth Authorization Code + PKCE S256.
- D1-backed account identities, hashed single-use challenges, rate limits, hashed opaque sessions, CSRF state, session listing/revocation, and logout.
- Server-side account identity is derived only from an active D1 session. A local profile, email field, installation ID, request body, or URL never establishes cloud ownership.
- Cloud account first/last name and verified email are account fields. Avatar, phone, device preferences, local matches and AI conversation history remain local.
- Cloud profile page displays the verified email as read-only, editable account names, local photo/phone controls, sessions, sync explanation and consent preference.
- The privacy policy is bumped to `2.3` and discloses cloud-account processing, provider roles, D1 account fields, essential session/CSRF cookies, and the fact that match/archive sync remains off until V20.
- Email and Google provider buttons remain disabled until their server-side credentials are configured.

## What V19 deliberately does not enable

- The V18 `sync_records`/`sync_changes` engine is not activated for real-user match/profile data. The Worker requires the server-managed `cloud_sync_enabled=1` flag, which remains `0` in V19. A consent timestamp alone cannot enable sync.
- No automatic upload of local matches, archives, tactical drafts, profile photo, phone, analytics, AI chat, or device settings.
- No R2 bucket, object storage, production D1 binding, Worker deployment, or production account modification.
- No email-change or provider-link management UI. Google and email can resolve to the same account when their verified email matches, but cross-account merge is not attempted.

## Windows validation sequence

Use Node.js 22.16.0 / Node 22 LTS and preserve the tested V18 Hotfix 01 folder. The exact updated `package-lock.json` created on the operator's Windows machine after `npm audit fix` must be copied into this V19 worktree before `npm ci`; it was not available in the source archive used to build this candidate.

```powershell
npm ci
npm run typecheck
npm run test:frontend
npm run test:backend
npm run test:worker
npm run qa:final
npm run build:production
npm run qa:final
npm run preview
```

Then follow the Preview-only migration and configuration steps in [README_V19_AR.md](README_V19_AR.md). Do not apply migrations or configure auth secrets until the local build and tests pass.

## Release integrity

- Version label is V19; `package.json` remains `2.0.0`.
- Service Worker cache namespace advances to `v19`.
- Migration 0003 is additive; it preserves the V17 tactical plan tables and V18 sync tables.
- The Preview D1 binding remains only in Wrangler's default environment. The production environment intentionally has no D1 binding.
- No production deploy or Cloudflare production configuration change was performed.
