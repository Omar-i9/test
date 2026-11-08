# TAAMEN V15 Remaster — QA Record

## Changes covered

- Replaced the locked-only content area with an always-visible five-slot library layout for the selected format.
- Added the current-tactic (+) action.
- Kept authenticated cloud repository as a hard requirement for persistent library writes.
- Kept local IndexedDB limited to the current working draft.
- Preserved saved-entry collapse/expand, mini preview, replace draft, rename and delete behavior.
- Excluded Wrangler local state and generated output from the release archive.

## Results in the isolated build container

| Check | Result |
|---|---:|
| Tactical schema + library + actions + panel | 32/32 passed |
| Backend | 27/27 passed |
| Cloudflare Worker | 14/14 passed |
| QA privacy invariants | PASS |
| CSS parser | 15 files / 0 syntax errors |
| TypeScript/TSX parser | 160 files / 0 parse errors |
| Frontend full test command | 201 passed / 2 failed to load |

The two frontend test files could not import `lucide-react` and `react` because dependency installation (`npm ci`) timed out in this isolated container. The failures were module-not-found errors before assertions ran. Full `tsc -b` and `build:production` must be run on the user's Windows machine after `npm ci`.

## Cloud library status

The V15 app entry point does not currently provide `cloudAccountReady` or a `TacticalPlanLibraryRepository`. Thus no saved remote plans can be fetched in this build. The Remaster exposes the five slots and add action in the UI, but correctly refuses to create a fake local or anonymous cloud library. Real save/list/rename/delete requires the authenticated account + server-side repository phase.

## ZIP packaging validation

The deliverable ZIP excludes `.wrangler`, `dist`, `node_modules`, `.git`, real `.env`/`.dev.vars` files and SQLite runtime files. ZIP integrity is checked after creation.
