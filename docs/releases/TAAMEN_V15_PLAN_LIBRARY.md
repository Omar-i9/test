# TAAMEN V15 — Tactical Plan Library Foundation and Interaction Refinement

## Release scope

V15 builds a cloud-ready Tactical Plan Library interface on top of Tactical Plan Schema v1. This remains a product/UI and domain-contract phase; it does not yet add authentication, a D1 database, Worker endpoints, or production cloud persistence.

## User access policy

- **Guest:** can inspect the board and understand that the library exists, but cannot edit a draft or manage plans.
- **Local Profile:** can continue working with the existing per-format local draft. The library remains locked; no permanent plan-library item is written to IndexedDB.
- **Cloud Account:** intended future capability is five persistent plans per format (five 5v5 and five 7v7). The UI and repository contract are ready to receive an authenticated cloud adapter, but account and API layers are not implemented in this release.

## Interaction and visual behaviour

- The entire Plan Library section is collapsed by default and opens through an accessible disclosure button.
- When open, the user can switch between 5v5 and 7v7; each format has an independent five-plan limit.
- Each saved plan row is collapsed by default. Its collapsed state shows only the saved plan title and a chevron.
- Expanding a row reveals a mini pitch preview, formation, update date, and actions: Replace draft, Rename and Delete.
- Only one plan row can be expanded at a time. Collapsing the outer section closes the expanded row and exits rename mode.
- Five compact numbered slot positions remain visible. Empty positions use a small dashed row rather than a large blank card.
- The mini preview renders the full Schema v1 player positions, drawing categories, zones, curved and multi-curved geometry, route-specific dash styles and arrowheads.

## Action behaviour

- **Add current tactic (+):** uses the current board document and its current title (or a generated fallback), checks the local view of capacity, then calls the authenticated repository. The server must repeat the five-per-format limit atomically. The complete canonical document is saved, not just formation and player names. Without an authenticated cloud account/repository, the button explains that permanent library saving is unavailable; no local plan-library record is written.
- **Replace draft:** uses the board's existing guarded callback. When an existing target draft would be replaced, the board asks for confirmation. It writes the replacement to IndexedDB before changing the visible board, and clears incompatible undo/redo history if the plan changes 5v5/7v7 format. Cancelling leaves the current draft visible and unchanged.
- **Rename:** validates 1–70 characters, invokes the repository, and verifies that the response preserves the plan ID, game format and creation timestamp. Player and drawing data remain part of the canonical document.
- **Delete:** requires explicit browser confirmation and invokes repository deletion for the selected ID and format. It removes the library record only; the local working draft is not deleted.
- **Concurrency:** save, load, rename and delete controls are disabled while another library operation is in progress.
- **Errors:** failed repository actions leave the local working draft unchanged and surface a status message.

## Data and privacy guarantees

- Library records contain the complete Tactical Plan Schema v1 document.
- The library has no IndexedDB/localStorage persistence implementation.
- Existing V14 local draft persistence remains responsible for work-in-progress recovery only.
- `cloudAccountReady` defaults to `false`; the current application does not pass a real authenticated repository.
- No local plan data is silently moved, deleted or uploaded.
- In-memory repository tests verify the CRUD action contract. They do not claim that cloud persistence is deployed or live.

## Changed files in this refinement

- `src/components/tactical/TacticalPlanLibraryPanel.tsx` — collapsible outer library, title-only collapsed rows, expanded preview and action controls.
- `src/components/tactical/TacticalPlanLibraryPanel.test.ts` — disclosure, card-collapse and action-wiring contract checks.
- `src/components/tactical/TacticalPlanMiniPreview.tsx` — SVG mini preview with route arrowheads and renderer-matching smoothed multi-curves.
- `src/styles/tactical-plan-library.css` — responsive accordion/card layout and reduced-motion handling.
- `src/services/tacticalPlanLibraryActions.ts` — validated save, rename, delete and open actions around the repository contract.
- `src/services/tacticalPlanLibraryActions.test.ts` — in-memory repository behaviour tests.

## Validation in the isolated workspace

- Tactical Schema + Library + action + panel-contract targeted tests: **32/32 passed**.
- Backend tests: **27/27 passed**.
- Worker tests: **14/14 passed**.
- Privacy QA: **PASS**; 160 source files and 34 public files inspected.
- Full frontend test invocation: **201 passed, 2 failed at module resolution** because the isolated workspace lacks installed `react` and `lucide-react` packages. The two failures are not assertion failures; they originate from those unavailable packages.
- TypeScript parser pass: 160 TS/TSX source files, 0 parse errors.
- A strict isolated TypeScript run using the workspace's global TypeScript 5.8.3 stopped in pre-existing V14 `tacticalPlanSchema.ts` narrowing around `item.points.length`; the project itself pins TypeScript 7.0.2. The actual project `npm run typecheck` could not be run here because dependencies were not installed.
- CSS parser pass: 15 CSS files, 0 syntax errors. The full Vite production build was unavailable because dependencies were not installed in this workspace.
- `npm ci --ignore-scripts --no-audit --no-fund` timed out in the isolated workspace. No package files or lockfiles were changed.

## Required local verification

Run in the working V15 project directory after applying the patch:

```powershell
npm run typecheck
npm run test:frontend
npm run test:backend
npm run test:worker
npm run qa:final
npm run build:production
npm run preview
```

Targeted tests can be run separately:

```powershell
node --test --experimental-strip-types src/domain/tactics/tacticalPlanSchema.test.ts src/domain/tactics/tacticalPlanLibrary.test.ts src/services/tacticalPlanLibraryActions.test.ts src/components/tactical/TacticalPlanLibraryPanel.test.ts
```

Then inspect Arabic/English and desktop/mobile views. Until the real account and cloud adapter exist, the library remains locked by design; do not describe it as live cloud saving.
