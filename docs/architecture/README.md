# TAAMEN 2.0 — Current Architecture

## Product model

TAAMEN is a local-first football workspace. The ordinary user has a local profile, matches, archive, tactical plans, notifications, analytics inputs, and one persistent assistant conversation. No login or cloud account is required for normal use. The conversation remains local; optional TAAMEN AI sends only the consented question and selected context to the Cloudflare Worker for model inference.

There is no Featured Member product surface, member-login path, or independent server-hosted historical archive in V10. The Worker no longer reads the old member/archive/session KV documents and no corresponding API routes are exposed. Old keys in a pre-existing KV namespace are intentionally left untouched pending a verified operator backup.

## Match domain

Match Center and Archive use the same canonical `Match` model and repository.

`UPCOMING → ACTIVE → COMPLETED_PENDING_RESULT → COMPLETED_WITH_RESULT → ARCHIVED`

Archive is a projection of canonical local matches.

## Storage strategy

The public workspace is IndexedDB-first (`taamen-2`). User-directed sharing is explicit local payload exchange, not cloud sync. Assistant history uses one persistent local thread with an 80-message cap. Optional AI is available only after separate consent. It uses Cloudflare Workers AI model `@cf/openai/gpt-oss-120b` with low reasoning. The browser sends the display name, question, up to six recent messages, aggregate totals, and up to eight recent completed matches; email, phone, photos, and the full local database are excluded.

The Cloudflare Worker exposes bounded services: support contact, Web Push subscription/scheduling, and opt-in AI inference at `/api/ai/*`. KV key `push` stores notification subscriptions and reminder jobs. AI quota counters are stored in a SQLite-backed Durable Object; no prompts or match details are persisted there. The retired Challenge #01 implementation is removed from runtime routes. Its historical D1 migration remains archived; no D1 tables are dropped automatically.

Web Push needs browser permission, a compatible secure context and service worker, VAPID secrets, and the five-minute Worker cron. A local test notification does not prove remote push delivery.

## Navigation

`src/config/routes.ts` is the source of truth for route metadata. Desktop and mobile navigation derive from the registry. The usage guide is opened from the Account & Control hub.

## Images and profile data

The product Gallery feature was removed. This does not remove profile-photo editing, match sharing, or tactical-pitch image export. The official TAAMEN brand mark is `public/assets/taamen-brand-mark.png`, referenced through `src/config/branding.ts`; the top-bar uses a dedicated transparent crop in `public/assets/taamen-topbar-mark.png`. Profile images are resized/compressed before local storage.

## Future cloud sync

When cloud storage is introduced, keep local writes immediate and treat remote synchronization as a separate state machine. Do not make cloud availability a prerequisite for using the local workspace.

## Optional TAAMEN AI

The V11 source adds the Workers AI binding and `AiDailyQuota` Durable Object. The per-installation limit is 10 requests per UTC day and the shared site guard is 18 requests per UTC day. The installation UUID is browser-local and is not an authenticated person identity. The local-profile requirement is enforced by the client interface, not server authentication. The quota limits are application guards, not an exact billing ceiling. The source package has not been deployed or live-tested against the production account.
