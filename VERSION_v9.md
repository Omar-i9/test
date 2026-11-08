# TAAMEN 2.0 — V9

**Release line:** TAAMEN 2.0  
**Project version:** `2.0.0` (intentionally unchanged)  
**Source baseline:** restored V6 pre-colour-refactor archive `TAAMEN_2_0_Final_Tactical_And_UI_Polish.zip`  
**V9 worktree:** independent copy; the source archive is not modified  
**Service worker shell:** `v12` (bumped from `v11` so existing clients refresh the changed shell)

## V9 scope

- Retain V6's original theme, light/dark behaviour, and animated ambient background.
- Refine the header identity: logo-only Home link in the top bar; text-only `TAAMEN 2.0` Home link in the expanded sidebar.
- Animate Lucide navigation icons only on selection, hover, and press, with reduced-motion support.
- Keep the SideProjectors/acquisition entry points on Home only.
- Rebalance Home's lower dashboard: compact recent-match cards on the RTL leading/right panel, personal goals/assists on the adjacent panel, plus a restrained chart entrance.
- Change Analytics to a one-time, slower first-entry graph reveal. Range, chart-mode, and point selection do not replay it.
- Enlarge tactical arrowheads modestly, distinguish the run route with a longer broken dash sequence, and gently highlight routes matching the currently selected tool.
- Clarify Challenge #01 verification evidence and add privacy-safe share/copy controls without changing challenge task definitions, verification rules, dates, or backend settings.
- Add local Assistant chat history: topic-based titles, saved chats in IndexedDB, a temporary tab-session chat, and delete/new/open controls. Assistant remains local and deterministic; it is not an external generative-AI integration.
- Correct secondary-page back targets: Settings/Support return to Account & Settings; Profile entered from the top-bar avatar returns to the originating main page.
- Preserve the existing responsive GSAP Profile Setup entrance/exit motion; no 60fps MCP shot analysis was performed because that connector was not available.

## Data compatibility

The IndexedDB schema is advanced from version 5 to version 6 by adding one `assistant` object store. Existing stores are retained; the upgrade creates the new store only when it does not already exist. Assistant conversations are included in normal local backup export/import. Temporary chat content is stored in `sessionStorage` and cleared by the app's local-data reset operation.

## Validation status

See `TAAMEN_V9_FULL_AUDIT_REPORT.md` for the executed checks and the remaining dependency/network limitations. V9 has **not** been deployed to Cloudflare.
