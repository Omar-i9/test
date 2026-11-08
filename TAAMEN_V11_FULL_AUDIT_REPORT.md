# TAAMEN 2.0 — V11 Full Audit & Handoff Report

**Date:** 3 November 2026  
**Archive label:** V11 only; no user-facing product version change.  
**`package.json` version:** remains `2.0.0`.  
**Baseline:** separate copy of the delivered `TAAMEN_2.0_V10.zip`.  
**Deployment status:** NOT DEPLOYED. No Cloudflare Worker, domain, KV data, or production account settings were changed.

## 1. Delivery summary

V11 adds an optional Cloudflare Workers AI integration to the existing TAAMEN Assistant, retaining the current React application shell and local-first storage model.

- Model: `@cf/openai/gpt-oss-120b`
- Reasoning effort: `medium` (selected instead of the earlier Low test setting to give the final answer more reasoning budget)
- `max_tokens`: `2400`
- `temperature`: `0.6`
- `top_p`: `0.9`
- `stream`: `false` (the frontend receives the full response payload rather than incrementally rendering an unfinished stream)
- Existing Worker: `taamenn`
- Existing Worker entry: `worker/index.js`
- Workers AI binding: `AI`
- Daily quota Durable Object: `AI_QUOTA` / `AiDailyQuota`

No new npm dependencies were added. No provider API key is required for the Workers AI binding.

## 2. Implementation details

### Cloudflare Worker

- Added `worker/ai.js` with `/api/ai/chat` and `/api/ai/quota` routes.
- `worker/index.js` routes `/api/ai/*` to the new handler and exports the `AiDailyQuota` Durable Object class.
- `wrangler.jsonc` defines the `AI` binding and SQLite-backed Durable Object binding/migration in both default and production environments.
- API requests require same-origin validation and the TAAMEN request header; request body, message count, history length, context length, and input fields are bounded.
- A short in-isolate IP burst guard complements the persistent quota counters.
- The Durable Object stores only the UTC day and request count. It does not store prompts, display names, match records, or conversation history.
- If inference fails before a model response is returned, the reservation is refunded. Successful model calls consume quota even if a later client-side action fails.
- The plain Node development adapter returns an explicit 503 response for `/api/ai/*`; hosted inference is only available through the Cloudflare Worker runtime.

### Quotas

- Per installation: 10 successful model requests per UTC day.
- Shared site cap: 18 successful model requests per UTC day.
- The installation UUID is held in browser storage. It is not a verified identity; clearing browser data or using another browser/device can create a new quota identity.
- The local-profile requirement is enforced by the product UI, not by server-side authentication. A caller able to construct requests can bypass the UI gate; this must not be represented as account authentication.
- The shared cap is an application guard and not an exact billing guarantee. Monitor actual Workers AI Neuron usage and the Cloudflare account plan before live operation.

### Frontend and user experience

- Retained the existing Assistant route and one persistent local conversation.
- Added an explicit, separate AI consent screen. AI is off until the user agrees.
- The user's locally stored first and last name are passed as a display name so the assistant can address the user naturally. The name is treated as untrusted data, not as instructions or authentication.
- Up to six recent conversation messages are sent with a request.
- The frontend builds a bounded aggregate context from completed, non-private, non-legacy/non-featured local matches; up to eight recent completed matches are sent.
- The context includes only dates, team names, scores, format, recorded personal goals/assists/minutes, and available self-ratings, plus aggregate counts/totals.
- Unknown/null values remain unknown and are not silently converted to zero.
- Email, phone, profile photos, full local database, private matches, and retired historical/featured records are not sent.
- AI answers are stored in the existing IndexedDB conversation. The 80-message history cap remains; each message can hold up to 18,000 characters.
- The UI has a quota display, busy/error states, a consent revoke control, and formatted output for headings, lists, tables, bold, and code.
- The app shell and service-worker cache were bumped to `v14` so installed clients can receive the updated Assistant interface.

### Policy and help content

- Added bilingual AI privacy and AI-use disclosures.
- Updated the policy version to `2.2` and publication date to 3 November 2026.
- Updated the bilingual usage guide to explain optional Cloudflare AI, the consent requirement, the fields sent, local conversation persistence, and daily limits.
- Updated acquisition copy to distinguish the current live product from the separate, undeployed V11 source archive.

## 3. Security and privacy checks

- Same-origin and request-header checks are applied to both AI endpoints.
- No model-provider API key is embedded in frontend or Worker source.
- No prompt or conversation text is written to the quota Durable Object.
- Input sizes, history message count/length, match context, output size, per-installation quota, shared quota, and burst request count are bounded.
- The UI makes clear that a browser installation ID is not a verified user identity and can be reset by clearing site data or changing browsers/devices.
- The user must understand that the selected question/context is sent to Cloudflare for inference; local IndexedDB storage does not mean that inference is device-local.

## 4. Validation actually executed

| Check | Result | Notes |
|---|---|---|
| `npm run qa:final` | PASS | 154 source files and 33 public files inspected; no build output existed to inspect. |
| `npm run test:worker` | PASS | 7/7 tests: model selection/parameters, CSRF/origin, per-installation quota, global site quota, quota refunds. |
| Assistant local-context tests | PASS | 3/3 tests: filters private/legacy/incomplete records, preserves unknown values, keeps eight newest completed matches. |
| `npm run test:backend` | PASS | 30/30 backend tests. |
| `npm run test:frontend` | PARTIAL | 169/171 pass. Two tests cannot load because `react` and `lucide-react` are missing from `node_modules`; failures occur at module resolution, before assertions. |
| `npm run typecheck` | BLOCKED | After correcting JSX parse issues in the worktree, TypeScript reports missing `@types/node`, `@types/react`, and `@types/react-dom`; dependency installation did not complete. |
| `npm run build` | NOT VERIFIED | Not completed because typecheck is blocked by unavailable type packages. |
| JavaScript syntax checks | PASS | `worker/ai.js`, `worker/index.js`, and `worker/ai.test.mjs`. |
| `wrangler.jsonc` parse | PASS | Parsed as JSONC; AI and Durable Object bindings validated in default and production environments. |
| Live Cloudflare Worker preview/inference | NOT RUN | No production account or live Worker changes were made. |
| Production deployment | NOT PERFORMED | V11 is a source handoff archive only. |

### Dependency limitation

An npm dependency restoration attempt timed out while contacting the npm registry. The working source did not have a complete `node_modules` tree. Therefore, the full typecheck, frontend suite, and production build cannot be represented as passing. The two frontend failures are dependency-resolution errors, not assertion failures.

### JSX source corrections found during V11 validation

- Removed an extra closing `div`/brace in the existing sidebar markup in `src/App.tsx` that prevented TypeScript JSX parsing.
- Corrected an escaped JSX attribute quote in the V11 Assistant rich-text table renderer.
- After these fixes, the TypeScript run no longer reported JSX syntax errors; it stopped on missing type-definition packages.

## 5. Cloudflare billing and operational notes

Cloudflare's current Workers AI pricing documentation lists a shared free allocation of 10,000 Neurons per account per day. On Workers Free, inference requests fail after the free allocation is exhausted; on Workers Paid, usage above the free allocation can be billed. The GPT-OSS-120B model is listed at 31,818 Neurons per million input tokens and 68,182 Neurons per million output tokens. The 18-request site cap reduces exposure but is not a precise Neuron/billing ceiling because token lengths vary. Confirm the Cloudflare plan and monitor AI usage before production operation.

Official references:

- https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/durable-objects/

## 6. Remaining work before production

1. Restore dependencies with working npm registry access.
2. Run `npm ci`, `npm run typecheck`, `npm run build`, and the complete frontend test suite.
3. Run a Cloudflare local/remote Worker preview to verify the actual Workers AI binding and SQLite Durable Object migration.
4. Review Cloudflare account plan and Neuron usage; decide whether the 18-request site cap is appropriate for expected traffic.
5. Test Arabic/English responses and long answers using the real deployed model endpoint; the V11 source uses `max_tokens: 2400` and non-streaming responses, but live output completeness has not been verified.
6. Review the Assistant UI at mobile and desktop breakpoints.
7. Only after these checks, have the authorized Cloudflare operator review the deployment diff and deploy deliberately.

**Final status:** V11 source integration and core Worker tests are prepared. V11 is not production-certified and has not been deployed. The original V10 archive remains untouched.
