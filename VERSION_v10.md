# TAAMEN 2.0 — V10

**Archive label:** V10 (delivery label only)
**Product version:** `2.0.0` (unchanged)
**Source baseline:** the delivered V9 source archive, copied into an independent V10 worktree
**Deployment:** not deployed; Cloudflare production state was not changed

## V10 scope

- Enlarge all tactical route arrowheads to 20×20 SVG marker geometry and align the marker reference point with the exact path endpoint.
- Rework Tactical Board focus/fullscreen controls so the toolbar stays centered at the top, fits and wraps on smaller screens, and the local-editor/pitch nudge overlays are hidden in focus mode.
- Replace Assistant's saved/temporary/multi-chat model with one persistent local conversation. Keep the latest 80 messages, cap each message at 4,000 characters, and provide a small reset control.
- Reduce Home shortcuts to four cards: one session-stable random metric card (Archive, Decided matches, or Draws), Stadiums, Tactical Board, and Analytics. The random metric stays consistent while navigating within a browser visit and avoids repeating the previous visit's choice.
- Retire Featured Members and its member login / historical archive API endpoints. Challenge #01 remains independent. Legacy Cloudflare KV keys are not read and are intentionally not deleted automatically.
- Refine Notifications & Privacy controls, keep analytics opt-in behavior real, and retain the PWA Web Push pipeline for background match reminders (30 and 10 minutes before kickoff). Add/retain a local device test and a separate remote push test.
- Remove the in-app Gallery route and legacy screenshot store. Ignore legacy screenshot records during backup import.
- Make Settings cards size to their own content.
- Move the interactive, bilingual usage guide to Account & Control above its three destination cards, with diagrams and improved visual hierarchy.
- Include a synthetic, import-compatible JSON fixture containing 20 matches; 15 include team-level details and player contributions.

## Data and compatibility

- IndexedDB schema advances to version 7. The `assistant` store remains; the retired `screenshots` store is deleted during the versioned upgrade.
- The Assistant migration consolidates the most recently active V9 chat into the one V10 conversation where possible, then removes legacy multi-chat records and pointers.
- Backup import rejects private and retired Featured Member match records; legacy screenshot arrays are ignored.
- The PWA shell cache is bumped to `v13` so installed clients refresh the V10 shell.
- The synthetic fixture is fictional test content, not production data.
- The pre-removal member/match snapshots were exported separately before the feature was removed. They contain only the example/local data available in the source tree, not Cloudflare's live KV contents.

See `TAAMEN_V10_FULL_AUDIT_REPORT.md` for implementation notes, test results, known blockers, and the exact deployment prerequisites.
