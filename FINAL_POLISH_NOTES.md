# TAAMEN 2.0 — Final polish handoff

## Scope
This pass modifies the existing `v2` React + TypeScript + Vite application. It does not replace the application architecture, change the product language, deploy to Cloudflare, or introduce the Cloudflare AI integration.

## Implemented

### Tactical board
- Saved plans are keyed independently by board format (`5v5` and `7v7`). Switching formats loads that format's saved plan instead of reusing the other format's state.
- A debounced local autosave persists the title, notes, formation, player positions and tactical drawing objects after edits.
- Existing legacy plan data is migrated into the 5v5 store when applicable.
- Added a focus/fullscreen presentation with a compact floating toolbar, a separately collapsible settings sidebar, and a dedicated exit action.
- The settings sidebar scrolls independently of the pitch. In mobile landscape it becomes an overlay rather than moving the pitch with the page.
- On narrow portrait screens, the board is visually obscured and the user is directed to enter focus mode / rotate the device before interacting.
- Reduced arrowhead size and stroke weight. Pass, run, press, curved and multi-curve tools retain distinct marker shapes and visual styles.
- Multi-curve drawings use a start-to-end reveal animation while retaining the dashed route style.

### Match sharing
- The existing share flow copies the generated URL to the clipboard before opening the native share sheet when supported. A fallback is retained for browsers without Clipboard API access.

### Analytics
- The chart replay is triggered by deliberate period or chart-mode changes, not by casual pointer hover over the chart container.
- Individual match points remain selectable.
- Goals and assists are visually distinguished in both chart modes (lime/green for goals and violet for assists).

### Home performance
- Removed the home page's multi-element entrance/reveal timelines from its runtime path.
- Disabled pointer parallax for the home ambient background and reduced expensive blur/compositing effects on the home route.
- Simplified sidebar and main-content transitions while the home route is active.

### Acquisition page and supplied screenshots
- Added the 11 supplied current product screenshots as optimized local WebP assets under `public/acquisition-assets/`.
- Added a current product screenshot gallery and refreshed the mapped product-shot content to match the supplied images.
- The assistant screenshot is described as a local/offline assistant; the copy does not claim a cloud AI connection that has not been implemented.

### Profile
- Adjusted the avatar-only profile card so the avatar protrudes beyond the card edge rather than being clipped.

## Verification performed
- `npm run typecheck`: passed.
- `npm run test:frontend`: 161 passed, 0 failed.
- `npm run test:backend`: 88 passed, 0 failed.
- `npm run qa:final`: passed. It inspected source/public privacy invariants; no build output was inspected because a production build could not be generated in this environment.

## Production build limitation
`npm run build` could not be confirmed in this environment. The extracted `node_modules` came from a Windows archive and did not contain the Linux-native Rolldown binding (`@rolldown/binding-linux-x64-gnu`). Running Vite directly through Node confirmed the missing native binding. This is an environment/dependency-installation issue; it is not a successful production build.

On the development machine, from the project root, install dependencies for that machine and run the checks:

```bash
npm ci
npm run typecheck
npm run test:frontend
npm run test:backend
npm run build
npm run qa:final
```

Do not copy the extracted `node_modules` directory from this archive or another operating system. The ZIP intentionally excludes `node_modules`, build output, and local secret files.

## Device behavior note
The tactical focus mode uses the browser Fullscreen API and requests landscape orientation where the browser permits it. Orientation locking is not supported by every mobile browser (notably some iOS browser contexts); in those cases the focus layout and portrait guidance remain available, but the browser may not rotate automatically. A real-device pass on Android and iOS is still recommended before production release.

## Not included in this pass
- No Cloudflare deployment or Worker configuration changes.
- No AI provider, API key, or Cloudflare AI binding was added.
- No physical-device visual QA was performed in this environment.
