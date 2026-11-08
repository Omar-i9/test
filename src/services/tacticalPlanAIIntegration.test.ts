import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const boardSource = readFileSync('src/pages/TacticalBoard.tsx', 'utf8');
const assistantSource = readFileSync('src/pages/Assistant.tsx', 'utf8');
const appSource = readFileSync('src/App.tsx', 'utf8');

test('tactical board requires explicit confirmation before preparing an AI handoff', () => {
  assert.match(boardSource, /setShowAIHandoffConfirmation\(true\)/);
  assert.match(boardSource, /aria-labelledby=\"tactical-ai-confirm-title\"/);
  assert.match(boardSource, /onClick=\{confirmAnalyzeCurrentPlanWithAI\}/);
  assert.doesNotMatch(boardSource, /const confirmed = window\.confirm\(ar\s*\?\s*'سيتم إرسال وصف منظم/);
  assert.match(boardSource, /writeTacticalPlanAIHandoff\(currentLibraryPlan\)/);
  assert.match(boardSource, /go\('assistant'\)/);
  assert.match(boardSource, /tactical-ai-analysis-action/);
});

test('AI handoff button stays actionable when a local profile or valid plan is missing', () => {
  assert.match(boardSource, /className="tactical-secondary-action tactical-ai-analysis-action"[\s\S]*?disabled=\{busy\|\|!ready\}/);
  assert.match(boardSource, /if \(!requireWrite\([\s\S]*?\)\) return;/);
  assert.match(boardSource, /if \(!currentLibraryPlan\) \{/);
  assert.match(boardSource, /لم يتم إرسال أي بيانات/);
  assert.match(boardSource, /A local profile is required before using TAAMEN AI/);
});

test('the AI consent dialog is an in-app accessible dialog and closes before routing', () => {
  assert.match(boardSource, /className=\"overlay tactical-ai-confirm-overlay\" role=\"dialog\" aria-modal=\"true\"/);
  assert.match(boardSource, /setShowAIHandoffConfirmation\(false\);\s*go\('assistant'\)/);
  assert.match(boardSource, /Continue to TAAMEN AI/);
});

test('application routes the tactical board to the assistant through the existing router', () => {
  assert.match(appSource, /page==='tactical'[\s\S]*?<TacticalBoard[^>]*go=\{go\}/);
});

test('assistant validates the tab handoff immediately before each request and sends its canonical context', () => {
  assert.match(assistantSource, /const attachedTacticalPlan = pendingTacticalPlan \? readTacticalPlanAIHandoff\(\) : null/);
  assert.match(assistantSource, /context:\{\.\.\.buildAssistantAIContext\(matches\),\.\.\.\(attachedTacticalPlan\?\{tacticalPlan:attachedTacticalPlan\}:\{\}\)\}/);
});

test('tactical attachment remains available for follow-up questions until removed, expired, reset, or AI is disabled', () => {
  assert.match(assistantSource, /readTacticalPlanAIHandoffDetails\(\)/);
  assert.match(assistantSource, /handoff\.expiresAt-Date\.now\(\)/);
  assert.match(assistantSource, /clearTacticalAttachment\(true\)/);
  assert.match(assistantSource, /if\(!canWrite\)\{clearTacticalAttachment\(\);return;\}/);
  assert.match(assistantSource, /removeTacticalAttachment=\(\)=>clearTacticalAttachment\(\)/);
  assert.match(assistantSource, /while it remains attached/i);
  assert.match(assistantSource, /ما دام المرفق موجودًا/);
  assert.match(assistantSource, /حتى 18 رسماً/);
  assert.match(assistantSource, /No pitch screenshot or raw JSON file is sent/);
  assert.match(assistantSource, /drawingSummary\.included/);
});


test('Play Space forwards the app router into its nested tactical board', () => {
  const playCenterSource = readFileSync('src/pages/PlayCenter.tsx', 'utf8');
  assert.match(appSource, /page==='play'[\s\S]*?<PlayCenter[^>]*go=\{go\}/);
  assert.match(playCenterSource, /go: \(page: RouteId\) => void/);
  assert.match(boardSource, /go: \(page: RouteId\) => void/);
  assert.match(playCenterSource, /tab === 'tactical'[\s\S]*?<TacticalBoard[^>]*go=\{go\}/);
});
