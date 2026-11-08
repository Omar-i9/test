# TAAMEN V15 Remaster — Release Notes

## Scope

V15 Remaster stabilizes the tactical plan library presentation and release packaging. It does not implement cloud authentication or the D1-backed repository.

## Tactical library UX

- The library section remains collapsed by default.
- The expanded section always shows the 5v5 / 7v7 selector, saved/maximum count, one visible add-current-plan (+) action, and five slot positions for the selected format.
- Existing remote entries are rendered by saved title only while collapsed.
- Expanding one entry reveals its plan preview, formation/date metadata, replace-draft, rename, and delete actions.
- Only one saved entry is expanded at a time.
- The add action uses the current board document and its title. It enforces the five-per-format capacity through the domain action and requires the authenticated cloud repository.
- Without an authenticated account/repository, the five slots remain visible and the add action explains why permanent saving is unavailable. No local persistent plan library is created.

## Safety and data behavior

- Loading a saved entry still uses the existing board confirmation and persist-before-display sequence.
- Delete affects only the selected library record and never the local working draft.
- Current local draft persistence remains under the existing `tactical` store.
- No IndexedDB local library, D1 migration, account session, or production Cloudflare binding was added.

## Packaging fix

The clean source archive excludes `.wrangler/`, `dist/`, `node_modules/`, `.git/`, test artifacts, runtime SQLite databases, and real environment files. This avoids ZIP read errors caused by Miniflare/Cloudflare holding SQLite WAL/SHM files open during Preview.

## Validation in the build container

- Tactical schema/library/actions/panel tests: 32/32 passed.
- Backend tests: 27/27 passed.
- Worker tests: 14/14 passed.
- Privacy QA: PASS.
- CSS parser: 15 files, 0 syntax errors.
- TypeScript/TSX parser: 160 files, 0 parse errors.
- Full frontend run: 201 passed; 2 test files could not load because the isolated build container could not complete `npm ci` and therefore lacked `lucide-react` and `react`. These are dependency-loading failures, not assertion failures.
- Full TypeScript typecheck and production build must be rerun after `npm ci` in the user's Windows environment. This container did not have the full dependencies installed.

## Deployment

No deployment was performed. `package.json` app version remains `2.0.0`.
