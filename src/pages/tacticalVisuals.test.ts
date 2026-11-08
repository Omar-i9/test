import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const page = fs.readFileSync(path.join(root, 'src/pages/TacticalBoard.tsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src/styles/tactical-v3.css'), 'utf8');

test('press and run paths keep their own dash patterns without normalized path length', () => {
  assert.match(page, /object\.kind==='run'\?'4 7 15 7':object\.kind==='press'\?'1\.5 7'/);
  assert.match(page, /pathLength=\{object\.kind==='pass'\?'1':undefined\}/);
  assert.match(page, /pathLength=\{tool==='pass'\|\|tool==='curve'\?'1':undefined\}/);
  assert.match(styles, /\.tactical-route\.tactical-route-run\.is-revealing[\s\S]*?taRunAdvance/);
  assert.match(styles, /\.tactical-route\.tactical-route-press\.is-revealing[\s\S]*?taPressPulse/);
});

test('each tactical route has its own visible colour and animation identity', () => {
  for (const token of ['#F5F7FF', '#FFD166', '#FF5CAD', '#C6A5FF', '#56E6FF']) assert.ok(page.includes(token) || styles.includes(token), token);
  assert.match(styles, /@keyframes taRunAdvance/);
  assert.match(styles, /@keyframes taPressPulse/);
  assert.match(styles, /@keyframes taMultiFlow/);
  assert.match(styles, /@keyframes taCurveDraw/);
  assert.match(styles, /@keyframes taPassDraw/);
  assert.match(page, /setAnimatedObjectId\(null\), 900\)/);
});

test('formation discovery is reachable from a gentle pitch overlay prompt', () => {
  assert.match(page, /className="tactical-pitch-feature-nudge"/);
  assert.match(page, /onClick=\{openFormationGuide\}/);
  assert.match(page, /formationPanelRef\.current\?\.scrollIntoView/);
  assert.match(styles, /\.tactical-pitch-feature-nudge/);
  assert.match(styles, /prefers-reduced-motion/);
});


test('V10 arrowheads are larger and their marker tip aligns with the route endpoint', () => {
  assert.match(page, /markerWidth="20" markerHeight="20" refX="18" refY="10"/);
  assert.match(page, /viewBox="0 0 20 20"[^>]*refX="18"/);
  assert.match(page, /M2 2 L18 10 L2 18 Z/);
  assert.match(page, /Marker tip and refX intentionally match/);
});

test('V10 focus mode hides the pitch overlay and keeps a centered scroll-safe toolbar', () => {
  assert.match(styles, /\.tactical-v3-page\.is-focus-mode \.tactical-pitch-overlay-label,[\s\S]*?\.tactical-pitch-feature-nudge \{ display: none !important; \}/);
  assert.match(styles, /\.tactical-v3-page\.is-focus-mode \.tactical-v3-toolbar\.is-focus-toolbar \{[\s\S]*?left: 50%;[\s\S]*?transform: translateX\(-50%\);[\s\S]*?overflow-x: auto;/);
  assert.match(page, /!focusMode && <div className="tactical-pitch-overlay-label"/);
  assert.match(styles, /max-width: calc\(100vw - 20px\);[\s\S]*?flex-wrap: wrap;[\s\S]*?justify-content: center;/);
});
