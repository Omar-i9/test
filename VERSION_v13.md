# TAAMEN 2.0 — V13 handoff

V13 is a pre-release refinement of the validated V12 Cloudflare Preview baseline. The version label is for source handoff only; the application/package version remains `2.0.0`.

## Included

- Removed the temporary `TAAMEN CHALLENGE #01` feature from Home, its `/trophy` page, public sitemap, client services, deep-link registration, Node API routes, and challenge runtime implementation.
- Legacy direct visits to `/trophy` are redirected to Home, and the old browser-local challenge queue is cleared during app startup. The historical D1 migration is moved outside the active migration directory into the archive; V13 does not drop existing remote tables or data.
- Replaced the Home campaign card with a bilingual TAAMEN AI card, a subtle warm-yellow glow, a `BETA` label, and a direct route to the assistant.
- Renamed the assistant identity to `TAAMEN AI` throughout navigation, page identity, and the usage guide; the assistant page displays the BETA marker.
- Strengthened Arabic and English system instructions for accurate football-tactical analysis, including 4-3-3, 4-2-3-1, double-pivot cover, counter-pressing, defensive recovery, and the distinction between 11v11 and 5v5/7v7. The prompt now distinguishes full aggregate totals from the maximum eight recent match examples, and explicitly requires sample sizes for averages and rates. The Worker independently clamps recent-match context to eight records.
- Changed the actual GPT-OSS 120B inference parameter from `reasoning_effort: medium` to `low`; the response metadata and worker tests now assert `low`. Per-installation and site-wide request limits are unchanged.
- Reduced route-transition travel/duration and navigation-icon animation timing; the app continues to respect both OS reduced-motion preference and the saved TAAMEN motion setting.
- Added a transparent, tightly cropped top-bar logo asset. The top-bar now renders the mark without a visible tile, frame, border, or shadow; the original supplied logo remains unchanged for other brand placements.
- Bumped the Service Worker cache version and precached the new top-bar mark.

## Not changed

- Cloudflare Worker name, AI and quota bindings, Durable Object class/migration, KV namespace, quotas, consent requirements, local-first storage, conversation persistence, routing outside the retired `/trophy` entry, and existing business logic.
- No deployment or Cloudflare account changes were performed.
- Historical audit reports are retained for traceability. The old Challenge #01 SQL schema is moved out of the active backend migration directory into `docs/archive/retired-challenge/`; it is retained only as an archival record, not as a V13 migration.

## Validation status

Validation completed against the source tree:

- Static privacy / configuration QA: PASS (149 source files and 34 public files inspected; `dist/` was absent and therefore not inspected).
- Backend tests: PASS, 27/27.
- Worker tests: PASS, 14/14, including GPT-OSS `reasoning_effort: low`, Arabic and English tactical prompt rules, quota limits, and the server-side eight-match context clamp.
- Frontend tests: 168/170 passed. Two test files could not start because `node_modules` is absent (`lucide-react` for `src/config/routes.test.ts` and `react` for `src/domain/matches/mobileProduct.test.ts`). The remaining 168 frontend tests passed.
- TypeScript/TSX parser check: PASS, 149 files with no syntax parse errors.
- CSS parser check: PASS, 14 stylesheets with no syntax parse errors.

A full dependency-backed TypeScript typecheck, Vite production build, browser interaction test, and Cloudflare V13 Preview inference test could not be run here because project dependencies are not installed. The V12 Preview success recorded by the project owner is not a substitute for retesting this changed V13 bundle.

**Important dependency pin:** the supplied V12 archive still records Vite 8.2.2 in `package.json` and `package-lock.json`. An attempt to update the lockfile to Vite 8.2.4 in this environment timed out while contacting the npm registry, so neither file was modified or fabricated. On the development machine, run `npm install vite@8.2.4 --save-exact`, then `npm ci`, and run `npm run qa:final`, `npm run test:backend`, `npm run test:worker`, `npm run test:frontend`, `npm run typecheck`, and `npm run build:production`. Then launch Cloudflare Preview and repeat a real AI request. Do not deploy until those checks pass.
