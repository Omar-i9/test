import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./App.tsx', import.meta.url), 'utf8');

test('a first-time visitor enters the product shell instead of being forced into AuthEntry', () => {
  assert.match(source, /First contact is always guest-first/);
  assert.match(source, /localStorage\.setItem\('taamen-entry-mode','guest'\)/);
  assert.match(source, /setShowAuthEntry\(false\)/);
  assert.match(source, /setShowFirstVisitPrompt\(!sharePath&&localStorage\.getItem\('taamen-onboarding-v1'\)!=='done'\)/);
});

test('the first-visit welcome is separate from authentication and uses the selected locale', () => {
  assert.match(source, /localStorage\.setItem\('taamen-onboarding-v1','done'\)/);
  assert.match(source, /<FirstVisitExperience language=\{language\} selectedLocale=\{selectedLocale\} open=\{showFirstVisitPrompt\}/);
  assert.match(source, /<AuthEntry language=\{language\}/);
});

test('desktop and mobile navigation use the selected locale route labels', () => {
  assert.match(source, /getLocalizedRouteLabel\(r\.id,selectedLocale,r\.label\[language\]\)/);
  assert.match(source, /aria-label=\{labels\[r\.id\]\}/);
  assert.match(source, /<span>\{labels\[r\.id\]\}<\/span>/);
  assert.match(source, /getLocalizedSectionLabel\(sectionKey as 'core'\|'football'\|'personal'\|'system',selectedLocale\)/);
});
