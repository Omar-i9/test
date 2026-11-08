# VERSION v18.0.1 — TAAMEN Cloud Sync Engine Foundation Hotfix 01

- Source milestone: V18.
- Product/package version remains `2.0.0`.
- V17 base, Hotfix 01 and Hotfix 02 are consolidated in this project source.
- Adds D1 `0002_cloud_sync_engine.sql` and Worker `/api/sync/push` + `/api/sync/pull`.
- Adds typed sync protocol, same-origin API client and account-partitioned IndexedDB outbox helper.
- Sync scope: display-name profile + non-private local matches/archive records. Tactical plans retain the existing V17 `/api/plans` system.
- Analytics are derived from match records. AI chats stay local; no R2.
- Private and legacy matches are not synchronized.
- Sync endpoints remain fail-closed until V19 verified sessions and explicit consent.
- No production D1, no deploy, no `wrangler deploy`.

- Hotfix 01: fixes TypeScript 7 test typing in `cloudSyncClient.test.ts` and `cloudSyncProtocol.test.ts` without weakening production UUID typing.
- Preview must be run only after a successful production build; the reported missing `.wrangler/deploy/config.json` was downstream of the failed `tsc -b`, not a separate confirmed application defect.
