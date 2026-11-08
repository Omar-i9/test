# TAAMEN V19 — UX & Cloud Authentication Hotfix 01 QA

**Date:** 6 November 2026  
**Base:** V19 Merged Full Product Experience Candidate  
**Product version:** `2.0.0` unchanged  
**Status:** Preview Candidate — not production certified  
**Deployment:** Not performed  
**Cloudflare / Production:** no remote Worker, secret, route, D1, KV or production setting was changed  
**Migrations:** `0003_verified_cloud_accounts.sql` and `0004_account_provider_linking.sql` included, neither applied remotely

## 1. Final executed results

| Check | Result | Detail |
|---|---:|---|
| Worker tests | PASS — 74/74 | Cloud Auth, provider linking/unlinking, Google OAuth callbacks, sync, AI, D1 SQLite tests |
| Backend tests | PASS — 27/27 | Backend API/security suite |
| Focused UX tests | PASS — 24/24 | Account help, user guide, tour entry, acquisition removal/redirect, language menu and profile provider state |
| Focused Cloud Auth | PASS — 12/12 | `worker/cloudAuth.test.mjs` |
| Full Frontend | PARTIAL — 265/267 | Two test files cannot load React/Lucide packages; no assertions execute in those files |
| Privacy QA | PASS | 174 source files, 9 public files, 0 build files inspected |
| TypeScript parser | PASS — syntax only | 174 `.ts`/`.tsx` files parsed by TypeScript 5.8.3; zero parse diagnostics |
| Worker JavaScript syntax | PASS | `worker/cloudAuth.js`, `worker/index.js`, `scripts/qa-final.mjs` pass `node --check` |
| `npm ci` | BLOCKED | npm registry request failed with `EAI_AGAIN`; npm exited with `Exit handler never called!` and left incomplete `node_modules` |
| `npm run typecheck` | BLOCKED | TS2688 for missing `node`, `react`, `react-dom` type definitions |
| `npm run build:production` | BLOCKED | Stops at `tsc -b` for the same missing definitions; Vite stage did not run |
| Browser / Playwright E2E | NOT RUN | No complete dependency tree or production build available |
| Live Google / EmailJS / KV / Cloudflare AI | NOT RUN | Preview credentials and isolated service resources unavailable |

### Full Frontend module-load blockers

- `src/config/routes.test.ts`: `ERR_MODULE_NOT_FOUND` for `lucide-react`.
- `src/domain/matches/mobileProduct.test.ts`: `ERR_MODULE_NOT_FOUND` for `react`.

These are dependency installation/load failures, not failing assertions. The full Frontend suite therefore remains partial.

## 2. Acquisition deletion audit

Compared with the V19 Full Product Experience baseline, 36 acquisition-specific files/assets were removed, including `src/pages/Acquisition.tsx`, SideProjectors badge/configuration, acquisition config/translations, dedicated tests, `docs/acquisition/flippa-listing.md`, and the complete `public/acquisition-assets/` folder.

The only runtime reference retained is a path guard in `src/App.tsx`: direct navigation to the retired `/acquisition` URL is redirected to `/#home`. Other textual references are negative regression tests that assert the route cannot display a page. The page is not registered in routing, the sitemap, sidebar or mobile navigation.

## 3. Cloud authentication tests and boundaries

- Email OTP sign-in/verification is covered with Worker tests and a simulated EmailJS provider response; real email delivery was not tested.
- Email identity linking is session-bound, CSRF-protected, bound to the current `user_id`, one-time, and rejects email identities owned by another account.
- Google linking is tested with a mocked OAuth token/userinfo exchange; it uses PKCE, one-time state and browser binding, keeps the initiating cloud session, and rejects provider ownership conflicts.
- OAuth consent cancellation returns to Profile with an error state while retaining the existing session.
- Unlinking cannot remove the primary email identity or the last remaining login provider.
- Migration 0004 is applied in the isolated in-memory SQLite test setup after migrations 0001–0003; existing V17 tactical plans and V18 sync rows are checked for preservation. Remote D1 was not modified.
- Match/archive sync remains disabled until V20.

## 4. Mobile tour and visual verification

The tour retains its actual route and `data-tour` targets. CSS and viewport handling support safe-area-aware mobile bottom-sheet placement, bottom-nav clearance, landscape sizing, visual viewport resizing/scrolling and reduced motion.

Visual browser/device testing did not run. Responsive test files contain viewport scenarios (including 360×800, 390×844, 430×932, 375, 430, 768, 1024 and 1440 widths), but none are marked as passed in this report.

## 5. Required operator handoff

1. Copy the exact Windows-tested V18 `package-lock.json` after `npm audit fix` into the new V19 Hotfix directory, then run `npm ci` and `npm audit`. Do not blindly run `npm audit fix` again.
2. Run typecheck, full Frontend/Backend/Worker tests, `qa:final`, production build and preview on the Windows machine.
3. Create a separate Preview Worker with a distinct name/domain and dedicated KV binding before using `wrangler secret put`, running remote KV tests or testing real AI.
4. Add EmailJS Preview variables `EMAILJS_SERVICE_ID`, `EMAILJS_AUTH_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`, `EMAILJS_ORIGIN`; add `AUTH_PEPPER` (32+ random bytes) as a Secret; add `EMAILJS_PRIVATE_KEY` only if the EmailJS account requires it.
5. Add Google Preview configuration `GOOGLE_CLIENT_ID`, `GOOGLE_REDIRECT_URI` and Secret `GOOGLE_CLIENT_SECRET`.
6. After local gates and Preview isolation pass, check that only migrations 0003 and 0004 remain pending on `taamen-plans-preview`; apply them in order once. Do not reapply 0001 or 0002.

The current `wrangler.jsonc` uses `taamenn` at the root and in `env.production`; it must not be used to set Preview secrets or run a deploy. Do not attach `taamenn.com` to the Preview Worker.
