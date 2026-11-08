# TAAMEN 2.0 — V17 Cloud Storage Foundation

**Base:** TAAMEN V16 Hotfix 03  
**Application/package version:** 2.0.0 (unchanged)  
**Release label:** V17  
**Deployment:** not deployed  
**D1 provisioning:** not performed  
**Account authentication:** intentionally deferred to V19

## Release purpose

V17 adds the source-level cloud storage foundation for the existing Tactical Plan Schema v1 and V15 plan-library contract. It does not claim that Cloud Accounts, D1 production persistence, or user-facing cloud library access are live.

## Implemented

- Added `migrations/0001_create_tactical_plan_library.sql` with the future account identity anchor and the account-owned `tactical_plans` table.
- Enforced `5v5` / `7v7`, slot number 1–5, title length, schema version 1, JSON validity, indexed JSON identity/format/title consistency, UTF-8 payload maximum 256 KiB, foreign-key ownership, revision ≥1, and unique active `(user_id, format, slot_number)` slots. D1's built-in foreign-key enforcement is used; no `PRAGMA foreign_keys` toggle is issued by the migration.
- Soft deletion retains a tombstone and releases the active slot for reuse.
- Added `/api/plans` Worker endpoints: list by format, create, get by ID, update document, rename, and revision-checked soft delete.
- Ownership is always derived from the injected server-side session resolver. The request body does not accept owner fields.
- Added `worker/planIdentity.js` as a fail-closed integration seam. It returns no user until V19 implements verified sessions.
- Dispatched plan API routes before the existing push/KV backend bootstrap so the future D1 API does not depend on the Push KV runtime.
- Added the `CloudTacticalPlanLibraryRepository` client adapter with strict response parsing, duplicate-slot checks, stable slot ordering, and preflight 256 KiB plan-size enforcement. The adapter is instantiated and passed through both direct and nested Tactical Board entry points; the account-ready flag remains false so this adds no network activity or access before authentication exists.
- Extended the repository contract with `get`, `update`, expected revisions, stable server slots and monotonically increasing revisions.
- Updated plan cards to render server-assigned stable slots, so deleting slot 1 does not visually relabel slot 2 as slot 1.
- Added explicit save-to-empty-slot actions; the server can reserve a user-selected empty slot and returns `409 slot_occupied` if another request claims it first.
- Added a distinct replace-saved-plan action with explicit confirmation. It preserves the plan ID and slot, replaces the canonical draft document, and increments the revision; this is separate from “Replace draft,” which loads a saved plan into the working board.
- Bumped the Service Worker cache namespace to V17 so installed clients fetch the updated shell.

## Security boundaries

- No local profile ID, email field, install ID, or client-submitted `userId` is accepted as proof of ownership.
- The default production resolver returns `null` until verified session support exists. Requests therefore receive `401 not_authenticated` rather than receiving anonymous cloud access.
- `TAAMEN_DB` is intentionally not bound yet. No fake database ID was added to `wrangler.jsonc`.
- No D1 database was created, no remote migration was applied, no secrets were changed, and no Worker/domain was deployed.
- The current UI still defaults `cloudAccountReady` to `false`; the cloud library remains locked for Guest and Local Profile.

## API contract

| Method | Route | Behavior |
|---|---|---|
| GET | `/api/plans?format=5v5` | List at most five active plans in slot order |
| POST | `/api/plans` | Create in the first available slot or a requested empty slot 1–5; server assigns ID, timestamps and revision 1 |
| GET | `/api/plans/:id` | Return only a plan owned by the authenticated session |
| PUT | `/api/plans/:id` | Replace canonical document only when `expectedRevision` matches |
| PATCH | `/api/plans/:id` | Rename while preserving ID, format, creation time and slot |
| DELETE | `/api/plans/:id` | Revision-checked soft delete and slot release |

Mutation bodies use same-origin credentials, `Content-Type: application/json`, and `X-TAAMEN-Requested: 1`. Every query is parameterized. Cross-account reads return not found; stale writes return `409 revision_conflict`; an occupied selected slot returns `409 slot_occupied`.

## Verification performed

- Complete Worker suite: 43/43 pass, including 6 migration tests and the SQLite-backed API lifecycle integration test.
- SQLite migration tests: 6/6 pass, including exact first-free-slot `INSERT ... SELECT ... RETURNING` SQL, FK ownership, 5-slot index, tombstone reuse, JSON/size constraints, and compare-and-swap revisions. The local SQLite harness explicitly enables FK enforcement to emulate D1's documented default.
- Tactical library domain, actions, API client, cloud adapter, app wiring and panel contract tests: 45/45 pass, including selected-slot saves and replace-saved confirmation.
- ZIP/source integrity checks and final project QA are recorded in `TAAMEN_V17_QA_REPORT.md`.
- Full Frontend suite: **236/238 pass**; two test files cannot start because this isolated environment lacks `lucide-react` and `react` after `npm ci` timed out.
- TS/TSX syntax transpilation: **14/14 pass** using the globally available TypeScript 5.8.3 parser; this is not a substitute for the project's pinned TypeScript 7.0.2 typecheck.
- The isolated `npm ci` exceeded its execution window and left partial dependencies. Full `npm run typecheck` was attempted but stopped on TS2688 missing `node`, `react` and `react-dom` type definitions. Production build and browser E2E must be completed on the user's Windows environment before calling this package build-certified.

## Remaining external/operator steps

1. Create separate Preview and Production D1 databases from the authorized Cloudflare account.
2. Add the real database IDs as separate `TAAMEN_DB` bindings; no IDs are fabricated in this release.
3. Apply `0001_create_tactical_plan_library.sql` to the local/preview database only after inspecting the migration.
4. V19 must implement verified HttpOnly sessions before any real user can create or read plans.
5. Connect `CloudTacticalPlanLibraryRepository` to the actual account state only after authentication and authorization are complete.

See `docs/cloud/V17_D1_SETUP_AR.md` for exact safe setup instructions.
