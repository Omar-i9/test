import assert from 'node:assert/strict';
import test from 'node:test';
import { searchStadiums } from './stadiums.ts';

test('stadium search ranks exact and prefix matches before fuzzy results', () => {
  const results = searchStadiums('Al Qasrawi', 'en');
  assert.ok(results.length > 0);
  assert.equal(results[0].id, 'stadium-qasrawi');
});

test('stadium search supports Arabic normalization and city matches', () => {
  const normalized = searchStadiums('القصرواي', 'ar');
  assert.equal(normalized[0]?.id, 'stadium-qasrawi');
  const city = searchStadiums('الخليل', 'ar');
  assert.equal(city.length, 5);
});

test('stadium search tolerates short typing mistakes without returning every unrelated venue', () => {
  const typo = searchStadiums('Qasraw', 'en');
  assert.equal(typo[0]?.id, 'stadium-qasrawi');
  assert.ok(typo.length < 5);
});
