# TAAMEN 2.0 — Security Review and Deployment Gate

Review date: 2026-10-28

## Changes applied in this source package

- Removed the private historical match archive from the repository/source package. The KV preparation script now requires an operator-supplied archive path instead of silently importing private history from the source tree.
- Removed hard-coded member recognition codes from source and example data. Recognition configuration is read from `TAAMEN_FEATURED_CODES`; every configured code must be unique and at least 24 characters. Missing or malformed configuration fails closed and disables recognition.
- Member recognition values are stored as SHA-256 hashes, not plaintext; comparisons use fixed-length constant-time comparison. Existing member records are re-synchronized against the configured secret map by the Worker/server startup path.
- Kept authentication sessions server-side, using hashed session-token lookup and secure-cookie handling already covered by backend tests.
- Hardened parsing for malformed cookie input, and kept the public sharing contract free of the owner’s `personalPerformance` fields.
- Kept personal archive access behind the recognition-session requirement; the local first-run profile remains a local-only product feature and is not represented as cloud authentication.
- Expanded automated checks around authentication fail-closed behavior, session storage, share payload privacy, data migration and client privacy.

## Results verified in this environment

- TypeScript: PASS.
- Frontend tests: 153/153 PASS.
- Backend tests: 88/88 PASS.
- Static client privacy gate (`npm run qa:final`): PASS.
- Production bundle: NOT VERIFIED. The bundled dependencies came from a different platform; the Vite command is not executable in this Linux environment, and direct invocation fails because `@rolldown/binding-linux-x64-gnu` is missing. The npm registry was unreachable, so the lockfile could not be safely regenerated here.

## Outstanding security action: Vite dependency

`package.json` and `package-lock.json` still pin `vite` 8.2.2. Published Vite advisories list 8.2.0 through 8.2.3 as affected by several dev-server issues, with 8.2.4 as a patched release; newer stable 8.3.x releases are also available. References:

- https://github.com/vitejs/vite/security/advisories/GHSA-9jrq-w75r-8gcw
- https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22
- https://github.com/vitejs/vite/security/advisories/GHSA-vfpm-58rq-9qcg
- https://www.npmjs.com/package/vite?activeTab=versions

Because the package registry was unreachable, this package was not silently changed to a new version with a fabricated or missing lockfile integrity value. On a network-enabled machine, update Vite to a patched, compatible release (prefer the current supported 8.3.x line), regenerate `package-lock.json` through npm, then run the full test and production-build sequence. Treat this as a release blocker; do not expose the Vite development server to the public internet.

## Required Cloudflare/Git operator actions

1. Generate 12 distinct, high-entropy recognition codes, each at least 24 characters. Do not reuse any old code.
2. Configure Worker secret `TAAMEN_FEATURED_CODES` as a JSON object keyed by each canonical member ID (or username) and map each key to its new code. Keep the secret in Cloudflare Worker Secrets, never in `wrangler.jsonc`, `.env.example`, source control, or frontend variables. The app intentionally disables recognition if the secret is missing or invalid.
3. Deploy the Worker only after the secret is configured. Confirm the Worker startup sync replaces legacy member records with hashed codes and removes plaintext `memberCode` properties. Check the actual KV data through an authorized operator path; do not export it into the frontend or public assets.
4. If private history or former recognition codes were ever committed, deleting them from this ZIP does not erase Git history or old clones. Review repository history and rotate any potentially exposed codes. Clean history only with a coordinated repository operation and after making a secure backup.
5. Set HTTPS-required production settings and review Cloudflare environment variables/secrets before release. This source package does not change live Cloudflare settings, existing KV contents, or remote Git history.

## Scope statement

These are source-level hardening changes and automated checks, not a guarantee that every possible vulnerability is closed. The live Worker configuration, deployed bundle, KV contents, Git history, and external dependencies must be verified in their actual environments before calling the system production-secure.
