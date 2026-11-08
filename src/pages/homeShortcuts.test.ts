import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const page = fs.readFileSync(fileURLToPath(new URL('./Home.tsx', import.meta.url)), 'utf8');

test('Home selects one random metric per browser visit and has Stadiums, Tactical Board, and Analytics shortcuts', () => {
  assert.match(page, /const choices: HomeRandomMetric\[\] = \['archive','decided','draws'\]/);
  assert.match(page, /taamen-home-random-metric-v1/);
  assert.match(page, /taamen-home-metric-visit-v1/);
  assert.match(page, /currentVisitMetric/);
  assert.match(page, /home-random-metric/);
  assert.match(page, /go\('stadiums'\)/);
  assert.match(page, /go\('tactical'\)/);
  assert.match(page, /go\('analytics'\)/);
  assert.match(page, /className="home-ai-card"/);
  assert.match(page, /TAAMEN AI/);
  assert.match(page, /BETA/);
  assert.match(page, /go\('assistant'\)/);
  assert.doesNotMatch(page, /campaign-card|TAAMEN CHALLENGE|isCampaignActive/);
  assert.equal((page.match(/stat-card/g) || []).length, 4);
  assert.doesNotMatch(page, /home-shortcut-(archive|decided|draws)/);
});
