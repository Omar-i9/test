# TAAMEN V17 — Hotfix 01 QA Report

**Base:** `TAAMEN_2_0_V17_Cloud_Storage_Foundation`
**Scope:** TypeScript test-helper correction only; no product behavior, API contract, database migration, Cloudflare binding, or package dependency changed.
**Product package version:** `2.0.0` (unchanged)
**Deployment:** Not deployed.

## Issue reported from Windows

`npm run typecheck` and `npm run build:production` stopped at:

```text
src/services/tacticalPlanLibraryActions.test.ts:58:22
TS2345: Argument of type 'number | undefined' is not assignable to parameter of type 'number'.
```

The in-memory `MemoryPlanRepository.create()` test helper passed a value that could be `undefined` into `Set<number>.has()` before narrowing it. This is a test-only TypeScript defect, not a production repository or Worker defect.

## Fix

The helper now:

1. Throws `capacity reached` when no free slot exists (`slotNumber === undefined`).
2. Validates that the selected slot is an integer from 1 to 5.
3. Checks occupancy only after TypeScript and runtime narrowing.

No `any`, non-null assertion, compiler suppression, dependency change, or production-code workaround was used.

## Windows verification interpretation

The user's V17 run reported:

- `npm ci`: completed; 79 packages installed.
- Frontend: 244/244 passed.
- Backend: 27/27 passed.
- Worker: 43/43 passed.
- `qa:final`: PASS; 167 source files and 34 public files inspected.
- Typecheck: blocked by the single test-helper type error above.
- Production build: stopped at the same typecheck error; Vite build phase did not run.
- Preview: attempted before a successful production build had generated the Cloudflare Vite plugin's `.wrangler/deploy/config.json`; this missing generated artifact is downstream of the failed build.

The `preview` command must be retried only after `npm run build:production` completes successfully. Do not create `.wrangler/deploy/config.json` manually.

## Security note

`npm ci` reported six high-severity advisories. Do not run `npm audit fix` blindly as part of this hotfix. First capture `npm audit` output and review the affected direct/transitive packages and available compatible fixes; dependency remediation should be a separate, tested change with lockfile review.

## Required Windows verification

From a fresh extraction of this Hotfix 01 archive:

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

Expected first result: the reported TS2345 error is gone. Any additional compiler errors, if present, must be handled individually rather than suppressed.

Do not configure a remote D1 database, run remote migrations, or deploy this hotfix as part of local verification.
