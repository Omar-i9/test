import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const page = fs.readFileSync(path.join(root, 'src/pages/Analytics.tsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src/styles/analytics.css'), 'utf8');

test('trend chart is the default analytics visualisation', () => {
  assert.match(page, /useState<ChartMode>\('waves'\)/);
  assert.match(page, /chartMode==='waves'\?'is-active'/);
  assert.match(page, /trend lines show your goals and assists/i);
});

test('goals and assists have distinct colours in line and bar modes', () => {
  assert.match(styles, /\.analytics-assist-bar\s*\{[^}]*fill:\s*#9274FF/i);
  assert.match(styles, /\.analytics-legend-dot\.assists\s*\{[^}]*#9274FF/i);
  assert.match(styles, /\.analytics-wave-assists\s*\{[^}]*#9274FF/i);
  assert.match(page, /analytics-wave-goals/);
  assert.match(page, /analytics-wave-assists/);
});

test('trend chart intro plays once on first analytics entry and does not replay on controls', () => {
  assert.doesNotMatch(page, /onPointerEnter=/);
  assert.doesNotMatch(page, /analytics-chart-wrap[^>]*onClick=/);
  assert.match(page, /taamen-analytics-chart-intro-v1/);
  assert.match(page, /analyticsChartIntroSeen/);
  assert.match(page, /setPlayFirstEntryChartMotion\(true\)/);
  assert.doesNotMatch(page, /setChartReplayKey/);
  assert.match(page, /onClick=\{\(\)=>setSelected\(match\)\}/);
  assert.match(page, /pathLength="1" className="analytics-wave-goals"/);
  assert.match(page, /pathLength="1" className="analytics-wave-assists"/);
  assert.match(styles, /@keyframes taAnalyticsFirstEntry/);
  assert.match(styles, /prefers-reduced-motion/);
});
