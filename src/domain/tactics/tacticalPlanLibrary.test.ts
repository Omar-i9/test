import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertTacticalPlanLibraryCapacity,
  createTacticalPlanLibraryEntry,
  MAX_TACTICAL_LIBRARY_PLANS_PER_FORMAT,
  parseTacticalPlanLibraryEntry,
  renameTacticalPlanLibraryEntry,
  selectTacticalPlanLibraryEntries,
  TacticalPlanLibraryError,
  type TacticalPlanLibraryEntry,
} from './tacticalPlanLibrary.ts';
import { serializeTacticalPlan, type TacticalPlanGameFormat } from './tacticalPlanSchema.ts';

function makeDocument(format: TacticalPlanGameFormat, title = `Plan ${format}`) {
  const size = format === '5v5' ? 5 : 7;
  const players = (['home', 'away'] as const).flatMap((team) => Array.from({ length: size }, (_, index) => ({
    id: `${team}-${index + 1}`,
    team,
    number: index + 1,
    name: `${team} ${index + 1}`,
    x: team === 'home' ? 10 + index * 10 : 90 - index * 10,
    y: 10 + index * 11,
  })));
  return serializeTacticalPlan({
    id: `draft-${format}`,
    gameFormat: format,
    formation: format === '5v5' ? '1-2-1' : '2-3-1',
    title,
    notes: 'Library test',
    players,
    drawings: [],
  }, new Date('2026-11-04T12:00:00.000Z'));
}

function makeEntry(format: TacticalPlanGameFormat, index: number, updatedAt: string): TacticalPlanLibraryEntry {
  const document = makeDocument(format, `Plan ${index + 1}`);
  const entry = createTacticalPlanLibraryEntry(
    document,
    `${format}-entry-${index + 1}`,
    `Plan ${index + 1}`,
    new Date(updatedAt),
    { slotNumber: index + 1, revision: 1 },
  );
  return parseTacticalPlanLibraryEntry(entry);
}

test('library keeps the five-plan limit independent for 5v5 and 7v7', () => {
  const five = Array.from({ length: MAX_TACTICAL_LIBRARY_PLANS_PER_FORMAT }, (_, index) => makeEntry('5v5', index, `2026-11-04T12:0${index}:00.000Z`));
  assert.throws(() => assertTacticalPlanLibraryCapacity(five, '5v5'), (error: unknown) => error instanceof TacticalPlanLibraryError && error.code === 'limit-reached');
  assert.doesNotThrow(() => assertTacticalPlanLibraryCapacity(five, '7v7'));
});

test('updating an existing slot does not consume an additional library slot', () => {
  const entries = Array.from({ length: 5 }, (_, index) => makeEntry('7v7', index, `2026-11-04T12:0${index}:00.000Z`));
  assert.doesNotThrow(() => assertTacticalPlanLibraryCapacity(entries, '7v7', entries[2].id));
});

test('library entries preserve the full canonical plan document', () => {
  const source = makeDocument('5v5', 'Build up');
  const entry = createTacticalPlanLibraryEntry(source, 'saved-001', 'Build up', new Date('2026-11-04T15:00:00.000Z'));
  assert.equal(entry.document.id, entry.id);
  assert.equal(entry.document.metadata.title, 'Build up');
  assert.equal(entry.document.metadata.gameFormat, '5v5');
  assert.equal(entry.document.players.length, 10);
  assert.deepEqual(entry.document.drawings, source.drawings);
});

test('library rename updates both the card metadata and canonical document', () => {
  const entry = makeEntry('7v7', 0, '2026-11-04T12:00:00.000Z');
  const renamed = renameTacticalPlanLibraryEntry(entry, 'Compact mid-block', new Date('2026-11-04T15:00:00.000Z'));
  assert.equal(renamed.title, 'Compact mid-block');
  assert.equal(renamed.document.metadata.title, 'Compact mid-block');
  assert.equal(renamed.updatedAt, '2026-11-04T15:00:00.000Z');
  assert.equal(renamed.createdAt, entry.createdAt);
  assert.equal(renamed.slotNumber, entry.slotNumber);
  assert.equal(renamed.revision, entry.revision + 1);
});

test('library rejects empty and overlong names', () => {
  const source = makeDocument('5v5');
  assert.throws(() => createTacticalPlanLibraryEntry(source, 'saved-002', '   '), TacticalPlanLibraryError);
  assert.throws(() => renameTacticalPlanLibraryEntry(makeEntry('5v5', 0, '2026-11-04T12:00:00.000Z'), 'x'.repeat(71)), TacticalPlanLibraryError);
});

test('library rejects reserved object-property identifiers', () => {
  const source = makeDocument('5v5');
  assert.throws(() => createTacticalPlanLibraryEntry(source, '__proto__', 'Unsafe id'), TacticalPlanLibraryError);
  assert.throws(() => createTacticalPlanLibraryEntry(source, 'constructor', 'Unsafe id'), TacticalPlanLibraryError);
});

test('library rejects entries whose card format or id disagrees with the saved plan', () => {
  const entry = makeEntry('5v5', 0, '2026-11-04T12:00:00.000Z');
  assert.throws(() => parseTacticalPlanLibraryEntry({ ...entry, gameFormat: '7v7' }), TacticalPlanLibraryError);
  assert.throws(() => parseTacticalPlanLibraryEntry({ ...entry, id: 'different-id' }), TacticalPlanLibraryError);
});

test('library sorts by stable server slot number without mutating the input array', () => {
  const first = makeEntry('5v5', 0, '2026-11-04T10:00:00.000Z');
  const second = makeEntry('5v5', 1, '2026-11-04T13:00:00.000Z');
  const otherFormat = makeEntry('7v7', 0, '2026-11-04T14:00:00.000Z');
  const input = [second, otherFormat, first];
  const sorted = selectTacticalPlanLibraryEntries(input, '5v5');
  assert.deepEqual(sorted.map((entry) => entry.id), [first.id, second.id]);
  assert.deepEqual(input, [second, otherFormat, first]);
});

test('library rejects invalid stable slots and revisions', () => {
  const entry = makeEntry('5v5', 0, '2026-11-04T12:00:00.000Z');
  assert.throws(() => parseTacticalPlanLibraryEntry({ ...entry, slotNumber: 6 }), TacticalPlanLibraryError);
  assert.throws(() => parseTacticalPlanLibraryEntry({ ...entry, revision: 0 }), TacticalPlanLibraryError);
});
