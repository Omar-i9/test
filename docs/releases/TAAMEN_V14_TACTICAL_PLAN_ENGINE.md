# TAAMEN V14 — Tactical Plan Engine

## Scope

V14 is delivered as an overlay patch for the V13 working project. The application package version remains `2.0.0`; V14 is a project milestone label only.

## Changed files

- `src/domain/tactics/tacticalPlanSchema.ts` — new canonical schema, conversion, validation, legacy migration and restore functions.
- `src/domain/tactics/tacticalPlanSchema.test.ts` — new round-trip, validation, size and migration tests.
- `src/pages/TacticalBoard.tsx` — board persistence/export/import now uses Schema v1; legacy IndexedDB records are converted safely; unreadable records are backed up before replacement; imports ask before replacing an existing plan.
- `docs/engineering/TACTICAL_PLAN_ENGINE_V1_AR.md` — detailed Arabic engineering specification.
- `docs/examples/taamen-tactical-plan-v1.example.json` — example document.

## Compatibility guarantees

- Existing IndexedDB database and object-store versions are unchanged.
- Existing active record IDs remain `plan-v3-5v5` and `plan-v3-7v7`.
- Old shared keys are not deleted.
- No Cloudflare Worker, Wrangler binding, D1 migration, AI prompt, authentication, or account code is changed.
- No runtime dependency was added.
- The board UI, drawing tools, SVG size, colors and interaction model are unchanged.

## Validation results in the isolated build workspace

- Tactical schema unit tests: 10/10 passed.
- Tactical schema strict TypeScript check: passed.
- TacticalBoard TSX strict check with temporary React/Lucide declarations: passed. This is a targeted component type check, not the full project typecheck.
- Backend tests: 27/27 passed.
- Worker tests: 14/14 passed.
- Privacy QA: PASS; 151 source files and 34 public files inspected.
- Frontend suite: 178/180 passed. Two test files could not load because the isolated workspace did not include installed `react` and `lucide-react` packages. The test assertions themselves were not reported as failing; both failures were module-resolution errors.
- Full Vite production build was not run in the isolated workspace because project dependencies were not installed there. No claim of a successful post-patch production build is made.

## Apply

Extract the patch over the current V13 working directory that already has the user's Vite 8.2.4 dependency installation. Do not overwrite `package.json`, `package-lock.json`, `.wrangler`, `wrangler.jsonc`, or any deployment secrets; this patch does not contain those files.

Then run:

```powershell
npm run typecheck
npm run test:frontend
npm run test:backend
npm run test:worker
npm run qa:final
npm run build:production
npm run preview
```

Test the tactical board in both formats, especially imports, old stored plans, curved paths and multi-curve routes. Do not deploy until the full checks pass in the user's Windows environment.
