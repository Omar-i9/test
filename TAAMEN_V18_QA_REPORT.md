# TAAMEN V18 — QA and Handoff Report

**Date:** 5 November 2026  
**Source milestone:** V18 Hotfix 01 (TypeScript test typing repair)  
**Package version:** `2.0.0` (unchanged)  
**Deployment:** Not deployed  
**Environment:** Linux isolated source workspace, Node.js 22.16.0, npm 10.9.0. The user's Windows/Cloudflare environment was not modified by these code changes.

## Delivered

- Consolidated V17 base + Hotfix 01 + Hotfix 02 into one project tree before adding V18.
- Added additive D1 migration `0002_cloud_sync_engine.sql` with account-isolated cursor state.
- Added Worker push/pull sync routes with verified-identity seam, strict validation, revision conflict detection, idempotency, account scoping, compact change cursor, tombstones, and request limits.
- Added typed client protocol, same-origin API client, and local IndexedDB outbox helper.
- Kept R2, AI chat transcript sync, private match sync, and production D1 out of scope.
- Updated Service Worker cache to V18 and corrected stale root README/Wrangler comments.

## Tests actually run after final code changes

| Check | Result | Notes |
|---|---:|---|
| Full Worker suite `node --test worker/*.test.mjs` | **60/60 PASS** | Includes V17 plan API, AI, migration tests, and 17 V18 sync integration tests. |
| Backend `npm run test:backend` | **27/27 PASS** | Existing contact, push and backend validation tests. |
| New Cloud Sync client/protocol tests | **10/10 PASS** | Node TypeScript type-stripping test run. |
| `scripts/qa-final.mjs` | **PASS** | 172 source files and 34 public files inspected. No `dist` existed, so build output was not inspected. |
| `node --check worker/syncEngine.js` | **PASS** | Worker JS syntax validation. |

The operator reported on Windows with Node.js 24.16.0 / npm 11.15.0: `npm ci` succeeded, frontend tests passed 254/254, backend passed 27/27, Worker passed 60/60, and `qa:final` passed. The first `typecheck` exposed nine compile-time errors in the two new test files. Hotfix 01 fixes those test-only type issues by using a typed capture array and valid UUID test values. Focused client/protocol tests were rerun after the fix and passed 10/10.

The operator's first `build:production` stopped at the same TypeScript errors. The subsequent preview failed because the Cloudflare Vite plugin had no generated `.wrangler/deploy/config.json`; this happened after the failed build and is not yet evidence of an independent preview/runtime defect. The correct next check is a successful build followed by preview.

The V18 SQLite integration tests cover per-account cursor isolation, same-millisecond updates, idempotency, conflict handling, soft-delete payload clearing, account isolation, malformed/private records, cursor recovery, retention cleanup, and request limits.

## Not certified here

- `npm ci` was not run in this isolated workspace; `node_modules` is absent.
- Full `npm run typecheck` using the project's pinned TypeScript 7.0.2 remains pending after Hotfix 01; the isolated workspace could not complete `npm ci`.
- `npm run build:production` and Vite preview remain pending after the type fixes; there is no built `dist` output.
- The operator ran the full frontend suite successfully (254/254) before Hotfix 01; the two affected tests were rerun together after the fix (10/10). Browser E2E remains pending.
- V18 migration `0002` has not been applied to the user's remote Preview D1 by this package build.
- No live Worker route was deployed or tested against Cloudflare D1.

## Security boundaries retained

- `worker/planIdentity.js` remains fail-closed; cloud sync and plan routes return 401 until V19 verified sessions exist.
- The server looks up active account rows in `users` and never accepts owner identity from client payload.
- Private matches and legacy records are rejected on client/server.
- Deleted sync payload is reduced to an ID-only tombstone.
- Cursor values are isolated per account; gaps cannot expose other accounts' update counts.
- V18 does not provision R2, a Production D1 binding, or cloud AI chat storage.
- Outbox is not wired to normal writes and requires an explicit consent flag, but authoritative consent/session enforcement must be implemented server-side in V19.

## Operator steps required

After extraction of the V18 Hotfix 01 package on Windows:

```powershell
npm ci
npm run typecheck
npm run test:frontend
npm run test:backend
npm run test:worker
npm run qa:final
npm run build:production
npm run preview
```

Only after these pass, inspect the migration list and apply `0002_cloud_sync_engine.sql` to the already-existing `taamen-plans-preview` database. Do not reapply V17 `0001`, do not create a second Preview DB, do not add Preview D1 to Production, and do not deploy from this phase.

## Known follow-up

Before V19, review sync limits against expected account volume and add per-account daily operation quotas if measurements require them. Before purging tombstones, implement device cursor acknowledgements; otherwise an offline device could reintroduce an older deleted record.
