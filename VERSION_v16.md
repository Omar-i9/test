# TAAMEN 2.0 — V16 Tactical AI Intelligence

**Project label:** V16  
**Application/package version:** 2.0.0 (unchanged)  
**Base:** V15 Remaster  
**Scope:** Explicitly attach the active tactical-board state to TAAMEN AI for grounded tactical analysis.

## Delivered behavior

1. The user edits a 5v5 or 7v7 tactical board.
2. The user explicitly selects **Analyze with TAAMEN AI** and confirms the data disclosure.
3. The client serializes the canonical `TacticalPlanDocument` through `parseTacticalPlan` into a compact AI-only representation.
4. The handoff is stored only in tab-scoped `sessionStorage`, validated on write and read, and expires after 30 minutes.
5. The Assistant shows an attachment card with the included, sampled, and omitted drawing counts. The user may remove the attachment.
6. Each AI request re-reads and validates the handoff immediately before sending. The plan stays attached for follow-up questions until removed, expired, reset, or AI is disabled.
7. The Worker independently validates the tactical context and rejects malformed geometry before quota reservation or inference.

## Context contract and limits

- Canonical source: `TacticalPlanDocument`, schema v1.
- Formats: 5v5 and 7v7; both teams and all expected players are required.
- Coordinates are normalized by the client and represented to the model on a 0–100 x/y scale.
- Attack direction remains `unspecified`; roles are not inferred from shirt numbers.
- Drawing categories: pass, run, press, curve, multiCurve, and zone.
- Drawing styles are allowlisted. Curves preserve their control points; multi-curves preserve ordered anchors and exact start/end anchors.
- Maximum 18 drawings; up to 8 points per route are sent. Oversized geometry is sampled and extra drawings may be omitted to keep the context bounded.
- The attachment card discloses total/included/sampled/omitted counts.
- Client context ceiling: 8,000 serialized characters / 12 KiB UTF-8.
- Session handoff ceiling: 16 KiB UTF-8.
- Worker context ceiling: 14,000 characters / 48 KiB UTF-8; request body ceiling remains 64 KiB.
- `@cf/openai/gpt-oss-120b` and `reasoning_effort: low` remain unchanged.

## Privacy and safety

- No plan data is sent when opening the board or the Assistant.
- Plan data is attached only after the explicit board action and confirmation, then only transmitted when the user submits a question.
- The Worker treats plan labels and notes as untrusted data, validates all fields, and drops unknown properties.
- No screenshot or raw plan JSON file is transmitted.
- No automatic board mutation is performed by the AI.
- The handoff is tab-scoped and temporary; it is not a cloud library or synchronization mechanism.

## Explicit non-goals

- No account or email implementation.
- No D1 schema, cloud plan repository, or cross-device synchronization.
- No new AI model, model API key, or quota policy.
- No Cloudflare deployment.

## Verification in this workspace

- Tactical AI context and integration tests: **11/11 PASS**.
- Complete Worker test suite: **22/22 PASS**.
- Backend tests: **27/27 PASS**.
- Privacy QA: **PASS** (163 source files and 34 public files inspected).
- Strict isolated TypeScript check for `tacticalPlanSchema.ts` and `tacticalPlanAIContext.ts`: **PASS**.
- TS/TSX syntax transpilation for 7 changed TypeScript files: **PASS**.
- Worker JavaScript syntax check: **PASS**.
- Frontend suite: **212/214 PASS**; two test files could not start because the isolated workspace is missing the `lucide-react` and `react` package entry points. These are environment dependency failures, not failed assertions.
- Full-project `npm run typecheck` and `npm run build:production` were **not certified in this workspace** because dependency installation was incomplete and `npm ci` timed out. Run them on the Windows development machine after a fresh `npm ci`.

## Windows verification

```powershell
npm ci
npm run typecheck
node --test --experimental-strip-types src/services/tacticalPlanAIContext.test.ts src/services/tacticalPlanAIIntegration.test.ts
npm run test:frontend
npm run test:backend
npm run test:worker
npm run qa:final
npm run build:production
npm run preview
```

Do not run `wrangler deploy` as part of V16 verification. Test the board-to-Assistant handoff and a real GPT-OSS answer in Preview first.
