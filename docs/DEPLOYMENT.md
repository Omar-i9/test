# TAAMEN 2.0 — deployment and runtime notes

This document describes the V13 source, prepared from the validated V12 Cloudflare Preview baseline. V13 has not been deployed to Cloudflare. `package.json` remains `2.0.0`; V13 is a handoff label, not an in-app version or package-version change.

## Runtime layout

| Part | Responsibility |
|---|---|
| Vite client | React SPA, emitted to `dist/client/` |
| Cloudflare Worker | Same-origin `/api/*` endpoints and scheduled Web Push delivery |
| `TAAMEN_KV` | Web Push subscriptions and queued reminder jobs, under the `push` key |
| Optional D1 binding | None in the active application runtime |
| `AI` binding | Cloudflare Workers AI model inference (`@cf/openai/gpt-oss-120b`) |
| `AI_QUOTA` Durable Object | SQLite-backed daily per-installation and shared request counters only |
| IndexedDB / browser storage | Profile, matches, archive, tactical plans, assistant conversation, AI consent, preferences and local notices |

The ordinary product is local-first. It does not have a general user-account/session system,
Featured Member recognition service, or server-hosted historical match center. The Assistant keeps one local IndexedDB conversation and can call Cloudflare Workers AI only after explicit user consent. The model is `@cf/openai/gpt-oss-120b` at low reasoning effort.

## Development

Requirements: Node.js 20 or newer and the dependencies in `package-lock.json`.

```bash
npm install
npm run dev
```

The Vite development server proxies `/api` to the Node adapter at `http://localhost:8787`.
In a second terminal:

```bash
npm run backend
```

The Node adapter is a development convenience. Its push store is in
memory, so restarting that process clears those server-side development records. It does
not emulate durable Cloudflare KV or D1. Its `/api/ai/*` routes deliberately return 503: hosted
AI is available only through the configured Cloudflare Worker runtime, not the plain Node adapter.

Build and local checks:

```bash
npm run typecheck
npm run build
npm run qa:final
npm run test:backend
npm run test:frontend
npm run test:worker
```

`npm run preview` serves the built Vite application. Use the Cloudflare Workers preview
flow when you need to exercise the Worker runtime, KV binding, AI binding, or cron behavior.

## Cloudflare Worker

`wrangler.jsonc` is configured for the existing Worker name `taamenn` and the existing
`TAAMEN_KV` namespace. Do not create a replacement namespace for this release.

- Worker entry: `worker/index.js`.
- Static client output: `dist/client/`.
- Only `/api/*` is routed through Worker logic (`assets.run_worker_first`).
- The `scheduled` handler calls the push dispatcher; the cron is every five minutes.
- `TAAMEN_KV` is used for the `push` document only.
- `AI` is a Workers AI binding defined in `wrangler.jsonc`; it is not an API key and must not be copied into frontend code.
- `AI_QUOTA` is a SQLite-backed Durable Object binding for `AiDailyQuota`. The `v11-ai-quota-v1` migration creates its namespace; it stores only counters and UTC reset dates.
- TAAMEN AI allows 10 requests per browser installation per UTC day and 18 requests per site per UTC day. These counters are an application-level limit, not a guaranteed exact billing cap. Monitor Workers AI usage in the Cloudflare dashboard.
- No prompt, profile name, match data, or conversation text is stored in the quota Durable Object. The model receives only the opt-in request payload. Conversation history remains in the browser's IndexedDB.
- The browser installation ID is not a verified account identity; clearing browser storage or using another browser/device can create another ID. The requirement for a local profile is enforced in the UI and is not server authentication.

The former KV keys named `data` and `sessions` are not read by the V12 Worker and are deliberately not
deleted at Worker startup. They may contain old data from earlier releases. Do not delete
them until an operator has exported and independently verified any required live data.
The source archive's old example fixture is not a backup of the live Cloudflare namespace.

## Worker environment and secrets

The following variables are read by the Worker/backend configuration:

| Name | Purpose |
|---|---|
| `PORT` | Node adapter port; defaults to `8787` |
| `NODE_ENV` | Runtime mode; production Worker environment sets `production` |
| `CORS_ORIGIN` | Allowed origins for a cross-origin API; empty for same-origin |
| `REQUIRE_HTTPS` | Reject non-HTTPS API requests when enabled |
| `TRUST_PROXY` | Trust proxy headers only behind a proxy that overwrites them |
| `TAAMEN_SUPPORT_RECIPIENT` | Optional server-side support recipient |
| `EMAILJS_SERVICE_ID` | EmailJS service identifier |
| `EMAILJS_CONTACT_TEMPLATE_ID` | Contact template identifier |
| `EMAILJS_AUTOREPLY_TEMPLATE_ID` | Auto-reply template identifier |
| `EMAILJS_PUBLIC_KEY` | Public EmailJS key |
| `EMAILJS_PRIVATE_KEY` | Optional private EmailJS credential; server-side only |
| `EMAILJS_ORIGIN` | Origin header used for server-side EmailJS delivery |
| `VAPID_PUBLIC_KEY` | Public key used for Web Push subscriptions and delivery |
| `VAPID_PRIVATE_KEY` | Private VAPID key; secret only |
| `VAPID_SUBJECT` | Contact URI used in VAPID authentication |

The current `wrangler.jsonc` contains non-secret EmailJS identifiers and origin values.
The VAPID values are not populated in the source. Before expecting remote push delivery,
configure a matching VAPID public/private key pair and subject as Worker secrets. Never
place the private VAPID key or EmailJS private key in `VITE_*`, frontend code, committed
files, or Wrangler `vars`.

For the production environment, use the Cloudflare dashboard's Worker Secrets interface
or Wrangler secret commands targeting the `production` environment. The `VAPID_PUBLIC_KEY`
returned by `/api/push/config` must correspond to the private key used by the Worker.

Production build and deployment commands (not executed for this archive):

```bash
npm run build:production
npx wrangler deploy --env production
```

Before deploying, verify the actual project environment, configured Worker name, existing
KV binding, EmailJS settings, and secrets. This source
archive does not claim that the live Cloudflare configuration has been inspected or changed.

## Web Push and reminders

Background reminders require all of the following:

1. A secure origin and a browser/device that supports Service Worker, Push API, and
   notifications.
2. The user has granted notification permission and enabled the push setting.
3. Valid VAPID configuration exists on the Worker.
4. The `/api/push/*` endpoints can persist the subscription and scheduled reminder jobs in
   the `push` document in `TAAMEN_KV`.
5. The Worker has the five-minute cron trigger configured and deployed.

The app schedules reminders using the configured 30-minute and 10-minute lead times.
The page does not need to remain open; the cron sends jobs that are due. Delivery still
depends on the browser, operating system, network, and push service. For iOS, install the
web app to the Home Screen on a supported OS release before expecting Web Push.

The in-app **Test notification** can display a local Service Worker notification on the
current device. That confirms local notification display only. A remote test push is a
separate operation and is needed to verify subscription storage and server-to-device
transport end to end.

## Local data, privacy, and backup

Profile and match data are stored in the browser. Use Settings → Data & installation to
export a TAAMEN JSON backup before resetting browser data or moving to another device.
The synthetic 20-match fixture is under `test-data/` and is not real user data.

Do not place operator files, runtime databases, exports containing personal information,
`.env`, `.dev.vars`, private keys, or secrets inside `public/`, `dist/client/`, or release
archives. The build ZIP intentionally excludes runtime state and private environment files.

## Security headers and static behavior

The Worker sets API response headers. The SPA assets are served by the Cloudflare assets
pipeline, so verify the deployed static response headers and CSP independently. Keep
`/api/*` out of service-worker caches. The current service worker uses a versioned shell
cache; increment that cache version when shell caching behavior changes.


## V13 TAAMEN AI runtime bindings

V13 retains the validated V12 opt-in AI integration and the Wrangler bindings required to route it:

- `ai.binding = AI` in the default and production environments.
- `durable_objects.bindings` exposes `AI_QUOTA` as `AiDailyQuota` in both environments.
- The original top-level `v11-ai-quota-v1` migration provisions the SQLite-backed quota class. V13 retains this migration identifier and does not add a duplicate migration for the same class. Named production environment bindings are declared explicitly.

The AI routes are dispatched by `worker/index.js` before the ordinary KV-backed backend initialization:

- `GET /api/ai/quota`
- `POST /api/ai/chat`

The Node backend adapter intentionally does not run inference. Use the Cloudflare Vite/Workers preview with an authenticated Cloudflare account to test real model inference. Workers AI use may incur account usage even during local development; inspect the account plan and AI usage before running repeated real-model tests.

V13 is a pre-release handoff. Do not deploy until the production environment, the existing SQLite Durable Object migration, account usage, full frontend typecheck, and production build have been reviewed.
