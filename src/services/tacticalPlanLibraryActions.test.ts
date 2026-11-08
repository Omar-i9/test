import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTacticalPlanLibraryEntry,
  renameTacticalPlanLibraryEntry,
  type TacticalPlanLibraryEntry,
} from '../domain/tactics/tacticalPlanLibrary.ts';
import { serializeTacticalPlan, type TacticalPlanDocument, type TacticalPlanGameFormat } from '../domain/tactics/tacticalPlanSchema.ts';
import {
  deleteTacticalPlanFromLibrary,
  openTacticalPlanFromLibrary,
  renameTacticalPlanInLibrary,
  saveTacticalPlanToLibrary,
  updateTacticalPlanInLibrary,
} from './tacticalPlanLibraryActions.ts';
import type { TacticalPlanLibraryRepository } from './tacticalPlanLibraryRepository.ts';

function createDocument(format: TacticalPlanGameFormat, title = `Draft ${format}`) {
  const sideSize = format === '5v5' ? 5 : 7;
  const players = (['home', 'away'] as const).flatMap((team) => Array.from({ length: sideSize }, (_, index) => ({
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
    notes: 'Full plan test note',
    players,
    drawings: [{ id: 'pass-1', kind: 'pass', x1: 90, y1: 120, x2: 520, y2: 290 }],
  }, new Date('2026-11-04T12:00:00.000Z'));
}

class MemoryPlanRepository implements TacticalPlanLibraryRepository {
  private readonly plans = new Map<string, TacticalPlanLibraryEntry>();
  private sequence = 0;

  async list(format: TacticalPlanGameFormat) {
    return [...this.plans.values()].filter((entry) => entry.gameFormat === format).sort((a, b) => a.slotNumber - b.slotNumber);
  }

  async get(input: { id: string }) {
    const entry = this.plans.get(input.id);
    if (!entry) throw new Error('not found');
    return entry;
  }

  async create(input: { document: TacticalPlanDocument; title: string; slotNumber?: number }) {
    this.sequence += 1;
    const format = input.document.metadata.gameFormat;
    const occupied = new Set([...this.plans.values()].filter((entry) => entry.gameFormat === format).map((entry) => entry.slotNumber));
    const slotNumber = input.slotNumber ?? [1, 2, 3, 4, 5].find((slot) => !occupied.has(slot));
    if (slotNumber === undefined) throw new Error('capacity reached');
    if (!Number.isInteger(slotNumber) || slotNumber < 1 || slotNumber > 5) throw new Error('invalid slot');
    if (occupied.has(slotNumber)) throw new Error('slot occupied');
    const entry = createTacticalPlanLibraryEntry(
      input.document,
      `cloud-${this.sequence}`,
      input.title,
      new Date(`2026-11-04T12:0${this.sequence}:00.000Z`),
      { slotNumber, revision: 1 },
    );
    this.plans.set(entry.id, entry);
    return entry;
  }

  async update(input: { id: string; format: TacticalPlanGameFormat; document: TacticalPlanDocument; expectedRevision: number }) {
    const existing = this.plans.get(input.id);
    if (!existing || existing.gameFormat !== input.format) throw new Error('not found');
    if (existing.revision !== input.expectedRevision) throw new Error('revision conflict');
    const now = new Date('2026-11-04T15:00:00.000Z');
    const created = createTacticalPlanLibraryEntry(
      { ...input.document, id: existing.id, metadata: { ...input.document.metadata, createdAt: existing.createdAt } },
      existing.id,
      input.document.metadata.title,
      now,
      { slotNumber: existing.slotNumber, revision: existing.revision + 1 },
    );
    const entry = {
      ...created,
      createdAt: existing.createdAt,
      document: { ...created.document, metadata: { ...created.document.metadata, createdAt: existing.createdAt } },
    };
    this.plans.set(entry.id, entry);
    return entry;
  }

  async rename(input: { id: string; format: TacticalPlanGameFormat; title: string; expectedRevision: number }) {
    const existing = this.plans.get(input.id);
    if (!existing || existing.gameFormat !== input.format) throw new Error('not found');
    if (existing.revision !== input.expectedRevision) throw new Error('revision conflict');
    const updated = renameTacticalPlanLibraryEntry(
      existing,
      input.title,
      new Date('2026-11-04T15:00:00.000Z'),
      { slotNumber: existing.slotNumber, revision: existing.revision + 1 },
    );
    this.plans.set(updated.id, updated);
    return updated;
  }

  async delete(input: { id: string; format: TacticalPlanGameFormat; expectedRevision: number }) {
    const existing = this.plans.get(input.id);
    if (!existing || existing.gameFormat !== input.format) throw new Error('not found');
    if (existing.revision !== input.expectedRevision) throw new Error('revision conflict');
    this.plans.delete(input.id);
  }

  peek(id: string) { return this.plans.get(id); }
}

test('save action persists the complete draft and receives a server-assigned slot/revision', async () => {
  const repository = new MemoryPlanRepository();
  const draft = createDocument('5v5', 'Wide overload');
  const saved = await saveTacticalPlanToLibrary(repository, [], draft, '  Wide overload  ');
  assert.equal(saved.title, 'Wide overload');
  assert.equal(saved.gameFormat, '5v5');
  assert.equal(saved.document.players.length, 10);
  assert.deepEqual(saved.document.drawings, draft.drawings);
  assert.equal(saved.slotNumber, 1);
  assert.equal(saved.revision, 1);
  assert.equal((await repository.list('5v5')).length, 1);
  assert.equal((await repository.list('7v7')).length, 0);
});

test('save action can target an available stable slot and refuses an occupied one', async () => {
  const repository = new MemoryPlanRepository();
  const document = createDocument('5v5', 'Chosen slot');
  const created = await saveTacticalPlanToLibrary(repository, [], document, 'Chosen slot', 4);
  assert.equal(created.slotNumber, 4);
  await assert.rejects(saveTacticalPlanToLibrary(repository, [created], document, 'Collision', 4), /already occupied/);
  await assert.rejects(saveTacticalPlanToLibrary(repository, [], document, 'Invalid', 7), /slot is invalid/);
});

test('five-per-format client capacity stays independent between 5v5 and 7v7', async () => {
  const repository = new MemoryPlanRepository();
  const fiveVFive = createDocument('5v5');
  const existing: TacticalPlanLibraryEntry[] = [];
  for (let index = 0; index < 5; index += 1) {
    existing.push(await saveTacticalPlanToLibrary(repository, existing, fiveVFive, `Plan ${index + 1}`));
  }
  assert.deepEqual(existing.map((entry) => entry.slotNumber), [1, 2, 3, 4, 5]);
  await assert.rejects(saveTacticalPlanToLibrary(repository, existing, fiveVFive, 'Sixth plan'));
  const sevenVSeven = await saveTacticalPlanToLibrary(repository, [], createDocument('7v7'), '7v7 plan');
  assert.equal(sevenVSeven.slotNumber, 1);
});

test('rename increments revision while preserving identity, stable slot, creation date and geometry', async () => {
  const repository = new MemoryPlanRepository();
  const saved = await saveTacticalPlanToLibrary(repository, [], createDocument('7v7'), 'Original');
  const renamed = await renameTacticalPlanInLibrary(repository, saved, 'Compact mid-block');
  assert.equal(renamed.id, saved.id);
  assert.equal(renamed.gameFormat, '7v7');
  assert.equal(renamed.title, 'Compact mid-block');
  assert.equal(renamed.document.metadata.title, 'Compact mid-block');
  assert.equal(renamed.createdAt, saved.createdAt);
  assert.equal(renamed.slotNumber, saved.slotNumber);
  assert.equal(renamed.revision, saved.revision + 1);
  assert.deepEqual(renamed.document.players, saved.document.players);
  assert.deepEqual(renamed.document.drawings, saved.document.drawings);
});

test('update action uses optimistic revision and preserves stable plan identity', async () => {
  const repository = new MemoryPlanRepository();
  const saved = await saveTacticalPlanToLibrary(repository, [], createDocument('5v5', 'Original'), 'Original');
  const nextDocument = createDocument('5v5', 'Updated geometry');
  const updated = await updateTacticalPlanInLibrary(repository, saved, nextDocument);
  assert.equal(updated.id, saved.id);
  assert.equal(updated.slotNumber, saved.slotNumber);
  assert.equal(updated.createdAt, saved.createdAt);
  assert.equal(updated.revision, saved.revision + 1);
  assert.equal(updated.document.metadata.title, 'Updated geometry');
  await assert.rejects(updateTacticalPlanInLibrary(repository, saved, nextDocument), /revision conflict/);
});

test('delete action removes only the selected cloud plan and does not touch the device draft', async () => {
  const repository = new MemoryPlanRepository();
  const first = await saveTacticalPlanToLibrary(repository, [], createDocument('5v5'), 'First');
  const second = await saveTacticalPlanToLibrary(repository, [first], createDocument('5v5'), 'Second');
  const currentDeviceDraft = createDocument('5v5', 'Device draft');
  await deleteTacticalPlanFromLibrary(repository, first);
  assert.equal(repository.peek(first.id), undefined);
  assert.equal(repository.peek(second.id)?.title, 'Second');
  assert.equal(currentDeviceDraft.metadata.title, 'Device draft');
  assert.equal((await repository.list('5v5')).length, 1);
});

test('open action passes a validated canonical document and respects replacement cancellation', async () => {
  const repository = new MemoryPlanRepository();
  const saved = await saveTacticalPlanToLibrary(repository, [], createDocument('5v5'), 'Open me');
  let receivedId = '';
  const opened = await openTacticalPlanFromLibrary(saved, (document) => {
    receivedId = document.id;
    return true;
  });
  assert.equal(opened, true);
  assert.equal(receivedId, saved.id);
  assert.equal(await openTacticalPlanFromLibrary(saved, () => false), false);
});

test('action handlers reject malformed or cross-format repository responses', async () => {
  const wrongFormatRepository: TacticalPlanLibraryRepository = {
    async list() { return []; },
    async get() { throw new Error('not used'); },
    async create(input) {
      return createTacticalPlanLibraryEntry(input.document, 'wrong-format', input.title, new Date('2026-11-04T12:00:00.000Z'), { slotNumber: 1, revision: 1 });
    },
    async update() { throw new Error('not used'); },
    async rename() { throw new Error('not used'); },
    async delete() {},
  };
  const five = createDocument('5v5');
  const invalid = { ...createTacticalPlanLibraryEntry(five, 'wrong-format', 'wrong'), gameFormat: '7v7' };
  wrongFormatRepository.create = async () => invalid as TacticalPlanLibraryEntry;
  await assert.rejects(saveTacticalPlanToLibrary(wrongFormatRepository, [], five, 'Wrong response'));
});
