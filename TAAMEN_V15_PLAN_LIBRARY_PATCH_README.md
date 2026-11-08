# TAAMEN V15 — Tactical Plan Library UI Refinement

This is a source overlay for a working project that already has the V14 Tactical Plan Engine and the original V15 Tactical Plan Library patch applied. It refines the V15 library experience and adds testable repository actions. It is not a complete project ZIP.

## What changed in this refinement

- The whole Plan Library panel is collapsed by default. Its heading is a keyboard-accessible disclosure button.
- When expanded, the user can switch between independent 5v5 and 7v7 libraries.
- Each saved plan row is collapsed by default and shows only its saved title plus an expand chevron.
- Expanding one plan reveals a miniature pitch preview, formation, update date, and actions.
- The preview shows player tokens, zones, route geometry, route-specific dash patterns, and arrowheads.
- The primary action is **Replace draft**. The board callback asks for confirmation when existing work would be replaced, persists the new draft before changing visible board state, and clears incompatible undo/redo history when the format changes.
- Rename and delete actions appear only inside the expanded plan. Rename validates 1–70 characters and confirms through the repository. Delete asks for confirmation and removes only the cloud-library record, not the local working draft.
- Only one saved plan can be expanded at a time. Closing the whole library collapses the open plan and closes any rename editor.
- The UI always shows five compact numbered positions per selected format. Saved rows show their title; empty positions remain visible as small dashed rows.
- A (+) Add current tactic action saves the current board document under its existing title when an authenticated repository is connected.
- Miniature multi-curve routes use the same smoothing geometry as the board renderer.
- Repository actions are extracted into a small service module and covered with in-memory repository tests.

## Important product boundary

Authenticated cloud accounts and the real cloud repository are still not implemented in this release. `cloudAccountReady` remains false by default and the application does not pass a repository. Therefore the five slots and (+) action are visible, but the action explains that permanent saving requires an authenticated cloud account. The saved entries cannot appear until a real repository supplies them. The CRUD controls become available only when a real authenticated repository is supplied. Do not add IndexedDB/localStorage persistence for the permanent five-plan library; the local profile remains limited to its current draft.

The tests use an in-memory repository to prove the UI action service contract; they do not claim that cloud persistence is already deployed.

## Safe application

1. Make a backup of the working V15 project folder.
2. Extract this ZIP into the project root and allow the listed files to be added/replaced.
3. Do not replace `package.json` or `package-lock.json`; no dependency was added.
4. Do not change `.wrangler`, `wrangler.jsonc`, Cloudflare bindings, secrets, IndexedDB schema, or the V14 board-draft store.

## Included files

- `src/components/tactical/TacticalPlanLibraryPanel.tsx`
- `src/components/tactical/TacticalPlanLibraryPanel.test.ts`
- `src/components/tactical/TacticalPlanMiniPreview.tsx`
- `src/styles/tactical-plan-library.css`
- `src/services/tacticalPlanLibraryActions.ts`
- `src/services/tacticalPlanLibraryActions.test.ts`
- `docs/releases/TAAMEN_V15_PLAN_LIBRARY.md`
- `TAAMEN_V15_PLAN_LIBRARY_PATCH_README.md`
- `VERSION_v15.md`

## Local verification

```powershell
npm run typecheck
npm run test:frontend
npm run test:backend
npm run test:worker
npm run qa:final
npm run build:production
npm run preview
```

For the targeted library tests:

```powershell
node --test --experimental-strip-types src/domain/tactics/tacticalPlanSchema.test.ts src/domain/tactics/tacticalPlanLibrary.test.ts src/services/tacticalPlanLibraryActions.test.ts src/components/tactical/TacticalPlanLibraryPanel.test.ts
```

Verify Arabic and English on desktop and mobile. Test outer collapse, plan-row expansion, replacement confirmation, rename validation, delete confirmation, five-plan capacity, and the independent 5v5/7v7 switch. The live cloud CRUD controls cannot be end-to-end tested until the account and authenticated API are implemented.

## V15 Remaster packaging

The full source archive excludes `.wrangler/`, `dist/`, `node_modules/`, `.git/`, SQLite runtime files, and real environment files. The `.wrangler` folder is local Cloudflare state and must not be included in a distributable ZIP, especially while Preview is running.
