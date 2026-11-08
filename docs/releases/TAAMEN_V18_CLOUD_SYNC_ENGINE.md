# TAAMEN 2.0 — V18 Cloud Sync Engine Foundation

**Date:** 5 November 2026  
**Application/package version:** `2.0.0` (unchanged)  
**Release label:** V18  
**Source baseline:** V17 Cloud Storage Foundation + Hotfix 01 + Hotfix 02 D1 Preview patch, consolidated into one complete source tree.  
**Deployment:** Not deployed.  
**D1:** V17 Preview migration 0001 is already applied; V18 migration 0002 is included but must be applied to Preview by the operator after local verification.  
**Authentication:** Not implemented; cloud routes fail closed until V19.

## Scope

V18 introduces a D1-backed synchronization foundation for structured text/JSON data. It adds a server-side Worker push/pull API, record revisions, idempotent retries, a compact per-record cursor index, tombstones, per-account request limits, strict payload validation, and client-side protocol/outbox modules.

It does not enable sync for end users. The verified-session identity resolver remains fail-closed. The outbox is deliberately not connected to normal local writes before V19 consent and account session flows exist.

## Data boundaries

- Syncable: profile display name and non-private current/local match records, including archived results, statistics and personal performance.
- Existing separate cloud store: tactical plans in V17 `tactical_plans` through `/api/plans`.
- Derived: analytics are computed from match/archive records and are not duplicated in a separate table.
- Local-only: `PRIVATE` matches, legacy records, settings, device preferences, local conversation history, notifications and temporary UI state.
- Excluded from cloud transcript storage: TAAMEN AI conversation messages. Existing inference request behavior is separate and unchanged.
- No R2 bucket or object storage; no files or images are added to D1.

## Implementation

- `migrations/0002_cloud_sync_engine.sql`
- `worker/syncEngine.js`
- `src/services/cloudSyncProtocol.ts`
- `src/services/cloudSyncClient.ts`
- `src/services/cloudSyncOutbox.ts`
- `worker/syncEngine.sqlite.integration.test.mjs`
- `src/services/cloudSyncProtocol.test.ts`
- `src/services/cloudSyncClient.test.ts`

`sync_changes` is intentionally compact: one latest cursor row per entity, not a full append-only history. Deleted sync records retain only the ID inside their JSON tombstone; the former record text is cleared.

## Security controls

Verified session identity is required and currently unavailable. Account ownership is never read from client payload. The Worker checks account status, same-origin `Origin`, CSRF header, content type, streaming body limit, bounded JSON depth/arrays, exact field allowlists, record types/sizes, private/legacy exclusion, parameterized D1 queries, revision CAS, idempotency SHA-256, and a 60-per-minute account request guard.

## Compatibility

- Package version remains `2.0.0`.
- Existing IndexedDB database/version remains unchanged; V18 reuses `syncQueue`.
- Existing local saves and AI chat behavior are not wired to cloud sync or altered.
- Existing tactical plan library API and data model remain separate.
- Service Worker cache namespace advances to V18.
- Preview D1 binding remains in the default environment only; production has no D1 binding.

## Validation

See `TAAMEN_V18_QA_REPORT.md`. It lists SQLite integration tests, client protocol tests and static privacy QA. Full project TypeScript typecheck and Vite production build are not certified in this isolated workspace because the package's pinned dependencies are not installed here; those must be completed after extraction on Windows.

## Operator actions

1. Extract the full V18 archive as a new working copy; keep V17 untouched.
2. Run `npm ci`, typecheck, frontend/backend/worker tests, `qa:final`, and `build:production` locally.
3. Apply only `0002_cloud_sync_engine.sql` to the existing `taamen-plans-preview` database after checking the migration list.
4. Inspect the new tables and run preview smoke tests.
5. Do not deploy or attach a production D1 database.

## Next phase

V19 must implement verified email account authentication, HttpOnly sessions, server-side user provisioning, CSRF/session revocation, and explicit cloud-sync consent before connecting the local outbox to user data. V20 can then deliver the end-to-end migration and two-device rollout with conflict UX and recovery tests.
