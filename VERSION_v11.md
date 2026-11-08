# TAAMEN 2.0 — V11

**Archive label:** V11 (source handoff only).  
**Product/package version:** remains `2.0.0`.  
**Baseline:** a separate working copy of `TAAMEN_2.0_V10.zip`.  
**Deployment:** not deployed. No Cloudflare account, domain, Worker, KV data, or production setting was changed.

## Main delivery

V11 introduces optional TAAMEN AI through the existing Cloudflare Worker, using:

- Model: `@cf/openai/gpt-oss-120b`
- Reasoning effort: `medium`
- Maximum generated tokens: `2400`
- Non-streaming responses so the client receives one complete response payload
- Workers AI binding: `AI` (no separate provider API key)

The existing Assistant route is retained and upgraded; no second assistant page or new Worker is created.

## Usage limits

- 10 requests per browser installation per UTC day.
- Additional shared cap: 18 requests per UTC day for the entire site.
- The browser installation UUID is not a verified person/account. Clearing site storage or switching browser/device can create a new identifier.
- The local-profile requirement is an application UI gate, not server authentication.
- The shared cap protects the Cloudflare account's shared AI allocation, but it is not an exact billing ceiling.

## Privacy and local data

- AI is disabled until the user explicitly consents on the Assistant page.
- Requests send the local display name, current question, up to six recent chat messages, aggregate statistics, and details from up to eight recent completed non-private/non-legacy local matches.
- Email, phone, photos, private/legacy/featured matches, and the full local database are excluded.
- Conversation history remains in IndexedDB (80-message cap); the quota Durable Object stores UTC counters only, not prompts or match data.
- Disabling AI stops future requests but retains the local conversation.

## Test status

See `TAAMEN_V11_FULL_AUDIT_REPORT.md` for exact test results and known environment limitations. Worker tests, local-context tests, backend tests, static privacy QA, JavaScript syntax checks, and Wrangler JSONC parsing passed. Full dependency-based typecheck/build and live Cloudflare inference remain unverified because npm dependency restoration was unavailable.
