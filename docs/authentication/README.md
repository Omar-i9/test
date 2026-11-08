# TAAMEN Authentication — V19

The V19 authentication boundary is a Cloudflare Worker + D1 identity system. Browser-local profile data is never an authentication credential.

## Trusted identity source

The only trusted account identity is an active D1 row in `cloud_sessions` whose opaque token hash matches the browser's HttpOnly session cookie, whose expiry has not passed, whose session is not revoked, and whose owning `users` row is active. `worker/planIdentity.js` delegates to `resolveAuthenticatedCloudUser` in `worker/cloudAuth.js`.

Never accept a `userId`, email, local profile, IndexedDB id, installation id, URL parameter, or sync `accountScope` as proof of identity.

## Entry choices

- **Local profile:** device-only profile and local-first application data. No cloud account is created.
- **Cloud account:** verified Email OTP or Google OAuth. Account identity and name are stored in D1. Local photo, phone, local optional email, and device preferences remain local.
- **Guest:** browsing without a local profile or cloud identity.

## Provider configuration

Providers are disabled until the Preview Worker has the required server variables/secrets. See `docs/authentication/V19_AR.md` and `docs/setup/V19_PREVIEW_AUTH_CONFIGURATION_AR.md`. Do not put secrets in `VITE_*`, `wrangler.jsonc`, source code, or Git.

## Account-policy acceptance

Before Email OTP or Google OAuth starts, the user must explicitly accept Privacy Policy and Terms version `2.3`. The client sends `acceptPolicy: true` and the current version. The server rejects an OTP request without both, and Google OAuth starts only through a same-origin POST (not a navigational GET). The accepted version/timestamp is stored in D1 after successful identity verification. The pending OTP/OAuth state carries the same policy version so it cannot be switched mid-flow. This is not consent to upload or synchronize local matches.

## Email OTP

- One-time six-digit code; 10-minute expiry.
- SHA-256 hash is stored, peppered with `AUTH_PEPPER` and challenge ID; plaintext code is never stored in D1.
- Five attempts per challenge; the challenge is consumed atomically before account/session creation.
- Email and IP request throttles are stored as hashed keys.
- Requires a dedicated EmailJS authentication template (`EMAILJS_AUTH_TEMPLATE_ID`). Support and auto-reply templates are not reused.

## Google OAuth

- Authorization Code flow with PKCE `S256`.
- Random one-time state is pepper-hashed in D1.
- PKCE verifier is short-lived in D1.
- A separate HttpOnly, host-only browser-binding cookie ties the callback to the browser that initiated the flow.
- Only Google identities with `email_verified === true` are accepted.
- Google identity can resolve to an existing account only where its verified email matches the account email. No cross-account merge is attempted.

## Linking and unlinking provider identities

- An authenticated cloud user can link an additional email with `/api/auth/email/link/request` and `/api/auth/email/link/verify`. The OTP challenge is marked `purpose='link'` and bound to the existing `user_id`; this flow never creates a user or issues a new session.
- Google linking starts at `/api/auth/google/link/start`. The stored OAuth state is marked `purpose='link'` and bound to the current account. The callback requires the original browser-binding cookie and the same still-active account session; it does not replace or create a session.
- Conflicts with another account return a conflict and never trigger automatic account merging.
- `POST /api/auth/provider/unlink` removes an identity only after same-origin + CSRF + active-session validation. The account must retain another verified sign-in identity. The primary account email identity cannot be removed from this UI; a secondary email identity may be removed when another provider remains.
- Migration `0004_account_provider_linking.sql` adds the challenge/OAuth purpose and owning user columns. Existing V18 data and V19 sign-in rows remain compatible through the `signin` default.

## Sessions and CSRF

- 32-byte random opaque session token; only peppered SHA-256 hash is stored in D1.
- 30-day absolute session expiry; logout and logout-all revoke server-side rows.
- HTTPS session cookie: `__Host-taamen_session; Secure; HttpOnly; SameSite=Lax; Path=/`.
- HTTPS CSRF cookie: `__Host-taamen_csrf; Secure; SameSite=Strict; Path=/`.
- Every state-changing auth/sync/plan operation requires exact same origin, `X-TAAMEN-Requested: 1`, and a matching CSRF cookie/header whose hash matches D1.
- `GET /api/auth/session` can report a missing CSRF cookie; `POST /api/auth/csrf` rotates it after same-origin verification of an already active HttpOnly session.
- `Cache-Control: no-store, private` and `Vary: Cookie` apply to auth API responses.

## Profile and data boundaries

| Field | Storage |
|---|---|
| Account first/last name | D1; editable through `/api/auth/profile` |
| Verified account email | D1; read-only in profile UI |
| Provider identity | D1 (`account_identities`) |
| Avatar/photo | IndexedDB only |
| Phone | IndexedDB only |
| Optional local email (local profile only) | IndexedDB only; not verified |
| Device settings, analytics preference, notifications | Local settings / device storage |
| Matches and archive | Local until V20 migration + explicit final approval |
| PRIVATE matches | Always local; never sync |
| AI conversation | IndexedDB; no cloud chat storage |
| Tactical plan library | Existing V17 account-owned D1 table/API, unlocked by verified cloud session |

## Sync authorization

`POST /api/auth/sync-consent` records the user's future preference and policy version. It explicitly writes `cloud_sync_enabled = 0`. The deployed `/api/sync/push` and `/api/sync/pull` handler requires the server-managed `cloud_sync_enabled === true` flag; user request bodies cannot set that flag. V20 must implement the migration preview, conflict flow, and controlled activation.

## Account management endpoints

- `GET /api/auth/session`
- `GET /api/auth/sessions`
- `PATCH /api/auth/profile`
- `POST /api/auth/sync-consent`
- `POST /api/auth/sessions/revoke`
- `POST /api/auth/email/link/request`
- `POST /api/auth/email/link/verify`
- `POST /api/auth/google/link/start`
- `POST /api/auth/provider/unlink`
- `POST /api/auth/logout`
- `POST /api/auth/logout-all`

## Testing

Run `node --test worker/cloudAuth.test.mjs` for the focused auth lifecycle; run `npm run test:worker` for all Worker, SQLite sync and account tests. The release-wide results and incomplete dependency-backed checks are recorded in `TAAMEN_V19_QA_REPORT.md`.
