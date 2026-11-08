# TAAMEN V19 — QA entry point

The current milestone is **V19 Verified Accounts & Session Foundation**. The release QA report is [TAAMEN_V19_QA_REPORT.md](TAAMEN_V19_QA_REPORT.md).

V19 is a Preview implementation candidate based on V18 Hotfix 01. It includes migration `0003_verified_cloud_accounts.sql`, but that migration has not been applied to remote D1 by this implementation run. Read [README_V19_AR.md](README_V19_AR.md), [docs/authentication/V19_AR.md](docs/authentication/V19_AR.md), and [docs/setup/V19_PREVIEW_AUTH_CONFIGURATION_AR.md](docs/setup/V19_PREVIEW_AUTH_CONFIGURATION_AR.md) before proceeding.

The existing Wrangler configuration names both its root Worker and `env.production` Worker `taamenn`. Do not put V19 auth secrets on the current Wrangler target; create an isolated Preview Worker first. Do not deploy. General match/archive sync remains disabled until V20.
