# TAAMEN V16 — Tactical AI Button Hotfix 01

**Base:** `TAAMEN_2_0_V16_Tactical_AI.zip`  
**Package version:** `2.0.0` (unchanged)  
**Scope:** Tactical Board → Analyze with TAAMEN AI.  
**Deployment:** Not deployed. This is a source patch for local verification.

## Root cause addressed

The Analyze button was disabled by a silent, over-broad gate:

- `currentLibraryPlan` is intentionally `null` for a Guest because a Guest has no editable personal plan.
- It was also set to `null` when `serializeTacticalPlan()` threw, but the caught validation error was discarded.
- The button used `disabled={busy || !ready || !currentLibraryPlan || !go}`, so both cases looked like a dead/blocked button and gave the user no explanation.

A second data-validation edge case was found in the curve tool. Its quadratic Bézier control point could fall slightly outside the pitch even when the route endpoints were inside. Schema v1 rejects out-of-range points, which could make serialization fail and silently disable the Analyze action.

## Changes

1. The Analyze action is now disabled only while the board is loading or another busy operation is running.
2. A Guest can click it and receives the existing local-profile setup prompt instead of an inert disabled button.
3. If plan serialization fails, the button remains actionable and shows a clear validation message; no plan is sent.
4. Missing navigation is reported explicitly instead of silently disabling the control.
5. The board now resets its `ready` state while switching between Guest and Local Profile, preventing a stale preview plan from being offered during the profile's IndexedDB load.
6. Curve control-point generation is bounded to the pitch. The Schema serializer also clamps an otherwise valid bounded Bézier control point at the serialization boundary, keeping stored and AI coordinates in the required normalized `0..1` range.
7. Added regression tests for curve controls at all pitch edges and for the Analyze button's actionable validation path.

## Console messages supplied with the issue

- `ERR_BLOCKED_BY_CLIENT` for the Google AdSense script indicates that the browser or an extension/privacy filter blocked the third-party advertising request. It is unrelated to the tactical button, IndexedDB, or the TAAMEN AI Worker. No application code was changed for this message.
- The `beforeinstallprompt.preventDefault()` banner notice is expected when TAAMEN intercepts Chrome's default install banner so it can present its own install UI. The captured event is passed to `prompt()` only after the user clicks the custom Install action. This message does not explain or cause the AI button state.

## Verification performed in this workspace

| Check | Result |
|---|---:|
| Focused Schema + geometry + AI handoff tests | 25/25 PASS |
| Full frontend suite | 216/218 PASS; two tests could not start because `lucide-react` is absent from the incomplete local dependency install |
| Backend | 27/27 PASS |
| Worker | 22/22 PASS |
| `qa:final` privacy invariants | PASS |
| `npm ci` | Timed out in this workspace |
| Full `npm run typecheck` | Not certified; required type packages were incomplete after the install timeout |
| Production build | Not certified; dependencies did not finish installing |
| Cloudflare deploy / live AI call | Not performed |

## Local Windows verification

Extract this hotfix ZIP to a **new folder**. Do not overlay the original V15 or V16 directory. Then run:

```powershell
npm ci
npm run typecheck
node --test --experimental-strip-types src/domain/tactics/geometry.test.ts src/domain/tactics/tacticalPlanSchema.test.ts src/services/tacticalPlanAIContext.test.ts src/services/tacticalPlanAIIntegration.test.ts
npm run test:frontend
npm run test:backend
npm run test:worker
npm run qa:final
npm run build:production
npm run preview
```

Then open the Tactical Board with a Local Profile and test both 5v5 and 7v7. Draw all six supported drawing types, especially a curve close to a pitch edge. Click **حلّل الخطة مع TAAMEN AI**, confirm the disclosure dialog, verify the plan card in Assistant, and send a question. The expected request is `POST /api/ai/chat 200 OK`.

Do not run `wrangler deploy` as part of this validation.
