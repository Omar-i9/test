# TAAMEN 2.0 — V19

**Milestone:** Verified Accounts & Session Foundation  
**Application version:** `2.0.0` (unchanged)  
**Baseline:** V18 Cloud Sync Engine Hotfix 01  
**State:** Preview implementation candidate; not deployed; local typecheck/build remain blocked pending Windows dependency-lockfile handoff.

V19 introduces verified email/Google cloud identity, D1-backed account/provider records, OTP challenge storage, secure sessions, CSRF, session management, account-aware profile UI, local/cloud/guest entry, and explicit future sync consent.

`migrations/0003_verified_cloud_accounts.sql` is additive and included. It must be applied only to the existing `taamen-plans-preview` database after Windows typecheck, tests and production build pass. It has not been applied by this implementation run.

General match/archive sync remains disabled (`cloud_sync_enabled = 0`) until V20 implements migration preview, conflict handling, recovery, and two-device verification. No Production D1, Production secrets, Worker deployment, or production site changes are included.

Validation details: `TAAMEN_V19_QA_REPORT.md`. Worker 69/69, Backend 27/27, focused auth 9/9 and V19 UX source-boundary tests 7/7 pass in this environment. Frontend is partial (253 passed, two could not load because React/Lucide dependencies are absent); full typecheck and production build are blocked by missing type packages.
