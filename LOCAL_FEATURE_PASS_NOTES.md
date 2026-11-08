# TAAMEN 2.0 — Local Feature Pass

This pass extends the existing React + TypeScript application. It does not replace the architecture with a standalone HTML/CSS/JS page.

## Changes included

- Updated the home-page developer credit to a compact, non-card footer that links only to Omar's personal page.
- Tightened stadium-directory spacing and responsive card layouts for desktop and mobile.
- Reduced the match-creation dialog's width, vertical spacing, and control sizes while keeping its existing data flow.
- Added a collapsed personal-analytics section to the direct “Add Archived Match” form. It accepts the team the user played for, personal goals, assists, minutes and self-ratings, validating scores and leaving unknown values blank.
- Added a small delete action for locally owned archive records, with a confirmation that explains which analytics will also be removed. Non-local records are not offered this delete action.
- Refined My Analytics with 7/15/30-day filters based on match date, bars/waves mode, separate goals/assists colors, expanded chart details and range controls, result percentages, decimal self-rating averages, one-open-panel-at-a-time behavior, and data-derived suggestions.
- Extended the tactical board with position labels derived from player placement, smooth pointer/touch-following curves, a multi-curve route tool, collapsed formation choices, a selected-player editor, same-team shirt-number uniqueness, and PNG export named from the plan.
- Reworked the assistant into a full workspace with contextual prompts, date lookup that picks the closest available match when the exact date is missing, an animated typing response, and an explicit limited-preview fallback when it cannot classify a request.
- Removed redundant technical commentary about local storage/default appearance from the account hub and tactical board. Language and theme controls remain in Settings; the profile-creation screen no longer displays theme/language switches.

## Verification performed

- Backend tests: **87 passed, 0 failed** (`node --test backend/test/*.test.mjs`).
- Static client privacy checks: **PASS** (`node scripts/qa-final.mjs`). This inspected source and public files only; there was no generated `dist` build to inspect.
- TypeScript/TSX syntax transpilation: **146 files inspected; no syntax diagnostics**. This is not a full type-check.
- Frontend test run: **141 tests passed; 2 could not start** because the incomplete `node_modules` tree lacked `react` and `lucide-react`.
- A production build and full TypeScript type-check could not be completed. `npm ci` could not fetch dependencies because the npm registry lookup failed (`EAI_AGAIN`). Run `npm ci`, `npm run build`, `npm run test:frontend`, and `npm run qa:final` again in a network-connected environment before merging.

## Security blockers remain outside this UI-focused pass

Security follow-up in this revision: the private historical archive is excluded from the source package, is ignored by Git, and must be supplied through an explicit protected local path for intentional migration. Featured recognition now uses a Worker secret map and stores SHA-256 credential hashes instead of plaintext codes. Previously exposed recognition codes must be considered revoked and rotated; this source change cannot erase old Git history or invalidate credentials stored in external systems until the operator updates them.

The lockfile also remains on `vite@8.2.2`. Official advisories list Vite `8.2.0` through `8.2.3` as affected and `8.2.4` as the patched release on the 8.2 line. Upgrade the dependency and regenerate the lockfile in a connected environment, then re-run the build and audit. References:

- https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22
- https://github.com/vitejs/vite/security/advisories/GHSA-vfpm-58rq-9qcg
