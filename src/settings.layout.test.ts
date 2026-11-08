import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const settingsCss = await readFile(new URL('./styles/global.css', import.meta.url), 'utf8');
const settingsPage = await readFile(new URL('./pages/Settings.tsx', import.meta.url), 'utf8');

test('Settings panels use one vertical content-sized column without equal-height stretching', () => {
  assert.match(settingsPage, /className="settings-grid"/);
  assert.match(settingsCss, /\.settings-page \.settings-grid\{display:flex!important;flex-direction:column!important/);
  assert.match(settingsCss, /height:auto!important/);
  assert.match(settingsCss, /min-height:0!important/);
  assert.doesNotMatch(settingsCss, /\.settings-page \.settings-grid[^}]*align-items:stretch[^}]*grid-template-columns:repeat\(/);
});
