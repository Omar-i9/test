/**
 * The only analytics integration. Settings owns the boolean; this module owns the script.
 * Analytics off must not insert the tag. A failed insert must not throw into the app.
 */
export const AHREFS_ANALYTICS_SRC = 'https://analytics.ahrefs.com/analytics.js';
export const AHREFS_DATA_KEY = '4wojOaKRBy7p9gr3moQqgQ';
export const AHREFS_SCRIPT_ID = 'taamen-ahrefs';

export type AnalyticsScriptElement = {
  id: string;
  src: string;
  async: boolean;
  dataset: { key?: string };
  onerror: (() => void) | null;
  remove?: () => void;
};

export type AnalyticsDocument = {
  getElementById(id: string): unknown;
  querySelector(selector: string): unknown;
  querySelectorAll(selector: string): ArrayLike<unknown>;
  createElement(tag: string): AnalyticsScriptElement;
  head: { appendChild(node: AnalyticsScriptElement): void; removeChild?(node: AnalyticsScriptElement): void };
};

let started = false;

export function resetAnalyticsForTests(): void {
  started = false;
}

export function analyticsEnabled(record: { analytics?: unknown } | null | undefined): boolean {
  return record?.analytics === true;
}

/** Returns true only when this call inserted the script. */
export function syncAhrefsAnalytics(enabled: boolean, doc?: AnalyticsDocument): boolean {
  const target = doc ?? (typeof document === 'undefined' ? undefined : document as unknown as AnalyticsDocument);
  if (!target) { if (!enabled) started = false; return false; }
  if (!enabled) {
    const existing = target.getElementById(AHREFS_SCRIPT_ID) as AnalyticsScriptElement | null;
    const bySource = target.querySelector(`script[src="${AHREFS_ANALYTICS_SRC}"]`) as AnalyticsScriptElement | null;
    const script = existing || bySource;
    try { if (script?.remove) script.remove(); else if (script) target.head.removeChild?.(script); } catch { /* analytics must never break settings */ }
    started = false;
    return false;
  }
  if (started || target.getElementById(AHREFS_SCRIPT_ID) || target.querySelector(`script[src="${AHREFS_ANALYTICS_SRC}"]`)) {
    started = true;
    return false;
  }
  try {
    const script = target.createElement('script');
    script.id = AHREFS_SCRIPT_ID;
    script.src = AHREFS_ANALYTICS_SRC;
    script.async = true;
    script.dataset.key = AHREFS_DATA_KEY;
    script.onerror = () => {
      try { script.remove?.(); } catch { /* ignore cleanup failure */ }
      started = false;
    };
    target.head.appendChild(script);
    started = true;
    return true;
  } catch {
    return false;
  }
}
