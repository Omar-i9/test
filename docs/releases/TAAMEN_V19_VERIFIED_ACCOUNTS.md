# TAAMEN 2.0 — V19 Verified Accounts Foundation

**Release label:** V19  
**Date:** 5 November 2026  
**Application version:** `2.0.0` unchanged  
**Base:** V18 Cloud Sync Engine Hotfix 01  
**Deployment:** not deployed  
**Migrations:** `0003_verified_cloud_accounts.sql` and the later additive `0004_account_provider_linking.sql` are included; neither is applied remotely by this hotfix run

## Summary

V19 supplies the missing server-side identity boundary for the V17/V18 cloud foundation. It introduces three access choices, passwordless email OTP, Google OAuth PKCE, D1-owned account identity, hashed sessions, CSRF protection, session management, cloud account profile UI and explicit future sync consent.

## Core architecture

- `users.id` remains the account ownership anchor.
- `account_identities` holds verified email/Google provider identities.
- `email_auth_challenges` stores only peppered OTP hashes, attempt counts and expirations.
- `cloud_sessions` stores peppered token/CSRF hashes, expirations, revocation time and bounded user-agent metadata.
- `google_oauth_states` stores one-time state hashes, short-lived PKCE verifier and browser-binding hash.
- `auth_rate_limits` stores hashed scopes rather than raw emails/IP addresses.
- `resolveAuthenticatedCloudUser` is the only Worker identity resolver.

## User-facing experience

- Local profile: device-only data, no cloud account.
- Cloud account: verified email or Google; cloud name/email; read-only verified email display; editable first/last name; local picture/phone/device settings.
- Guest: public browsing with no profile.
- Help icons explain the distinction at entry.
- Session list and revoke controls are available for cloud users.
- Essential session/CSRF cookies are explained; optional analytics preferences remain separate.

## Sync safety

The V18 sync Worker now requires a server-side `cloud_sync_enabled === true` flag. V19 consent stores the policy version and accepted timestamp but writes `cloud_sync_enabled = 0`. The account session does not upload local matches or archives. V20 must implement migration preview, exact record scope, per-device cursor, conflict UX and controlled enablement.

## Validation

See the root `TAAMEN_V19_QA_REPORT.md`. Automated Worker and backend tests pass. Full dependency-backed typecheck/build and browser E2E remain unverified in the isolated build environment because `npm ci` timed out and required React/Lucide packages were unavailable. The operator must restore the tested Windows lockfile before `npm ci`.

## Operator next steps

1. Copy the operator-tested V18 Windows `package-lock.json` into the V19 worktree.
2. Run npm install/test/typecheck/build steps from `README_V19_AR.md`.
3. After confirming isolated Preview and local build gates, apply only the pending `0003_verified_cloud_accounts.sql` and `0004_account_provider_linking.sql` in order. Never reapply 0001 or 0002.
4. Configure Preview-only OAuth/EmailJS credentials after the app and migration pass local checks.
5. Run real Preview sign-in/OTP/session tests.
6. Keep production untouched. Do not deploy.
