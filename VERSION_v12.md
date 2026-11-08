# TAAMEN 2.0 — V12

**Archive label:** V12. The user-facing product version remains `2.0.0`.

## Purpose

V12 is a validation, reliability, and handoff release based on the delivered V11 source archive. It retains the existing opt-in TAAMEN AI implementation and adds regression coverage around the actual Worker entry and Cloudflare configuration.

## Changes

- Added Worker-entry integration coverage proving `/api/ai/*` is dispatched before ordinary KV-backed backend initialization.
- Added Wrangler JSONC regression tests for the existing Workers AI binding, Durable Object binding, and SQLite migration in the default and production environments.
- Set `remote: true` on the existing `AI` binding in both default and production Wrangler environments. This lets Cloudflare Vite Preview use the real Workers AI resource; local Node development still does not run AI inference.
- Preserved the original `v11-ai-quota-v1` migration identifier; V12 does not create a second migration for the same Durable Object class.
- Fixed the AI installation-ID Web Crypto fallback typing.
- Preserved runtime rejection of private, legacy, and featured records when constructing local AI context without relying on retired labels in the current TypeScript domain type.
- Removed an unsupported `NotificationOptions.renotify` type use from the local notification test action.
- Bumped the service-worker cache version from `v14` to `v15` so installed clients request the updated app shell.
- Added `/trophy` to the public XML sitemap and added a canonical public-page registry/test. A newly added public standalone page must update the registry and `public/sitemap.xml` together.
- Marked the Workers AI binding as `remote: true` in the default and production Wrangler environments so Cloudflare Vite preview can call the real account AI binding; the deployed Worker still uses the normal `env.AI` binding.
- Completed the public sitemap with the public `/trophy` campaign page and added a regression rule: every new public standalone page must be added to both `PUBLIC_SITEMAP_PATHS` and `public/sitemap.xml` in the same change.

## Architecture retained

- Existing TAAMEN Assistant page and local conversation in IndexedDB.
- `POST /api/ai/chat` and `GET /api/ai/quota` handled by the existing Cloudflare Worker.
- Model: `@cf/openai/gpt-oss-120b`, medium reasoning configuration.
- No model-provider API key in the frontend.
- Existing per-installation and shared daily application quotas.
- Explicit AI consent and local-first conversation persistence.

## Validation status

- `npm run qa:final`: PASS after adding explicit validation that the sitemap matches the public route registry and that the AI binding is remote-enabled for Vite Preview.
- `npm run test:worker`: 12/12 PASS.
- Public sitemap route test: 2/2 PASS.
- `npm run test:backend`: 30/30 PASS.
- `npm run test:frontend`: 169/171; the two remaining test files cannot load because React and Lucide packages are absent from the current dependency directory.
- Typecheck and production build: BLOCKED by unavailable dependencies; not represented as passing.
- Real Cloudflare inference / Worker preview: NOT RUN; `remote: true` is configured but requires the user's Cloudflare authentication and account.

## Deployment state

V12 is a source archive. No production Worker, custom domain, KV data, secrets, or Cloudflare account configuration was modified. Do not deploy until dependencies are restored, a clean typecheck and production build succeed, and real Cloudflare preview inference and quota persistence are verified.
