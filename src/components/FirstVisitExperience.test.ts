import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./FirstVisitExperience.tsx', import.meta.url), 'utf8');
const style = await readFile(new URL('../styles/first-visit-experience.css', import.meta.url), 'utf8');

 test('first-visit experience offers a separate welcome choice for a product tour or guest continuation', () => {
  assert.match(source, /copy\.startTour/);
  assert.match(source, /copy\.continueGuest/);
  assert.match(source, /onClick=\{closeExperience\}/);
  assert.match(source, /WELCOME_KEY/);
  assert.match(source, /homeReady = Boolean\(document\.querySelector\('\[data-tour=\"home\"\]'\)\)/);
  assert.match(source, /attempts >= 30/);
  assert.match(source, /COMPLETED_KEY/);
  assert.match(source, /taamen-tour-progress-v2/);
});

test('guided tour traverses real product routes and ends at the assistant', () => {
  const routeSequence = source.match(/route: '(?:home|match-center|stadiums|tactical|archive|analytics|settings|assistant)'/g) ?? [];
  assert.deepEqual(routeSequence, [
    "route: 'home'", "route: 'tactical'", "route: 'match-center'", "route: 'archive'",
    "route: 'stadiums'", "route: 'analytics'", "route: 'settings'", "route: 'assistant'",
  ]);
  assert.match(source, /onNavigate\('assistant'\)/);
  assert.match(source, /copy\.assistantCta/);
  assert.match(source, /copy\.finish/);
  assert.match(source, /role="dialog" aria-modal="true"/);
});

test('tour uses stable data-tour selectors, bounded lookup, and a measured spotlight cutout', () => {
  assert.match(source, /\[data-tour="\$\{step\.target\}"\]/);
  assert.match(source, /attempts >= 25/);
  assert.match(source, /setTargetMissing\(true\)/);
  assert.match(source, /maskUnits="userSpaceOnUse"/);
  assert.match(source, /first-visit-spotlight-svg/);
  assert.match(style, /\.first-visit-overlay\.is-tour/);
  assert.match(style, /prefers-reduced-motion:reduce/);
  assert.match(style, /first-visit-tour-dim\{background:/);
  assert.match(style, /is-top-placement/);
  assert.match(style, /is-target-missing/);
});

test('tour progress is persisted and restored without conflating welcome and completion state', () => {
  assert.match(source, /readSavedProgress\(\)/);
  assert.match(source, /saveProgress\(bounded\)/);
  assert.match(source, /localStorage\.setItem\(COMPLETED_KEY, 'done'\)/);
  assert.match(source, /window\.addEventListener\('taamen:start-tour'/);
});

test('all eight tour destinations have actual stable targets in their routed pages', async () => {
  const paths = [
    '../pages/Home.tsx', '../pages/TacticalBoard.tsx', '../pages/Matches.tsx', '../pages/Archive.tsx',
    '../pages/Stadiums.tsx', '../pages/Analytics.tsx', '../pages/Settings.tsx', '../pages/Assistant.tsx',
  ];
  const ids = ['home', 'tactical', 'matches', 'archive', 'stadiums', 'analytics', 'settings', 'assistant'];
  const sources = await Promise.all(paths.map(path => readFile(new URL(path, import.meta.url), 'utf8')));
  for (let index = 0; index < ids.length; index += 1) assert.ok(sources[index].includes(`data-tour="${ids[index]}"`), `${ids[index]} target missing`);
});
