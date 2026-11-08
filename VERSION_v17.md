# TAAMEN 2.0 — V17

**Archive milestone:** V17 Cloud Storage Foundation  
**Base:** User-verified `TAAMEN_2_0_V16_Tactical_AI_HOTFIX_03.zip`  
**Product version:** `2.0.0` (unchanged)  
**Deployment:** NOT DEPLOYED  
**D1 provisioning:** NOT PERFORMED  
**Authentication:** deferred to V19

## Purpose

Establish a secure, account-owned D1 storage layer for the existing Tactical Plan Schema v1 and V15 plan-library contract without enabling anonymous/local cloud access or implementing account authentication early.

## Changes

- Add D1 migration `0001_create_tactical_plan_library.sql`.
- Add Worker routes `GET/POST /api/plans`, `GET/PUT/PATCH/DELETE /api/plans/:id`.
- Enforce account ownership from server-side identity only, per-format five-slot capacity, schema validation, 256 KiB payload limit, soft deletion and optimistic revisions.
- Add fail-closed `resolveAuthenticatedCloudUser` seam; it intentionally returns null until V19.
- Add browser cloud repository adapter with strict response validation and no IndexedDB fallback.
- Extend library entry and repository contracts for stable server-assigned slots and revisions.
- Add explicit save-to-empty-slot support and a separate confirmed replace-saved-plan action; the latter preserves plan ID/slot and advances revision.
- Bump Service Worker cache namespace to v17.
- Add Arabic D1 setup and release documentation.

## Not included

- No D1 database creation or active Wrangler binding.
- No remote or production migrations.
- No real account/session authentication or cloud library enablement.
- No sync engine, local-to-cloud migration, match storage, or account-based AI quota.
- No production deployment or live Worker/domain changes.

## Release gate

V17 source verification passes QA and the available automated suites (Worker 43/43; focused library/API/panel 45/45; backend 27/27; frontend 236/238 with two dependency-resolution startup failures). Full dependency-backed TypeScript and production build checks remain a required local verification step because `npm ci` did not complete in the isolated build environment.

## V17 Hotfix 01 — Windows typecheck correction

- Fixed the in-memory `MemoryPlanRepository` test helper in `src/services/tacticalPlanLibraryActions.test.ts` so it narrows an optional slot before calling `Set.has()`.
- Added explicit invalid-slot validation to the helper (integer 1–5) before checking occupancy.
- This is a test-only TypeScript fix. It does not change production behavior, API contracts, D1 schema, Worker identity policy, or Cloudflare bindings.
- See `V17_HOTFIX_01_REPORT.md` for the user's Windows results and the required re-verification sequence.
