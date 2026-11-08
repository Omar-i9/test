import { getItem, putItem } from './localDb.ts';
import type { Match } from '../data/footballData';
import type { TacticalAIPlanContext } from './tacticalPlanAIContext';
import type { LocaleCode } from '../i18n/languages';

const API_BASE = (import.meta.env?.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || '/api';
const CSRF_HEADER = 'X-TAAMEN-Requested';
const AI_CONSENT_ID = 'assistant-ai-consent-v1';
const INSTALLATION_KEY = 'taamen-ai-installation-v1';
const CONSENT_VERSION = 1;

export type AssistantAIQuota = {
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
  globalRemaining?: number;
};

export type AssistantAIMessage = { role: 'user' | 'assistant'; content: string };
export type AssistantAIContext = {
  totals: {
    completedMatches: number;
    matchesWithPersonalData: number;
    goalsEntries: number;
    assistsEntries: number;
    minutesEntries: number;
    goals: number | null;
    assists: number | null;
    minutesPlayed: number | null;
    selfRatings: Record<string, { average: number; count: number }>;
  };
  tacticalPlan?: TacticalAIPlanContext;
  recentMatches: Array<{
    date: string | null;
    teams: [string, string];
    score: [number, number];
    format?: string;
    personal?: { teamSide: 'team1' | 'team2'; goals: number | null; assists: number | null; minutesPlayed?: number | null; selfAssessment?: Record<string, number> };
  }>;
};

export class AssistantAIError extends Error {
  status: number;
  quota?: AssistantAIQuota;
  constructor(status: number, message: string, quota?: AssistantAIQuota) {
    super(message);
    this.name = 'AssistantAIError';
    this.status = status;
    this.quota = quota;
  }
}

function randomId() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getAssistantInstallationId() {
  try {
    const existing = localStorage.getItem(INSTALLATION_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const next = randomId();
    localStorage.setItem(INSTALLATION_KEY, next);
    return next;
  } catch {
    throw new AssistantAIError(0, 'تعذّر حفظ معرّف هذا التثبيت. فعّل تخزين الموقع ثم أعد المحاولة.');
  }
}

export async function hasAssistantAIConsent() {
  const record = await getItem<{ id: string; version: number; accepted: boolean }>('metadata', AI_CONSENT_ID);
  return record?.version === CONSENT_VERSION && record.accepted === true;
}

export async function setAssistantAIConsent(accepted: boolean) {
  await putItem('metadata', { id: AI_CONSENT_ID, version: CONSENT_VERSION, accepted, updatedAt: Date.now() });
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as (T & { error?: string; quota?: AssistantAIQuota }) | null;
  if (!response.ok) {
    throw new AssistantAIError(response.status, payload?.error || 'تعذّر إكمال طلب المساعد. حاول مرة أخرى.', payload?.quota);
  }
  if (!payload || typeof payload !== 'object') throw new AssistantAIError(502, 'وصل رد غير مفهوم من خدمة المساعد.');
  return payload as T;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AssistantAIError(408, 'انتهت مهلة الاتصال بخدمة TAAMEN AI. حاول مرة أخرى.');
    }
    throw new AssistantAIError(0, 'تعذّر الاتصال بخدمة TAAMEN AI. تحقق من الشبكة ثم حاول مرة أخرى.');
  } finally {
    window.clearTimeout(timer);
  }
}

export async function getAssistantAIQuota(installationId: string) {
  const response = await fetchWithTimeout(`${API_BASE}/ai/quota?installationId=${encodeURIComponent(installationId)}`, { credentials: 'same-origin', cache: 'no-store', headers: { [CSRF_HEADER]: '1' } });
  const payload = await readResponse<{ ok: true; quota: AssistantAIQuota }>(response);
  return payload.quota;
}

export async function askAssistantAI(input: {
  installationId: string;
  profileName: string;
  language: LocaleCode;
  messages: AssistantAIMessage[];
  context: AssistantAIContext;
}) {
  const response = await fetchWithTimeout(`${API_BASE}/ai/chat`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: '1' },
    body: JSON.stringify(input),
  });
  return readResponse<{ ok: true; answer: string; quota: AssistantAIQuota }>(response);
}

const ratingLabels: Record<string, string> = {
  defense: 'الدفاع والتمركز', awareness: 'قراءة اللعب', movement: 'التحرك دون كرة',
  passing: 'التمرير', teamwork: 'اللعب الجماعي', effort: 'الجهد واللياقة',
};

export function buildAssistantAIContext(matches: Match[]): AssistantAIContext {
  const completed = matches
    .filter(match => {
      // Keep runtime rejection for old/retired rows even if the current Match
      // type no longer exposes those legacy source labels.
      const metadata = match as unknown as { visibility?: unknown; source?: unknown };
      return metadata.visibility !== 'PRIVATE' && metadata.source !== 'legacy' && metadata.source !== 'featured';
    })
    .filter(match => match.status === 'COMPLETED_WITH_RESULT' || match.status === 'ARCHIVED' || match.status === 'FINISHED' || match.status === 'انتهت')
    .sort((a, b) => (b.dateKey || 0) - (a.dateKey || 0));

  const personalMatches = completed.filter(match => match.personalPerformance && (
    typeof match.personalPerformance.goals === 'number' || typeof match.personalPerformance.assists === 'number' || typeof match.personalPerformance.minutesPlayed === 'number' ||
    Object.values(match.personalPerformance.selfAssessment || {}).some(value => typeof value === 'number')
  ));
  const knownGoals = personalMatches.map(match => match.personalPerformance?.goals).filter((value): value is number => typeof value === 'number');
  const knownAssists = personalMatches.map(match => match.personalPerformance?.assists).filter((value): value is number => typeof value === 'number');
  const knownMinutes = personalMatches.map(match => match.personalPerformance?.minutesPlayed).filter((value): value is number => typeof value === 'number' && value >= 0);
  const ratingValues: Record<string, number[]> = {};
  for (const match of personalMatches) {
    const ratings = match.personalPerformance?.selfAssessment;
    if (!ratings) continue;
    for (const [key, value] of Object.entries(ratings)) {
      if (typeof value === 'number' && value >= 1 && value <= 5) (ratingValues[key] ||= []).push(value);
    }
  }
  const selfRatings = Object.fromEntries(Object.entries(ratingValues).map(([key, values]) => [ratingLabels[key] || key, {
    average: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100) / 100,
    count: values.length,
  }]));
  const recentMatches = completed.slice(0, 8).map(match => {
    const personal = match.personalPerformance;
    const selfAssessment = personal?.selfAssessment
      ? Object.fromEntries(Object.entries(personal.selfAssessment).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] >= 1 && entry[1] <= 5))
      : undefined;
    return {
      date: match.dateISO || match.dateLabel || null,
      teams: [String(match.team1).slice(0, 50), String(match.team2).slice(0, 50)] as [string, string],
      score: [match.score1, match.score2] as [number, number],
      ...(match.matchFormat ? { format: match.matchFormat } : {}),
      ...(personal ? { personal: {
        teamSide: personal.teamSide,
        goals: typeof personal.goals === 'number' ? personal.goals : null,
        assists: typeof personal.assists === 'number' ? personal.assists : null,
        ...(typeof personal.minutesPlayed === 'number' ? { minutesPlayed: personal.minutesPlayed } : {}),
        ...(selfAssessment && Object.keys(selfAssessment).length ? { selfAssessment } : {}),
      } } : {}),
    };
  });

  return {
    totals: {
      completedMatches: completed.length,
      matchesWithPersonalData: personalMatches.length,
      goalsEntries: knownGoals.length,
      assistsEntries: knownAssists.length,
      minutesEntries: knownMinutes.length,
      goals: knownGoals.length ? knownGoals.reduce((sum, value) => sum + value, 0) : null,
      assists: knownAssists.length ? knownAssists.reduce((sum, value) => sum + value, 0) : null,
      minutesPlayed: knownMinutes.length ? knownMinutes.reduce((sum, value) => sum + value, 0) : null,
      selfRatings,
    },
    recentMatches,
  };
}
