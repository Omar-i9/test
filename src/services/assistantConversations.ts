import { deleteItem, getAll, getItem, putItem } from './localDb.ts';

export type AssistantMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  context?: 'analytics' | 'play' | 'tactical';
};

export type AssistantConversation = {
  id: string;
  title: string;
  messages: AssistantMessage[];
  createdAt: number;
  updatedAt: number;
};

/** V11 keeps one durable thread. This ID remains stable across route changes and reloads. */
export const PRIMARY_ASSISTANT_ID = 'taamen-assistant-primary-v1';
export const MAX_ASSISTANT_MESSAGES = 80;
export const MAX_ASSISTANT_MESSAGE_LENGTH = 18000;
const LEGACY_TEMP_KEY = 'taamen-assistant-temporary-v1';
const LEGACY_ACTIVE_KEY = 'taamen-assistant-active-v1';

const TOPICS: Array<{ pattern: RegExp; ar: string; en: string }> = [
  { pattern: /تكتيك|تشكيل|خطة|ضغط|تمركز|tactic|formation|press|position/i, ar: 'التكتيك والخطط', en: 'Tactics & formations' },
  { pattern: /هدف|أهداف|صناعة|اسيست|assist|goal|performance|أداء|تحليل/i, ar: 'الأهداف والأداء', en: 'Goals & performance' },
  { pattern: /مباراة|مباريات|نتيجة|سجل|أرشيف|match|result|archive/i, ar: 'المباريات والسجل', en: 'Matches & archive' },
  { pattern: /دفاع|تمركز|defen|defending|marking/i, ar: 'الدفاع والتمركز', en: 'Defending & positioning' },
  { pattern: /ملعب|ملاعب|stadium|venue/i, ar: 'الملاعب', en: 'Stadiums' },
];

export function createAssistantConversation(language: 'ar' | 'en'): AssistantConversation {
  const now = Date.now();
  return {
    id: PRIMARY_ASSISTANT_ID,
    title: language === 'ar' ? 'محادثة TAAMEN' : 'TAAMEN conversation',
    messages: [{
      id: 'welcome',
      role: 'assistant',
      text: language === 'ar'
        ? 'أنا TAAMEN AI، مساعدك لكرة القدم وتحليل بياناتك وشرح وظائف الموقع. فعّل المساعد بعد قراءة الموافقة لبدء المحادثة.'
        : 'I am TAAMEN AI, your football, performance, and app guide. Review the consent notice and enable the assistant to start chatting.',
    }],
    createdAt: now,
    updatedAt: now,
  };
}

export function titleForAssistantQuestion(question: string, language: 'ar' | 'en') {
  const cleaned = question.replace(/\s+/g, ' ').trim();
  if (!cleaned) return language === 'ar' ? 'محادثة TAAMEN' : 'TAAMEN conversation';
  const topic = TOPICS.find(item => item.pattern.test(cleaned));
  if (topic) return language === 'ar' ? topic.ar : topic.en;
  return cleaned.length > 36 ? `${cleaned.slice(0, 35).trimEnd()}…` : cleaned;
}

export function limitAssistantMessages(messages: AssistantMessage[]) {
  return messages.slice(-MAX_ASSISTANT_MESSAGES).map(message => ({
    ...message,
    text: message.text.slice(0, MAX_ASSISTANT_MESSAGE_LENGTH),
  }));
}

function normalizeConversation(value: unknown): AssistantConversation | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<AssistantConversation>;
  if (!Array.isArray(row.messages)) return null;
  const messages = limitAssistantMessages(row.messages.flatMap((message, index): AssistantMessage[] => {
    if (!message || typeof message !== 'object') return [];
    const item = message as Partial<AssistantMessage>;
    if ((item.role !== 'assistant' && item.role !== 'user') || typeof item.text !== 'string') return [];
    return [{
      id: typeof item.id === 'string' ? item.id.slice(0, 100) : `message-${index}`,
      role: item.role,
      text: item.text,
      ...(item.context === 'analytics' || item.context === 'play' || item.context === 'tactical' ? { context: item.context } : {}),
    }];
  }));
  const now = Date.now();
  return {
    id: PRIMARY_ASSISTANT_ID,
    title: typeof row.title === 'string' ? row.title.slice(0, 80) : 'TAAMEN conversation',
    messages: messages.length ? messages : createAssistantConversation('ar').messages,
    createdAt: Number.isFinite(row.createdAt) ? Number(row.createdAt) : now,
    updatedAt: Number.isFinite(row.updatedAt) ? Number(row.updatedAt) : now,
  };
}

function readLegacyTemporary(): AssistantConversation | null {
  try {
    const raw = sessionStorage.getItem(LEGACY_TEMP_KEY);
    if (!raw) return null;
    return normalizeConversation(JSON.parse(raw));
  } catch {
    return null;
  }
}

function readLegacyActiveId() {
  try { return localStorage.getItem(LEGACY_ACTIVE_KEY); } catch { return null; }
}

function clearLegacyPointers() {
  try { localStorage.removeItem(LEGACY_ACTIVE_KEY); } catch { /* storage may be unavailable */ }
  try { sessionStorage.removeItem(LEGACY_TEMP_KEY); } catch { /* storage may be unavailable */ }
}

/**
 * Loads the single persistent conversation. On first run it consolidates the most
 * recently active V9 chat (including a previous temporary chat) into the one
 * permanent thread, then removes the old multi-chat records.
 */
export async function loadAssistantConversation(language: 'ar' | 'en') {
  const existing = normalizeConversation(await getItem<AssistantConversation>('assistant', PRIMARY_ASSISTANT_ID));
  if (existing) {
    const welcome = createAssistantConversation(language).messages[0].text;
    const normalized = {
      ...existing,
      id: PRIMARY_ASSISTANT_ID,
      messages: existing.messages.map(message => message.id === 'welcome' ? { ...message, text: welcome } : message),
    };
    await putItem('assistant', normalized);
    await removeLegacyConversations();
    return normalized;
  }

  const rows = (await getAll<AssistantConversation>('assistant'))
    .map(normalizeConversation)
    .filter((item): item is AssistantConversation => Boolean(item))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const activeId = readLegacyActiveId();
  const legacyTemporary = readLegacyTemporary();
  const selected = activeId === 'temporary'
    ? legacyTemporary || rows[0]
    : rows.find(item => item.id === activeId) || rows[0] || legacyTemporary;
  const welcome = createAssistantConversation(language).messages[0].text;
  const conversation = selected
    ? { ...selected, id: PRIMARY_ASSISTANT_ID, messages: limitAssistantMessages(selected.messages.map(message => message.id === 'welcome' ? { ...message, text: welcome } : message)), updatedAt: Date.now() }
    : createAssistantConversation(language);
  await putItem('assistant', conversation);
  await removeLegacyConversations();
  return conversation;
}

export async function saveAssistantConversation(conversation: AssistantConversation) {
  const normalized = normalizeConversation({ ...conversation, id: PRIMARY_ASSISTANT_ID });
  if (!normalized) throw new Error('Invalid assistant conversation.');
  normalized.updatedAt = Date.now();
  await putItem('assistant', normalized);
  return normalized;
}

/** Clears the only thread and creates a new empty one. */
export async function resetAssistantConversation(language: 'ar' | 'en') {
  await removeLegacyConversations();
  const fresh = createAssistantConversation(language);
  await putItem('assistant', fresh);
  return fresh;
}

async function removeLegacyConversations() {
  const rows = await getAll<AssistantConversation>('assistant');
  await Promise.all(rows.filter(row => row?.id !== PRIMARY_ASSISTANT_ID).map(row => deleteItem('assistant', row.id)));
  clearLegacyPointers();
}
