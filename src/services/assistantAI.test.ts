import assert from 'node:assert/strict';
import test from 'node:test';
import type { Match } from '../data/footballData.ts';
import { buildAssistantAIContext } from './assistantAI.ts';

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 'match-1', type: 'friendly', team1: 'TAAMEN', team2: 'Rivals', score1: 3, score2: 2,
    status: 'COMPLETED_WITH_RESULT', dateLabel: '2026-10-01', dateKey: 20261001, story: '', visibility: 'LOCAL', source: 'local',
    ...overrides,
  };
}

test('AI context includes only completed non-private local matches and omits private or legacy records', () => {
  const context = buildAssistantAIContext([
    match({ id: 'local-1', personalPerformance: { teamSide: 'team1', goals: 2, assists: 1, minutesPlayed: 55, selfAssessment: { passing: 4 }, source: 'user_reported' } }),
    match({ id: 'private-1', visibility: 'PRIVATE' }),
    match({ id: 'legacy-1', source: 'legacy' }),
    match({ id: 'upcoming-1', status: 'UPCOMING' }),
  ]);
  assert.equal(context.totals.completedMatches, 1);
  assert.equal(context.totals.matchesWithPersonalData, 1);
  assert.equal(context.totals.goals, 2);
  assert.equal(context.totals.assists, 1);
  assert.equal(context.totals.minutesPlayed, 55);
  assert.equal(context.recentMatches.length, 1);
  assert.equal(context.recentMatches[0].personal?.selfAssessment?.passing, 4);
});

test('AI context preserves unknown values instead of converting them to zero', () => {
  const context = buildAssistantAIContext([
    match({ personalPerformance: { teamSide: 'team1', goals: null, assists: null, minutesPlayed: null, source: 'user_reported' } }),
  ]);
  assert.equal(context.totals.goals, null);
  assert.equal(context.totals.assists, null);
  assert.equal(context.totals.minutesPlayed, null);
});

test('AI context keeps only the eight most recent completed matches', () => {
  const matches = Array.from({ length: 12 }, (_, index) => match({
    id: `m-${index}`, dateKey: 20260101 + index, dateLabel: String(index),
  }));
  const context = buildAssistantAIContext(matches);
  assert.equal(context.recentMatches.length, 8);
  assert.equal(context.recentMatches[0].date, '11');
});
