import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('the usage guide covers all primary product areas and the revised Home shortcuts', () => {
  const guide = fs.readFileSync(fileURLToPath(new URL('./HowToGuide.tsx', import.meta.url)), 'utf8');
  for (const token of ['Tactical Board', 'الملعب التكتيكي', 'Analytics', 'التحليلات', 'TAAMEN AI', 'TAAMEN AI']) {
    assert.ok(guide.includes(token), `missing guide topic: ${token}`);
  }
  assert.match(guide, /rotates between archive, decided matches, and draws/i);
  assert.match(guide, /حد أقصى 80 رسالة/);
  assert.match(guide, /Cloudflare Workers AI/);
  assert.match(guide, /Cloudflare/);
  assert.match(guide, /10 questions per installation per day|10 أسئلة يوميًا لكل تثبيت/);
  assert.match(guide, /visualFlows/);
  assert.match(guide, /Finished — result pending|النتيجة معلّقة/);
  assert.match(guide, /Stadiums|الملاعب/);
});

test('usage guide has bilingual section diagrams rather than a repeated list-only visual', () => {
  const guide = fs.readFileSync(fileURLToPath(new URL('./HowToGuide.tsx', import.meta.url)), 'utf8');
  for (const id of ['home', 'matches', 'archive', 'tactical', 'analytics', 'assistant', 'notifications']) {
    assert.match(guide, new RegExp(`${id}:\\s*\\[`));
  }
  assert.match(guide, /guide-visual-step/);
  const hub = fs.readFileSync(fileURLToPath(new URL('../pages/AccountHub.tsx', import.meta.url)), 'utf8');
  assert.match(hub, /account-help-panel/);
  assert.match(hub, /account-tour-primary/);
  assert.match(hub, /account-guide-secondary/);
  assert.ok(hub.indexOf('account-help-panel') < hub.indexOf('account-hub-grid'), 'the unified help panel must appear above the account actions');
  assert.ok(hub.indexOf('account-tour-primary') < hub.indexOf('account-guide-secondary'), 'the interactive tour is the primary action and the guide is secondary');
});
