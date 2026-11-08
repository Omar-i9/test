# TAAMEN 2.0 — V10 Full Audit & Implementation Report

**Archive label:** V10 only; it does not change the user-facing product version.
**`package.json` version:** remains `2.0.0`.
**Baseline:** a separate copy of the delivered V9 source tree.
**Deployment status:** not deployed. No Cloudflare Worker, KV, domain, or production account setting was changed.

## 1. Tactical Board

- Enlarged pass, run, press, curve, and multi-route arrow marker geometry to 20×20 SVG units.
- Set the marker reference point (`refX=18`, `refY=10`) to the route-tip coordinate, so the visible tip terminates at the route endpoint rather than stopping short.
- Centered the focus/fullscreen toolbar at the top using a 50% anchor and horizontal transform. It can wrap on smaller widths, while individual tool/action groups remain centered and accessible.
- Increased the top safe area for the pitch in compact focus layouts.
- Removed the local-editor label and pitch nudge overlay from focus mode. The normal non-fullscreen view retains its editor label.
- Added regression checks for marker geometry and focus-mode layout selectors.

## 2. TAAMEN Assistant

- Removed the visible temporary/permanent conversation split and multi-chat history interface.
- Uses one stable, persistent IndexedDB conversation ID. It saves automatically and survives navigation and browser reloads on the same device.
- Retains no more than the latest 80 messages; each stored message is bounded to 4,000 characters.
- Added a small reset control in the conversation sidebar and a compact mobile equivalent. Reset asks for confirmation, then clears the only thread and starts a fresh one.
- On first V10 load, the most recently active V9 conversation is selected for migration when available. Legacy temporary/session pointers and extra V9 thread records are then removed.
- The assistant remains the existing deterministic local football helper. It is **not** a hosted generative AI model and no remote AI service was added.

## 3. Home shortcuts

- Replaced the separate Archive, Decided matches, and Draws cards with one card that randomly selects one of those three metrics.
- The choice is stored for the browser visit (session storage plus an in-memory fallback), so it does not change when navigating away from Home and returning during that visit.
- The next visit chooses another metric and avoids the immediately previous visit's choice when storage is available.
- Kept Stadiums and added dedicated Tactical Board and Analytics shortcuts. The shortcut grid now has four cards.

## 4. Featured Members retirement and data preservation

- Removed the Featured Member member-login/directory and private historical archive endpoints from the Worker API.
- Added backend regression coverage confirming the retired routes return not-found responses.
- Removed runtime member-feature handling from the active source flow. Challenge #01 remains separate and was not removed.
- Backup import rejects private match rows and records marked as legacy or featured, preventing retired records from re-entering the active local match list through a backup.
- Old Cloudflare KV keys named `data` and `sessions`, if present, are no longer read by the Worker. They are **not** deleted automatically. Delete them manually only after separately exporting and verifying any real production data.
- Before removing the feature, exported the source-tree example/local records to separate JSON files. These exports are not a copy of live Cloudflare KV data.

## 5. Notifications, privacy, and PWA reminders

- Refined the Notifications & Privacy settings area and its rows, status messages, and embedded push settings.
- The in-app notification switch controls local notification event creation; disabling it does not consume the idempotency ledger for an event that should still be eligible later.
- The usage-analytics switch persists the setting and calls the existing analytics enable/disable mechanism; it is not a decorative toggle.
- Retained the existing Web Push implementation across the client, service worker, Worker API, KV subscription/job storage, and five-minute Cloudflare Cron trigger.
- Match reminders are scheduled for 30 and 10 minutes before kickoff, subject to the selected reminder preferences.
- The device-level test calls `ServiceWorkerRegistration.showNotification` after permission is granted. A separate remote test sends a push request through the Worker when a subscription is active.
- Background push requires a secure origin, browser/device support, notification permission, a valid push subscription, Cloudflare Worker secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`, the configured KV binding, and an active five-minute Cron trigger. On iOS, the app must be installed to the Home Screen on a supported OS/browser combination.
- A local test notification proves only that this device can display a local notification. It does not prove remote push delivery. A remote test can be acknowledged by the server while final delivery still depends on the browser, OS, network, and push service.
- No VAPID secrets were provisioned, no live push subscription was created, and no real-device background-delivery test was performed in this source-only session.

## 6. Gallery removal

- Removed the in-app Gallery route/feature from the active application navigation and route registry.
- Advanced IndexedDB schema to version 7 and remove the legacy `screenshots` object store as part of the database upgrade.
- Backup import ignores legacy `screenshots` data and never imports it into V10.
- The acquisition page's static product screenshots remain as marketing material; they are not an in-app user Gallery feature.

## 7. Settings layout and usage guide

- Settings grid now aligns cards to the start and uses content-sized rows. Individual settings panels use their own content height rather than stretching to match the longest neighboring panel.
- Reworked the Notifications & Privacy card and its control spacing/readability.
- Removed the in-page Settings usage-guide entry and moved the guide trigger to Account & Control, directly above its three cards.
- Expanded the guide into a bilingual walkthrough with diagrams/visual sequences for the main areas, clearer contrast, and task-oriented descriptions.

## 8. Synthetic match test data

File: `test-data/TAAMEN_V10_Test_Matches_20.json`

- 20 fictional archived matches with varied teams, formats, dates, venues, results, and metadata.
- 15 contain team-level match details and player contribution rows.
- The fixture was run through the V10 backup parser, strict match validation, and backup row collection. All 20 rows were accepted by the normal import validation path.
- The names and scores are synthetic and must not be represented as actual match history.

## 9. Files and migrations of note

- `src/pages/TacticalBoard.tsx`, `src/styles/tactical-v3.css`
- `src/pages/Assistant.tsx`, `src/services/assistantConversations.ts`, `src/styles/assistant.css`
- `src/pages/Home.tsx`, `src/pages/homeShortcuts.test.ts`
- `backend/src/routes.mjs`, `backend/test/retired-features.test.mjs`, `worker/index.js`, `wrangler.jsonc`
- `src/pages/Settings.tsx`, `src/components/PushSettings.tsx`, `src/services/pushClient.ts`, `src/services/pushScheduleClient.ts`
- `src/services/localDb.ts` (IndexedDB version 7 and import filters)
- `src/pages/AccountHub.tsx`, `src/components/HowToGuide.tsx`, guide styles/tests
- `test-data/TAAMEN_V10_Test_Matches_20.json`
- `README.md`, `VERSION_v10.md`

## 10. Checks actually executed

| Check | Result | Notes |
|---|---:|---|
| `npm run qa:final` | PASS | Privacy/static invariants passed; 152 source and 33 public files inspected. No build output was present. |
| Backend test suite | PASS | 30/30 tests passed. |
| Targeted V10 regression suite | PASS | 28/28 tests passed across tactical focus, Home shortcuts, account guide, Assistant persistence, backup import, notifications, reminder scheduling, and service-worker push. |
| Full frontend suite | PARTIAL | 166/168 passed. Two test files could not load because `lucide-react` and `react` are not installed in the clean source runtime; they stopped at module resolution before running their assertions. |
| Synthetic backup import validation | PASS | 20/20 match rows accepted; 15 have team stats and player contributions. |
| Production build / strict TypeScript check | NOT VERIFIED | Dependencies could not be installed in this environment. |
| Live browser visual regression | NOT RUN | No dependency-complete build or browser session was available. |
| Real-device Web Push delivery | NOT RUN | No live VAPID secrets, deployed Worker, or device subscription were available. |
| Cloudflare deployment | NOT PERFORMED | No production changes made. |

### Dependency installation limitation

The source folder has no `node_modules`. A registry lookup timed out in this environment, so the frontend packages could not be restored. The two frontend test setup errors are missing-package errors, not assertion failures. This report does not claim that a production build or full typecheck passed.

### Dependency security follow-up — required before deployment

The current manifest/lockfile still pins Vite `8.2.2`. Official advisories list Vite `8.2.0` through `8.2.3` as affected for certain dev-server issues and identify `8.2.4` as the patched 8.2 release. The lockfile was not manually rewritten without registry access because the package integrity and full dependency resolution could not be verified. Before exposing the Vite development server to untrusted networks or certifying the build, upgrade Vite to a patched release and regenerate `package-lock.json` with npm registry access.

Official references:

- https://github.com/advisories/GHSA-rq7h-c2jc-7f22
- https://github.com/advisories/GHSA-vfpm-58rq-9qcg

These advisories concern affected Vite development-server configurations; they do not by themselves establish that the deployed static application runtime is exploitable.

## 11. Explicit limitations and handoff

1. V10 is a source archive only. It has not been deployed to Cloudflare.
2. Remote Web Push is wired into the source but requires the listed production secrets and Cloudflare Cron/KV configuration. End-to-end push delivery has not been proven on a live device.
3. The two missing-dependency frontend tests, complete typecheck, production build, and visual browser checks remain outstanding.
4. The Vite dependency must be patched and the lockfile regenerated before development-server exposure or production release certification.
5. Exported pre-removal data files contain source/example records only, not a live KV dump. The old KV keys are left untouched and unread by the new Worker.
6. The acquisition page's static product screenshots remain; the removed Gallery is the in-app feature and its legacy local screenshot storage.

**V10 is packaged for local installation and review, not production-certified.** Install dependencies, patch Vite with registry access, run typecheck/build and the complete frontend suite, validate Web Push with real Cloudflare secrets and a test device, then review the fullscreen toolbar on desktop and mobile before deployment.
