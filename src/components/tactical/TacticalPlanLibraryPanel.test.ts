import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panelSource = readFileSync(new URL('./TacticalPlanLibraryPanel.tsx', import.meta.url), 'utf8');
const boardSource = readFileSync(new URL('../../pages/TacticalBoard.tsx', import.meta.url), 'utf8');
const previewSource = readFileSync(new URL('./TacticalPlanMiniPreview.tsx', import.meta.url), 'utf8');

test('the complete plan library is collapsed by default and exposes an accessible disclosure control', () => {
  assert.match(panelSource, /const \[sectionExpanded, setSectionExpanded\] = useState\(false\)/);
  assert.match(panelSource, /className="tactical-library-section-toggle"[\s\S]*?aria-expanded=\{sectionExpanded\}[\s\S]*?aria-controls=\{contentId\}[\s\S]*?setSectionExpanded\(\(value\) => !value\)/);
  assert.match(panelSource, /className="tactical-library-content" hidden=\{!sectionExpanded\}/);
});

test('saved plan rows are collapsed to their title and expand one plan preview at a time', () => {
  assert.match(panelSource, /const \[expandedPlanId, setExpandedPlanId\] = useState<string \| null>\(null\)/);
  assert.match(panelSource, /className="tactical-library-entry-toggle"[\s\S]*?aria-expanded=\{expanded\}[\s\S]*?onClick=\{\(\) => toggleEntry\(entry\.id\)\}/);
  assert.match(panelSource, /<span className="tactical-library-entry-title" title=\{entry\.title\}>\{entry\.title\}<\/span>/);
  assert.match(panelSource, /className="tactical-library-entry-content" hidden=\{!expanded\}/);
  assert.match(panelSource, /<TacticalPlanMiniPreview plan=\{entry\.document\}/);
});

test('expanded plan actions are wired to replace, rename, and delete handlers', () => {
  assert.match(panelSource, /onClick=\{\(\) => void loadEntry\(entry\)\}/);
  assert.match(panelSource, /onClick=\{\(\) => beginRename\(entry\)\}/);
  assert.match(panelSource, /onClick=\{\(\) => void deleteEntry\(entry\)\}/);
  assert.match(panelSource, /استبدال المسودة الحالية/);
  assert.match(panelSource, /حذف/);
  assert.match(panelSource, /window\.confirm\(/);
});

test('a cloud plan can be replaced by the current matching-format draft only after explicit confirmation', () => {
  assert.match(panelSource, /const replaceSavedEntry = async \(entry: TacticalPlanLibraryEntry\)/);
  assert.match(panelSource, /currentPlan\.metadata\.gameFormat !== entry\.gameFormat/);
  assert.match(panelSource, /window\.confirm\([\s\S]*?Replace the saved cloud plan/);
  assert.match(panelSource, /updateTacticalPlanInLibrary\(repository, entry, replacement\)/);
  assert.match(panelSource, /id: entry\.id/);
  assert.match(panelSource, /createdAt: entry\.createdAt/);
  assert.match(panelSource, /Replace saved/);
  assert.match(panelSource, /revision: \$\{updated\.revision\}/);
});

test('the board confirms before replacing a local draft and persists before changing visible state', () => {
  assert.match(boardSource, /const openLibraryPlan = async \(document: TacticalPlanDocument\): Promise<boolean>/);
  assert.match(boardSource, /window\.confirm\([\s\S]*?سيستبدل مسودة/);
  assert.match(boardSource, /await persist\(restored\.players, restored\.drawings/);
  assert.ok(boardSource.indexOf('await persist(restored.players, restored.drawings') < boardSource.indexOf('setPlayers(restored.players)', boardSource.indexOf('const openLibraryPlan')));
  assert.match(boardSource, /onLoadPlan=\{openLibraryPlan\}/);
});

test('mini preview renders route arrowheads and every supported drawing category', () => {
  assert.match(previewSource, /markerEnd=\{`url\(#\$\{markerPrefix\}-arrow-\$\{drawing\.kind\}\)`\}/);
  for (const kind of ['pass', 'run', 'press', 'curve', 'multiCurve', 'zone']) {
    assert.match(previewSource, new RegExp(`${kind}:`));
  }
});

test('saved plans render in their stable server-assigned slot rather than shifting after a deletion', () => {
  assert.match(panelSource, /const slotNumber = index \+ 1/);
  assert.match(panelSource, /visibleEntries\.find\(\(item\) => item\.slotNumber === slotNumber\)/);
  assert.match(panelSource, /String\(slotNumber\)\.padStart\(2, '0'\)/);
});

test('five slots stay visible per format and the plus button adds the current tactic through the cloud repository', () => {
  assert.match(panelSource, /Array\.from\(\{ length: MAX_TACTICAL_LIBRARY_PLANS_PER_FORMAT \}/);
  assert.match(panelSource, /className="tactical-library-add-current"[\s\S]*?onClick=\{\(\) => void saveCurrent\(\)\}/);
  assert.match(panelSource, /saveTacticalPlanToLibrary\(repository, entries, currentPlan, generatedTitle, slotNumber\)/);
  assert.match(panelSource, /className="tactical-library-slot-save"[\s\S]*?saveCurrent\(slotNumber\)/);
  assert.match(panelSource, /إضافة التكتيك الحالي/);
  assert.match(panelSource, /All five slots for this format are full/);
  assert.match(panelSource, /That slot was just claimed/);
});

test('local profiles are not silently given a persistent local plan library', () => {
  assert.match(panelSource, /إضافة الخطط وحفظها الدائم يتطلبان حساباً سحابياً موثقاً/);
  assert.match(panelSource, /الملف المحلي يحفظ مسودة العمل الحالية على هذا الجهاز فقط/);
  assert.doesNotMatch(panelSource, /from ['"]\.\.\/\.\.\/services\/localDb/);
});

test('library empty slots remain visible while account-only persistence is unavailable', () => {
  assert.match(panelSource, /className="tactical-library-slot is-empty"/);
  assert.match(panelSource, /className="tactical-library-locked"/);
  assert.match(panelSource, /قريباً/);
});
