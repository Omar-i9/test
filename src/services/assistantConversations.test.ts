import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAssistantConversation, titleForAssistantQuestion, limitAssistantMessages,
  PRIMARY_ASSISTANT_ID, MAX_ASSISTANT_MESSAGES, MAX_ASSISTANT_MESSAGE_LENGTH,
} from './assistantConversations.ts';

test('assistant always starts with one stable persistent conversation id', () => {
  const arabic = createAssistantConversation('ar');
  const english = createAssistantConversation('en');
  assert.equal(arabic.id, PRIMARY_ASSISTANT_ID);
  assert.equal(english.id, PRIMARY_ASSISTANT_ID);
  assert.match(arabic.messages[0].text, /TAAMEN AI/);
  assert.match(english.messages[0].text, /TAAMEN AI/i);
});

test('message history is capped and each message is bounded', () => {
  const messages = Array.from({ length: MAX_ASSISTANT_MESSAGES + 8 }, (_, index) => ({
    id: String(index), role: 'user' as const, text: `q${index}`,
  }));
  const bounded = limitAssistantMessages(messages);
  assert.equal(bounded.length, MAX_ASSISTANT_MESSAGES);
  assert.equal(bounded[0].id, '8');
  const tooLong = limitAssistantMessages([{ id: 'x', role: 'user', text: 'x'.repeat(MAX_ASSISTANT_MESSAGE_LENGTH + 10) }]);
  assert.equal(tooLong[0].text.length, MAX_ASSISTANT_MESSAGE_LENGTH);
});

test('conversation titles use the closest known football topic', () => {
  assert.equal(titleForAssistantQuestion('كيف ننظم الضغط الجماعي عند فقدان الكرة؟', 'ar'), 'التكتيك والخطط');
  assert.equal(titleForAssistantQuestion('Summarize my goals and assists', 'en'), 'Goals & performance');
  assert.equal(titleForAssistantQuestion('Which stadium should we use?', 'en'), 'Stadiums');
});

test('conversation titles fall back to a trimmed question', () => {
  assert.equal(titleForAssistantQuestion('  مرحبا   بالمساعد  ', 'ar'), 'مرحبا بالمساعد');
  assert.ok(titleForAssistantQuestion('This is a very long question that should be shortened', 'en').length <= 36);
});
