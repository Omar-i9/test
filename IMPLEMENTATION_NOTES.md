# TAAMEN 2.0 — Local-first improvement pass

This update is applied directly to the existing React + TypeScript + Vite application in `v2`. It does not replace the app with the standalone visual prototype and does not change the Cloudflare Worker/KV architecture. AI integration remains intentionally deferred.

## Changes

- Added a bilingual local-access prompt for visitor actions that need persisted personal data. The local profile setup remains local-only and does not require an email address. A public shared-match page stays previewable, but importing a shared match now requires a local profile; setup preserves the share URL and returns to it after saving the profile.
- Passed local-profile state into personal-data pages. Visitors can browse, but the Home and local assistant no longer load a previous local archive without an active local profile; matches, archive, analytics, and tactical write operations remain gated.
- Re-ranked stadium search results using normalized Arabic/English matching, word-prefix and fuzzy similarity scoring; added quick suggestions and retained single-card expansion in a one-column layout.
- Refined Archive behavior: the pending-result disclosure appears only when pending matches exist, starts collapsed, and disappears when resolved; recorded matches are shown directly; details open in a modal; deletion is available only from that modal.
- Added a separate personal-performance editor for a completed match. It changes only the current user's local performance fields and leaves the match result/team score untouched.
- Hardened public match sharing so `personalPerformance` is never included in shared payloads; added a regression test for this boundary.
- Refined tactical formations for 5v5 and 7v7; formation thumbnails show only the pitch and formation label; 7v7 uses a wider presentation and smaller player tokens. Curve and multi-curve drawing were smoothed, and player name/number edits have individual confirmation controls.
- Moved the Analytics match log above self-ratings and recommendations; changed chart details to open a modal; the compact trend view shows separate goal and assist lines for up to seven personal-data matches; added an overall rating average and its sample count.
- Removed the profile banner/cover editing surface and stripped legacy banner data on profile saves and public profile-share decoding. Only the avatar remains shareable as profile imagery.
- Added a topbar home-brand control, local sign-in button for visitors, direct avatar-to-profile navigation for local users, direct return navigation from secondary pages, and collapsed-by-default sidebar behavior.
- Expanded the full-reset list to cover the theme, play-space tab, install prompts, challenge queue and SPA fallback session key, in addition to the existing TAAMEN storage keys.

## Verification in this environment

- `npm run typecheck`: PASS.
- `npm run test:frontend`: PASS, 153 tests.
- `npm run test:backend`: PASS, 88 tests across 5 suites.
- `npm run qa:final`: PASS. The private archive is absent from the source/client tree; the external archive comparison was not run because the private archive is intentionally not included in this clean source package.
- `npm run build`: BLOCKED by the supplied Windows-origin `node_modules`: the Vite executable lacks Unix execute permissions. Running the Vite entry point through Node confirms the Linux Rolldown binding is missing. This is an environment/dependency issue, not a reported TypeScript error, but a clean production build still has not been confirmed.
- Dependencies were not regenerated because the npm registry was unreachable from this environment. In particular, the lockfile still pins Vite 8.2.2; see `SECURITY_REVIEW.md` for the outstanding dependency action before deployment.

## After extracting

Run `npm ci`, then `npm run typecheck`, `npm run test:frontend`, `npm run test:backend`, `npm run build`, and `npm run qa:final`. Upgrade the locked Vite dependency to a patched version and verify the resulting lockfile before installing and building. Do not deploy until the build and final QA pass on the target environment.

## Security and UX follow-up (28 October 2026)

- Reused the existing ProfileSetup screen for direct local sign-in; the account hub/action explainer remains for guarded write actions. The decorative original chime is user-triggered and reduced-motion aware.
- Stabilized the top bar using a consistent LTR flex layout while preserving RTL in its Arabic sign-in control. Added a low-motion stadium detail reveal and distinct tactical route colors with per-tool SVG reveal animation.
- Removed the private historical JSON from the source package and changed all scripts/docs to require an explicit operator-supplied archive path.
- Removed plaintext recognition codes from production source and example data. The Worker now reads `TAAMEN_FEATURED_CODES` from a secret JSON map, accepts only unique codes of at least 24 characters, stores SHA-256 hashes, uses constant-time comparisons, and disables recognition when the secret is missing or invalid.
- **Operator steps required before deployment:** rotate all old recognition codes, set `TAAMEN_FEATURED_CODES` as a Cloudflare Worker secret for production (and local `.dev.vars` for preview), review existing KV `data` so old plaintext `memberCode` values are replaced, and consider removing old exposed archive/code material from Git history. This ZIP cannot modify Cloudflare secrets or remote Git history.
- `npm run typecheck`, frontend/backend tests and the privacy gate must be run on the final source package before deployment. `npm run build` should be verified after reinstalling platform-correct dependencies.

## Navigation, tactical arrows and analytics follow-up (30 October 2026)

- Fixed the account/settings layout at the shell level: desktop secondary pages no longer hide the sidebar, and mobile secondary pages no longer hide the five-item bottom navigation. Removed the account-section content-margin reset that caused the main column to use a different offset from the sidebar's collapsed/expanded width.
- Kept the topbar in one physical LTR flex layout in both Arabic and English, with the brand on the physical left and action controls on the physical right. Arabic controls retain RTL text direction. Added regression tests for the account/settings shell and topbar alignment.
- Restored the tactical drawing grammar per tool: pass (solid white filled arrowhead), run (gold dashed open chevron), press (pink dotted line with a double-chevron head), curve (violet smooth single-bend route), and multi-curve (cyan dashed smoothed route with its own head). Removed normalized `pathLength` from dashed routes; normalization remains only where a full-path reveal needs it. The draft preview normalizes only pass/curve so the live pointer preview stays continuous.
- Added individual route reveal animations, with the press pulse and the other route styles using their own timings and effects. Increased the new-route animation lifetime to 900ms so the 760ms press animation can complete before its reveal state is cleared. Added a small formation-discovery hint on the pitch that opens and scrolls to the existing formation panel.
- Made the smooth goal/assist trend chart the default analytics visualization. Its width scales to the number of matches shown within a seven-match frame; goals use the brand lime and assists use violet in both trend and bar modes. Hover/focus/tap can replay the chart reveal, and reduced-motion preferences disable the animation.
- Added a safe, minimal `.env.example` containing only the same-origin API default and explicit guidance not to put secrets into `VITE_*` variables.

### Follow-up verification

- `npm test`: PASS — QA/privacy gate PASS, backend 88/88, frontend 161/161.
- TypeScript project checks: PASS separately for `tsconfig.app.json`, `tsconfig.test.json`, and `tsconfig.node.json` using the environment's global TypeScript 5.8.3 compiler. The lockfile's TypeScript 7 native runner was not available for this Linux environment.
- `npm run build`: NOT VERIFIED. The supplied archive's dependencies were installed for Windows and include only the Windows Rolldown native binding; the Linux binding is absent. The npm `vite` shim is also absent. Run a clean `npm ci` from this package on the deployment environment, then `npm run build` and `npm run qa:final` before deploying.
- No Cloudflare Worker settings, secrets, KV data, or AI integration were changed in this follow-up.
