# Changelog

## V19 — Verified Accounts & Session Foundation (6 November 2026)

- Added the local profile / cloud account / guest entry flow with explanatory help.
- Added server-side email OTP and Google OAuth PKCE foundations, hashed D1 sessions, CSRF, rate limits, session listing/revocation and logout. Google initiation is same-origin POST with explicit account-policy acceptance.
- Added account-aware profile/settings UX: cloud name and verified email, local photo/phone, local-only email for local profiles, and explicit future sync preference.
- Changed profile save ordering so photo/phone are saved locally before any remote account-name update; offline failure no longer blocks device-owned edits.
- Added `0003_verified_cloud_accounts.sql`; it is included but not yet applied to Preview.
- Kept match/archive sync disabled until V20; no automatic local data upload.
- Invalidated previous live OTP codes when a replacement is requested.
- Added local/cloud account creation success notices that explain where identity data is stored and that no device data was transferred.
- Updated the service worker namespace to V19.
- No production deployment, D1 binding, or secret configuration was performed. A separate Preview Worker is required before provider secrets are configured because the current root and production Wrangler names both target `taamenn`.
- Added Preview-only EmailJS origin configuration guidance for the isolated auth host.
- Validation limitations and exact test counts are in `TAAMEN_V19_QA_REPORT.md`.

## V19 UX & Cloud Authentication Hotfix 01 (6 November 2026)

- Moved the tour replay and existing user guide into one Account & Settings help panel; removed the tour entry from the retired acquisition surface.
- Removed the Acquisition page, routes, navigation entry points, dedicated styles/translations, assets and acquisition-only tests. The legacy `/acquisition` path redirects to Home and has regression coverage.
- Removed the Email Verification card from Settings while retaining the backend OTP verification routes.
- Portaled the language menu outside the Settings layout and positioned it against its trigger with viewport-aware updates, outside-click dismissal and Escape handling.
- Improved mobile tour placement with visual viewport updates, safe areas, bottom-navigation clearance and landscape/reduced-motion rules.
- Added session-bound email identity linking and Google OAuth account linking, with collision rejection, preserved current sessions, explicit callback cancellation handling and guarded provider unlink.
- Added additive migration `0004_account_provider_linking.sql`; 0003 and 0004 are included but not applied to remote Preview.
- Separated Worker reachability, provider configuration/identity, and match-sync status in the Profile UI.
- Validation: Worker 74/74, Backend 27/27, focused UX 24/24; full frontend 265/267 (two module-load blockers from missing React/Lucide packages). Typecheck and production build remain blocked by incomplete npm dependencies. No live provider, KV, AI, D1 Preview or Production operation was performed.
