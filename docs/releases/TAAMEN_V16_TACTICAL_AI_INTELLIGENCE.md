# TAAMEN 2.0 — V16 Tactical AI Intelligence

**Base:** V15 Remaster  
**Application/package version:** 2.0.0 (unchanged)  
**Release scope:** Explicit tactical-plan handoff from the interactive board to TAAMEN AI.

## Implementation

- Added `src/services/tacticalPlanAIContext.ts` to convert and validate canonical tactical plan data into a compact, bounded AI context.
- Added explicit user confirmation on the tactical board before the handoff is written.
- Added a 30-minute tab-scoped `sessionStorage` handoff, with byte-size checks and strict parsing on read.
- Added an Assistant attachment card with drawing coverage metadata and removal control.
- Added timer-based expiry that removes the attachment card automatically, not only when the user next submits a message.
- Re-reads the handoff before every message; a missing or expired attachment is not sent.
- Clears the handoff when removed, resetting the conversation, or disabling AI.
- Worker independently validates the format, exact player counts, unique shirt numbers per team, normalized context coordinates, drawing/style allowlists, point caps, sampling flags, and exact route endpoints. Invalid context is rejected before quota reservation or inference.
- Arabic and English system instructions explain route semantics, coordinate interpretation, sampling omissions, uncertainty, and untrusted user text.
- Existing GPT-OSS 120B inference and `reasoning_effort: low` remain unchanged.

## Verification

| Gate | Result |
|---|---:|
| Tactical AI context + integration | 11/11 PASS |
| Worker | 22/22 PASS |
| Backend | 27/27 PASS |
| Privacy QA | PASS |
| Isolated strict TypeScript: schema + context service | PASS |
| Syntax transpilation: 7 changed TS/TSX files | PASS |
| Worker JavaScript syntax | PASS |
| Frontend suite | 212/214 PASS |

The two frontend test files that did not start require `lucide-react` and `react` package entry points missing from the isolated workspace. No assertion failure was reported in those two files. `npm ci` timed out in this workspace, so full application typecheck and production build are not certified here. These must be run on the Windows development machine after installing dependencies from the lockfile.

## Safety and non-goals

No accounts, email, D1, cloud plan storage, cross-device sync, or deployment were added. The tactical plan is not sent on page entry; it is shared only after explicit action and confirmation, then when the user submits a question. No screenshot or raw JSON file is sent. The model cannot mutate the tactical board.

## Local validation

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

Do not deploy until the full local gates and real Preview inference have passed.
