# TAAMEN V17 — Cloud Storage Foundation QA Report

**Baseline:** User-verified TAAMEN V16 Hotfix 03  
**Milestone:** V17  
**Package version:** 2.0.0 (unchanged)  
**D1:** Not provisioned or bound  
**Authentication:** Intentionally fail-closed; deferred to V19  
**Deployment:** Not deployed

## Executive summary

V17 adds the source-level D1/Worker/cloud-repository foundation for the existing Tactical Plan Schema v1. It does not turn on the cloud plan library for Guest or Local Profile users. The default Worker handler resolves no cloud user until a verified HttpOnly session implementation is added in V19; if exercised in a configured runtime, the route returns `401 not_authenticated` by design. No live deployment was made.

No D1 resource was created, no remote migration was applied, no secrets or production bindings were modified, and no `wrangler deploy` was run.

## Main implementation

- `migrations/0001_create_tactical_plan_library.sql`
  - `users` identity anchor and account-owned `tactical_plans` table.
  - format constraint (`5v5`/`7v7`), slot 1–5, title 1–70, Schema v1, JSON validity and indexed JSON identity/format/title consistency.
  - UTF-8 payload cap 256 KiB, revision >= 1, foreign key to users, and a partial unique index on active `(user_id, format, slot_number)`.
  - Soft-deleted records remain as tombstones while their active slot is released.
  - D1 enforces foreign keys by default. The migration deliberately does not issue `PRAGMA foreign_keys = ON`, because D1 runs queries/migrations in implicit transactions and does not allow a query to change that setting. The Node SQLite test harness enables it explicitly to reproduce D1's documented default.
- `worker/tacticalPlans.js`
  - `GET /api/plans?format=...`, `POST /api/plans`, `GET /api/plans/:id`, `PUT`, `PATCH`, and `DELETE`.
  - Session-derived owner only; no owner field accepted from the browser.
  - strict schema/geometry/style/size validation, parameterized SQL, same-origin and CSRF checks.
  - server-assigned ID and stable first-free slot, atomic unique-index race guard, revision compare-and-swap, and soft delete.
- `worker/planIdentity.js`: fails closed until V19 verified sessions exist.
- `src/services/cloudTacticalPlanLibraryRepository.ts`: strict API adapter; intentionally no local IndexedDB fallback. The adapter is instantiated in `App.tsx` and passed through both direct Tactical Board and nested PlayCenter entry points; `cloudAccountReady` remains false, so no cloud request is made or access exposed yet. It verifies returned identity, format, title and revision for every mutation/read operation.
- Repository and library contracts carry stable slot number and monotonic revision. Cloud saves can target a specific empty slot; the panel also offers an explicit-confirmation replace-saved action that preserves plan ID/slot and increments revision.
- `worker/index.js` dispatches `/api/plans` before legacy KV bootstrap.
- Service Worker cache namespace bumped to v17.

## Automated verification

| Check | Result | Notes |
|---|---:|---|
| `npm run qa:final` | PASS | 167 source files + 34 public files inspected; build output absent, so no dist inspection |
| `npm run test:worker` | 43/43 PASS | Includes AI regression coverage, plan API, migration SQL and Wrangler dispatch checks |
| SQLite migration tests | 6/6 PASS | Real SQLite engine via Node `node:sqlite`; tests constraints, foreign keys, slots, JSON/size and revision logic |
| SQLite-backed Worker lifecycle | PASS | Real Worker handler exercised through a D1-shaped SQLite adapter for owner isolation, 5+5 slots, revision conflicts, replacement, tombstones and slot reuse |
| Focused library/API/repository/panel tests | 45/45 PASS | Domain, panel contract, actions, API client, cloud adapter and app wiring |
| `npm run test:backend` | 27/27 PASS | Existing backend tests preserved |
| Full `npm run test:frontend` | 236/238 PASS | Two test files could not start because the incomplete install lacks `lucide-react` and `react`; no assertion failed in those two files |
| TS/TSX syntax transpilation | 14/14 PASS | Global TypeScript 5.8.3 parser/transpiler only; not equivalent to project TypeScript 7.0.2 typecheck |
| `npm ci` | BLOCKED | Dependency installation exceeded the isolated environment timeout; partial `node_modules` was excluded from the release archive |
| `npm run typecheck` | NOT CERTIFIED | Project-pinned TypeScript 7.0.2 dependencies unavailable |
| `npm run build:production` | NOT CERTIFIED | Vite dependency installation unavailable; no `dist` output inspected |
| Real Cloudflare D1/Preview | NOT RUN | No database IDs provisioned or binding added |

The two unavailable Frontend test files are:

- `src/config/routes.test.ts` — missing `lucide-react` package entry point.
- `src/domain/matches/mobileProduct.test.ts` — missing `react` package entry point.

An earlier run exposed one stale Service Worker test assertion that expected v16. It was updated to v17; the remaining two unresolved files are dependency-resolution failures only.

## Security/architecture notes

- There is no development header, installation ID, local email, or LocalProfile-based identity bypass.
- All plan reads/writes are scoped by authenticated server-side `user_id`.
- `cloudAccountReady` remains false in the product shell; no cloud library access is exposed yet.
- Plan API endpoints use the `TAAMEN_DB` binding name, but Wrangler does not define it until actual separate Preview and Production IDs are created and reviewed.
- Existing KV Push, AI binding, AI quota Durable Object, AI model and quotas were not changed.

## Required local verification on Windows

From a fresh extraction of the V17 archive:

```powershell
node -v
npm -v
npm ci
npm run typecheck
npm run test:frontend
npm run test:backend
npm run test:worker
npm run qa:final
npm run build:production
npm run preview
```

Do not treat the package as build-certified until `npm ci`, full TypeScript, and Production build pass on the user's Windows environment.

## Operator steps deliberately deferred

1. Create separate Preview and Production D1 databases in the authorized Cloudflare account.
2. Insert their real IDs as separate `TAAMEN_DB` bindings.
3. Review and apply migration to local/Preview only as a separate approved operation.
4. Implement verified HttpOnly account sessions in V19 before connecting the cloud repository to an authenticated Cloud Account state.
5. Keep Guest and Local Profile outside the cloud library.

See `docs/cloud/V17_D1_SETUP_AR.md`.
