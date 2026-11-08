# TAAMEN AI — V12 Integration Map

V12 retains the opt-in Workers AI assistant introduced in V11 and adds regression checks around the complete request path. The assistant is already part of the V12 application shell; this is not a second standalone chat page.

## Request path

1. `src/config/routes.ts` registers the `assistant` route for the normal local-user scope.
2. `src/App.tsx` mounts `src/pages/Assistant.tsx` for that route.
3. The page loads the local profile, checks explicit AI consent, loads the local installation identifier and quota, and builds the approved match context.
4. `src/services/assistantAI.ts` sends a same-origin request to `/api/ai/chat` and retrieves quota from `/api/ai/quota`. Mutating requests include the required `X-TAAMEN-Requested` header.
5. `worker/index.js` dispatches `/api/ai/*` to `worker/ai.js` before initializing the ordinary KV-backed backend.
6. `worker/ai.js` validates the request, reserves quota through `AI_QUOTA`, and calls `env.AI.run('@cf/openai/gpt-oss-120b', ...)`.
7. The response returns to the Assistant page and is persisted with the single local IndexedDB conversation.

## Cloudflare bindings

The original V11 Wrangler configuration already declares the Workers AI binding and quota Durable Object in both the default and production environments:

- `ai.binding`: `AI`
- `durable_objects.bindings`: `AI_QUOTA` → `AiDailyQuota`
- Existing SQLite migration: `v11-ai-quota-v1`

V12 intentionally retains the original migration tag. Do not add a second migration for the same class. The V12 Worker tests parse the JSONC configuration and verify the bindings and migration.

## Privacy and limits

- AI remains off until the user explicitly consents. Consent can be revoked.
- The frontend sends the display name, current request, up to six recent conversation messages, and a bounded summary of up to eight eligible completed matches.
- Private, legacy, featured, and incomplete match records are excluded. The full IndexedDB database, email, phone, and profile photos are not sent.
- The browser installation identifier is a local quota identifier, not a verified account.
- Limits are 10 successful requests per installation per UTC day and 18 successful requests per site per UTC day. These are application guards, not exact billing guarantees.
- The quota Durable Object stores only daily counters. It does not store prompts or conversation history.

## Local development versus real inference

The ordinary Vite page and Node backend are not a real Workers AI runtime. The Node adapter intentionally returns an unavailable response for `/api/ai/*`. To test model inference and Durable Object persistence, use the Cloudflare Vite/Workers preview with an authenticated Cloudflare account and verify the `AI` and `AI_QUOTA` bindings there.

## V12 validation boundary

Automated Worker tests verify quota behavior, request checks, the Worker entry dispatch, the Wrangler bindings, and the static frontend-to-model wiring. They do not replace a real Cloudflare preview inference test. V12 must not be treated as production-ready until dependencies are installed, typecheck/build succeed, and actual Cloudflare inference and quota persistence are tested.
