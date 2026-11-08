import assert from 'node:assert/strict';
import test from 'node:test';
import { archiveCopy, matchUiCopy } from './translations.ts';

test('archive and match-card labels are defined in Arabic and English', () => {
  const archiveLabels = ['other', 'winner', 'draw', 'goals', 'shots', 'oppShots'] as const;
  const matchUiLabels = ['records'] as const;

  for (const language of ['ar', 'en'] as const) {
    for (const key of archiveLabels) {
      assert.equal(typeof archiveCopy[language][key], 'string', `${language}.${key} must be a string`);
      assert.ok(archiveCopy[language][key].trim().length > 0, `${language}.${key} must not be empty`);
    }
    for (const key of matchUiLabels) {
      assert.equal(typeof matchUiCopy[language][key], 'string', `${language}.${key} must be a string`);
      assert.ok(matchUiCopy[language][key].trim().length > 0, `${language}.${key} must not be empty`);
    }
  }
});
