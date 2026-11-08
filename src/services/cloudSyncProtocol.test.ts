import assert from 'node:assert/strict';
import test from 'node:test';
import type { Match } from '../data/footballData';
import type { LocalProfile } from './profileDraft';
import { buildCloudMatchPayload, buildCloudProfilePayload, createCloudDelete, createMatchUpsert, createProfileUpsert } from './cloudSyncProtocol.ts';

const profile: LocalProfile = {
  id: 'current', firstName: 'Omar', lastName: 'Test', email: 'private@example.test',
  phone: '+97000000000', avatarData: 'data:image/png;base64,private', emailVerified: true,
  verifiedAt: 123, updatedAt: 456,
};

const match: Match = {
  id: 'LOCAL-123-test', type: 'friendly', team1: 'TAAMEN', team2: 'Opponent', score1: 2, score2: 1,
  status: 'ARCHIVED', dateLabel: '5 November 2026', dateKey: 20261105, dateISO: '2026-11-05',
  story: 'Local match', visibility: 'LOCAL', source: 'local', createdBy: 'private-user',
  sharedFingerprint: 'private-fingerprint', createdAt: 1, updatedAt: 2,
};

test('cloud profile payload contains only display-name fields', () => {
  assert.deepEqual(buildCloudProfilePayload(profile), {
    id: 'current', firstName: 'Omar', lastName: 'Test',
  });
});

test('cloud match payload drops sharing bookkeeping and normalizes local source', () => {
  const payload = buildCloudMatchPayload(match)!;
  assert.equal(payload.id, match.id);
  assert.equal(payload.source, 'local');
  assert.equal('createdBy' in payload, false);
  assert.equal('sharedFingerprint' in payload, false);
});

test('legacy records are not eligible for cloud synchronization', () => {
  assert.equal(buildCloudMatchPayload({ ...match, source: 'legacy' }), null);
  assert.equal(createMatchUpsert({ ...match, source: 'legacy' }, null, '00000000-0000-4000-8000-000000000001'), null);
});

test('private matches stay local and are never added to the cloud sync payload', () => {
  assert.equal(buildCloudMatchPayload({ ...match, visibility: 'PRIVATE' }), null);
});

test('legacy lifecycle statuses are not sent to the cloud before local normalization', () => {
  assert.equal(buildCloudMatchPayload({ ...match, status: 'LIVE' }), null);
});

test('operation builders carry compare-and-swap revisions and never place owner identity in payload', () => {
  const profileOperation = createProfileUpsert(profile, null, '00000000-0000-4000-8000-000000000002');
  assert.equal(profileOperation.entityId, 'current');
  assert.equal(profileOperation.expectedRevision, null);
  assert.equal('userId' in (profileOperation.payload || {}), false);
  const matchOperation = createMatchUpsert(match, 3, '00000000-0000-4000-8000-000000000003')!;
  assert.equal(matchOperation.expectedRevision, 3);
  assert.equal(matchOperation.payload?.id, match.id);
  const deletion = createCloudDelete('match', match.id, 4, '00000000-0000-4000-8000-000000000004');
  assert.equal(deletion.operation, 'delete');
  assert.equal(deletion.expectedRevision, 4);
  assert.throws(() => createCloudDelete('match', match.id, 0, '00000000-0000-4000-8000-000000000005'));
});
