# Public pages and sitemap maintenance

The public sitemap is `public/sitemap.xml`, served at `https://taamenn.com/sitemap.xml` and referenced by `public/robots.txt`.

`src/config/publicRoutes.ts` is the canonical path list through `PUBLIC_SITEMAP_PATHS`.

Whenever a public standalone page is added or removed, update all of the following in the same change:

1. `PUBLIC_SITEMAP_PATHS` in `src/config/publicRoutes.ts`.
2. The corresponding `<url><loc>...</loc></url>` entry in `public/sitemap.xml`.
3. The expected canonical list in `src/config/publicRoutes.test.ts`.

Only list public standalone URLs. Do not list the local/hash-based app sections, private/local account areas, `/api/*`, or tokenized `/share/*` URLs. Recheck this policy when adding any new standalone route.
