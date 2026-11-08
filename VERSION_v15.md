# TAAMEN 2.0 — V15

**Milestone:** Tactical Plan Library Foundation + V15 Remaster UI and Packaging  
**Base:** V14 Tactical Plan Engine  
**Application package version:** `2.0.0` (unchanged)

## Summary

V15 prepares the cloud-only tactical-plan library on top of Tactical Plan Schema v1 and refines its interaction model. The full library panel is collapsed by default. Saved plan rows are also collapsed by default and reveal a mini pitch preview and actions only when expanded.

## Interaction model

- The outer Plan Library section opens and closes with an accessible disclosure button.
- 5v5 and 7v7 remain independent libraries, each limited to five plans. The expanded view always shows all five positions for the selected format.
- A collapsed saved-plan row shows its slot number, saved plan name and an expansion indicator. Empty positions remain visible as numbered empty slots.
- An expanded plan shows its miniature pitch, formation, updated date, Replace draft, Rename and Delete actions.
- Only one plan is expanded at a time. Collapsing the outer library also closes the current plan and any rename editor.
- Replace draft uses the TacticalBoard guarded load callback. The board confirms replacement of existing work where applicable, persists the replacement before changing the visible state, and clears undo/redo history when crossing formats.
- Rename validates the title and verifies that the repository response preserves plan identity, format and creation time.
- Delete requires confirmation and deletes only the library record; it does not delete the current local draft.
- A prominent (+) action adds the current board document using its current title when an authenticated cloud repository is available. The server must enforce the limit atomically.
- Empty positions are shown as compact numbered slots, not large blank cards.

## Product boundary

- Guest: read-only board/library preview.
- Local Profile: current per-format working draft remains local; no permanent library items are written to IndexedDB.
- Cloud Account: intended future support for five persistent plans per format. Authentication, D1, Worker endpoints and the production repository adapter are not included in V15.
- `cloudAccountReady` remains false by default. The UI shows the five positions and an add action, but permanent saves remain unavailable until a real authenticated repository is provided.

## Safety and compatibility

- No runtime dependency added.
- No IndexedDB schema or database version change.
- No Cloudflare Worker, Wrangler binding, D1 migration or authentication change.
- No existing tactical draft or drawing is deleted or migrated by this refinement.
- The mini preview uses Schema v1 data and mirrors the current board's path geometry, drawing colors, dash patterns and route arrowheads.
- The cloud adapter must enforce the five-per-format limit atomically and scope all operations to the authenticated session, never a client-supplied owner ID.

See `docs/releases/TAAMEN_V15_PLAN_LIBRARY.md` for implementation detail and validation limits.

## V15 Remaster verification

- Tactical schema/library/actions/panel tests: 32/32 passed in the isolated workspace.
- Backend: 27/27 passed.
- Worker: 14/14 passed.
- Privacy QA: PASS.
- Full frontend suite in the isolated workspace: 201 passed; 2 tests could not import `react`/`lucide-react` because `npm ci` timed out.
- CSS and TS/TSX syntax parsing: 15 CSS files and 160 TS/TSX files, zero parse errors.
- Full `npm run typecheck` and `npm run build:production` should be rerun after `npm ci` on the target Windows environment.
- The distributable ZIP intentionally excludes `.wrangler`, `dist`, and `node_modules`; no deployment was performed.
