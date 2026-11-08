# TAAMEN 2.0 — V12 Full Audit & Handoff Report

**Date:** 3 November 2026  
**Archive label:** V12; `package.json` remains `2.0.0`.  
**Baseline:** delivered `TAAMEN_2.0_V11.zip`.  
**Repository status:** local source archive only; no GitHub branch or commit was changed.  
**Deployment status:** NOT DEPLOYED. No Cloudflare Worker, domain, KV data, D1 data, secrets, or production settings were modified.

## 1. Executive summary

V12 retains the existing TAAMEN Assistant from V11 and verifies the source-level path from the Assistant page through the frontend service and existing Worker to Workers AI. It adds `remote: true` to the existing AI binding for Cloudflare Vite Preview, without creating a second Worker or adding a model-provider API key.

V12 also completes the public sitemap: `/trophy` is added as a public standalone campaign page. The canonical public URL list is maintained in `src/config/publicRoutes.ts`; the test and QA gate require `public/sitemap.xml` to match it and exclude API and tokenized share URLs. Documentation now requires every future public standalone page to update the registry and sitemap in the same change.

V12 is still a source archive, not a deployed build. Worker, Backend, QA, and sitemap tests pass. Two frontend test modules remain unable to load because packages are absent. Typecheck and production build have not passed in this environment. Real Cloudflare preview inference has not been run.

## 2. Source selection and repository synchronization

The official repository `taamenn-official/taamenn`, branch `main`, was inspected. At the time of review, its README and Worker still described the Assistant and AI endpoints as removed, and its current app tree did not contain the V11 Assistant page or AI service. V12 was therefore based on the delivered V11 source archive rather than replacing it with that older AI-free product source.

**Important deployment boundary:** V12 has not been merged into the official GitHub `main` branch. The current repository and V12 archive must be reconciled deliberately before using GitHub-based automatic deployment. Uploading this archive over the current Worker without first confirming source parity could replace newer main-branch work. No GitHub files were changed as part of this handoff.

## 3. Existing AI architecture retained

### Frontend

- `src/config/routes.ts` registers the `assistant` route.
- `src/App.tsx` mounts `src/pages/Assistant.tsx` for that route.
- The Assistant page contains explicit AI consent, quota state, message UI, and bounded context construction.
- `src/services/assistantAI.ts` sends requests to `/api/ai/chat` and `/api/ai/quota`, stores consent in IndexedDB, and maintains a browser installation identifier.
- `src/services/assistantConversations.ts` persists the single conversation locally in IndexedDB.
- `src/styles/assistant.css` supplies the Assistant design.

### Worker and model

- `worker/index.js` dispatches `/api/ai/*` before ordinary backend initialization.
- `worker/ai.js` validates requests, enforces quotas, calls the model, and returns the answer.
- Model: `@cf/openai/gpt-oss-120b`.
- Request settings: `reasoning_effort: medium`, `max_tokens: 2400`, `temperature: 0.6`, `top_p: 0.9`, `stream: false`.
- Inference occurs through `env.AI` in the Cloudflare Worker. No separate provider API key is added to the frontend.
- `AiDailyQuota` is exported by the Worker and stores daily counters only.

### Wrangler configuration

The original V11 AI and Durable Object declarations were already present. V12 preserves them and makes only the following preview-related change:

- Default `ai.binding = AI` with `remote: true`.
- Production `ai.binding = AI` with `remote: true`.
- Default Durable Object binding `AI_QUOTA` → `AiDailyQuota`.
- Production has its own non-inherited `AI_QUOTA` binding.
- Existing SQLite migration `v11-ai-quota-v1` remains unchanged. No duplicate migration is added.
- Existing Worker name, KV namespace ID, cron, and environment variables are retained.

`remote: true` is for local Cloudflare Vite Preview to reach the real Workers AI resource. It does not create a new Worker or expose AI directly to the browser. The Node `npm run dev` adapter still does not execute hosted AI. The remote inference call uses the real Cloudflare account allocation and may count toward usage.

## 4. Public sitemap changes

The public sitemap now lists exactly these public standalone URLs:

- `https://taamenn.com/`
- `https://taamenn.com/acquisition`
- `https://taamenn.com/trophy`
- `https://taamenn.com/privacy`
- `https://taamenn.com/terms`

`/api/*`, tokenized `/share/*`, and local/hash-based application sections are not listed. Files added:

- `docs/SEO_PUBLIC_PAGES.md` — maintenance rule and route policy.
- `docs/CLOUDFLARE_AI_SETUP_AR.md` — Arabic Cloudflare AI setup, preview, cost, validation, and deployment guide.

`src/config/publicRoutes.ts`, `src/config/publicRoutes.test.ts`, and `scripts/qa-final.mjs` now validate sitemap completeness.

## 5. Privacy and security boundaries

- AI remains off until explicit user consent; consent can be revoked.
- Requests include the display name, selected question/history (up to six messages), and a bounded aggregate context from up to eight eligible completed local matches.
- Private, legacy, featured, and incomplete records are excluded by the context builder; the Worker independently sanitizes the submitted context.
- Email, phone, photos, and the complete IndexedDB database are not sent.
- The quota Durable Object stores counters and UTC day only, not prompts, names, matches, or conversation text.
- Same-origin validation and the required `X-TAAMEN-Requested` header remain enforced. Request size, history size, context size, output size, installation quota, shared quota, and burst rate are bounded.
- Limits remain 10 successful requests per installation per UTC day and 18 successful requests site-wide per UTC day. These app limits are not a guaranteed billing ceiling.
- The installation ID is local to a browser installation and is not a verified user identity.

## 6. Exact V12 file changes

### Added

- `docs/CLOUDFLARE_AI_SETUP_AR.md`
- `docs/SEO_PUBLIC_PAGES.md`

### Modified

- `wrangler.jsonc` — added `remote: true` to the existing AI binding in default and production environments; kept the original DO binding and migration.
- `worker/wrangler-ai-config.test.mjs` — asserts AI remote binding is enabled for local Cloudflare Vite Preview.
- `scripts/qa-final.mjs` — accepts and requires the AI remote binding; validates `PUBLIC_SITEMAP_PATHS` against the XML sitemap and excludes private/API URLs.
- `src/config/publicRoutes.ts` — added `/trophy` to canonical public sitemap paths.
- `src/config/publicRoutes.test.ts` — asserts complete public page list and sitemap consistency.
- `public/sitemap.xml` — added the `/trophy` public campaign page.
- `README.md` — adds sitemap maintenance rule, points to Cloudflare AI setup guide, and fixes the Node backend run command.
- `VERSION_v12.md` — records preview binding and sitemap changes.

Earlier V12 changes retained from the initial V12 preparation:

- Worker-entry integration test; AI/Worker tests.
- Type correction in `src/services/assistantAI.ts`.
- Removal of unsupported `NotificationOptions.renotify` type use in the service-worker test action.
- Service worker cache version `v15`.

## 7. Validation actually executed in this review

| Check | Result | Notes |
|---|---:|---|
| `npm run qa:final` | PASS | Inspected 154 source files and 33 public files; no build output existed. |
| `npm run test:worker` | PASS — 12/12 | AI quota, CSRF/origin, refunds, Worker dispatch, bindings, and UI-to-model wiring. |
| `npm run test:backend` | PASS — 30/30 | Existing Backend suite. |
| Public sitemap test | PASS — 2/2 | Public path registry and XML sitemap match; `/trophy` included. |
| `npm run test:frontend` | PARTIAL — 169/171 | Two test files fail before assertions because `lucide-react` and `react` are not installed. |
| Typecheck | BLOCKED | Dependencies and type packages are absent. |
| Production build | NOT VERIFIED | Cannot complete without dependency restoration and typecheck. |
| JSONC parse / binding config tests | PASS | Default and production AI bindings, Durable Object binding, and original migration are checked. |
| Real Cloudflare Vite Preview / inference | NOT RUN | `remote: true` is configured but requires the user's Cloudflare login and account. |
| Production deployment | NOT PERFORMED | No production Worker or site changes. |

The V12 working directory did not contain complete `node_modules`. Dependency restoration was not completed in this runtime. Do not classify the frontend module-resolution failures as assertion failures or treat the missing type packages as a successful typecheck.

## 8. Security dependency blocker

The project manifest and lockfile pin Vite `8.2.2`. GitHub advisories identify `8.2.0` through `8.2.3` as affected for October 2026 advisories and list `8.2.4` as the patched 8.2 release. Before certifying the build, update Vite with `npm install vite@8.2.4 --save-exact` and regenerate `package-lock.json`; do not hand-edit integrity data.

References:

- https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22
- https://github.com/vitejs/vite/security/advisories/GHSA-vfpm-58rq-9qcg
- https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/
- https://developers.cloudflare.com/workers-ai/platform/pricing/

## 9. Steps required to connect and deploy

1. Use the V12 source archive only after syncing it with the intended current product source and confirming no newer GitHub functionality is lost.
2. Restore dependencies and update Vite to at least patched `8.2.4` using npm.
3. Run `npm run qa:final`, `npm run test:worker`, `npm run test:backend`, `npm run test:frontend`, `npm run typecheck`, and `npm run build:production` to completion.
4. Authenticate with `npx wrangler login` and confirm the intended account with `npx wrangler whoami`.
5. Use `npm run build:production` followed by `npm run preview` to test the Cloudflare Vite Preview with the remote AI binding. Do not use `npm run dev` as proof of Workers AI availability.
6. Verify real GPT-OSS inference, the quota route, consent, and the actual Cloudflare Workers AI usage dashboard. The local preview's Durable Object counter is a local simulation; validate persistent quota storage after deployment in the target environment.
7. Only after these checks and an intentional review of the existing `taamenn` Worker, deploy with the generated production configuration using `npx wrangler deploy`. With the Cloudflare Vite plugin, choose `CLOUDFLARE_ENV=production` at build time; do not rely on `--env production` after the Vite build.

**Final status:** V12 source archive updated with remote Workers AI preview configuration and complete public sitemap. Worker, Backend, QA, and sitemap tests pass. Production build, Cloudflare inference, GitHub synchronization, and production deployment remain unverified or incomplete.
