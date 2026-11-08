import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, BookOpen, Bot, X, type LucideIcon, Home, Swords, CalendarDays, ListChecks, Goal, ChartNoAxesCombined, Settings2 } from 'lucide-react';
import type { RouteId } from '../config/routes';
import { localeDirection, type LocaleCode } from '../i18n/languages';
import { FIRST_VISIT_COPY, type FirstVisitStepId } from '../i18n/localeCopy';
import '../styles/first-visit-experience.css';

interface TourStep {
  id: FirstVisitStepId;
  route: RouteId;
  target: string;
  icon: LucideIcon;
}

/** The targets are stable data-tour hooks attached to real product elements. */
const steps: TourStep[] = [
  { id: 'home', route: 'home', target: 'home', icon: Home },
  { id: 'tactical', route: 'tactical', target: 'tactical', icon: Swords },
  { id: 'matches', route: 'match-center', target: 'matches', icon: CalendarDays },
  { id: 'archive', route: 'archive', target: 'archive', icon: ListChecks },
  { id: 'stadiums', route: 'stadiums', target: 'stadiums', icon: Goal },
  { id: 'analytics', route: 'analytics', target: 'analytics', icon: ChartNoAxesCombined },
  { id: 'settings', route: 'settings', target: 'settings', icon: Settings2 },
  { id: 'assistant', route: 'assistant', target: 'assistant', icon: Bot },
];

const PROGRESS_KEY = 'taamen-tour-progress-v2';
const WELCOME_KEY = 'taamen-onboarding-v1';
const COMPLETED_KEY = 'taamen-tour-completed-v1';

type TourMode = 'prompt' | 'tour' | 'complete' | null;
type TargetRect = { x: number; y: number; width: number; height: number; radius: number };

function readSavedProgress(): number | null {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed >= 0 && parsed < steps.length ? parsed : null;
  } catch { return null; }
}

function saveProgress(index: number) {
  try { localStorage.setItem(PROGRESS_KEY, String(index)); } catch { /* session can still continue in memory */ }
}

function clearProgress() {
  try { localStorage.removeItem(PROGRESS_KEY); } catch { /* best effort */ }
}

export function FirstVisitExperience({
  language,
  selectedLocale = language === 'ar' ? 'ar' : 'en',
  open,
  onDismiss,
  onNavigate,
}: {
  language: 'ar' | 'en';
  selectedLocale?: LocaleCode;
  open: boolean;
  onDismiss: () => void;
  onNavigate: (route: RouteId) => void;
}) {
  const copy = FIRST_VISIT_COPY[selectedLocale];
  const dir = localeDirection(selectedLocale);
  const ar = selectedLocale === 'ar';
  const [mode, setMode] = useState<TourMode>(() => readSavedProgress() !== null ? 'tour' : null);
  const [index, setIndex] = useState(() => readSavedProgress() ?? 0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [targetMissing, setTargetMissing] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const spotlightId = useId().replace(/:/g, '');
  const step = steps[index];
  const stepCopy = copy.steps[step.id];
  const Icon = step.icon;
  const BackIcon = dir === 'rtl' ? ArrowRight : ArrowLeft;
  const ForwardIcon = dir === 'rtl' ? ArrowLeft : ArrowRight;

  const closeExperience = useCallback(() => {
    setMode(null);
    clearProgress();
    onDismiss();
  }, [onDismiss]);

  const startTour = useCallback(() => {
    setIndex(0);
    saveProgress(0);
    setTargetRect(null);
    setTargetMissing(false);
    setMode('tour');
    try { localStorage.setItem(WELCOME_KEY, 'done'); } catch { /* in-memory continuation */ }
    onDismiss();
    onNavigate('home');
  }, [onDismiss, onNavigate]);

  const move = useCallback((nextIndex: number) => {
    const bounded = Math.max(0, Math.min(steps.length - 1, nextIndex));
    setIndex(bounded);
    saveProgress(bounded);
    setTargetRect(null);
    setTargetMissing(false);
    onNavigate(steps[bounded].route);
  }, [onNavigate]);

  const finishTour = useCallback(() => {
    clearProgress();
    try { localStorage.setItem(COMPLETED_KEY, 'done'); } catch { /* completion stays in memory */ }
    setTargetRect(null);
    setMode('complete');
  }, []);

  // Do not cover the boot skeleton: wait until the real Home tour target has
  // mounted, with a bounded fallback so a missing target cannot block entry.
  useEffect(() => {
    if (!open) return;
    let attempts = 0;
    let timer = 0;
    let cancelled = false;
    const revealWhenHomeIsReady = () => {
      if (cancelled) return;
      const homeReady = Boolean(document.querySelector('[data-tour="home"]'));
      if (homeReady || attempts >= 30) {
        setMode('prompt');
        return;
      }
      attempts += 1;
      timer = window.setTimeout(revealWhenHomeIsReady, 100);
    };
    revealWhenHomeIsReady();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [open]);

  // A tour can be replayed from Settings without reopening the first-visit flow.
  useEffect(() => {
    const restart = () => startTour();
    window.addEventListener('taamen:start-tour', restart);
    return () => window.removeEventListener('taamen:start-tour', restart);
  }, [startTour]);

  // Restore the exact step after a reload and navigate to its real product route.
  useEffect(() => {
    if (mode !== 'tour') return;
    saveProgress(index);
    onNavigate(steps[index].route);
  }, [mode, index, onNavigate]);

  // The welcome/completion cards are modal. During the walkthrough the real
  // page remains visible, so do not inert the application underneath it.
  useEffect(() => {
    if (!mode) return;
    const lockApp = mode === 'prompt' || mode === 'complete';
    const appShell = document.querySelector<HTMLElement>('.app-shell');
    const previousInert = appShell?.inert ?? false;
    if (lockApp && appShell) appShell.inert = true;
    dialogRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeExperience();
        return;
      }
      if (mode === 'tour' && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
        event.preventDefault();
        const forward = dir === 'rtl' ? event.key === 'ArrowLeft' : event.key === 'ArrowRight';
        if (forward && index < steps.length - 1) move(index + 1);
        else if (!forward && index > 0) move(index - 1);
        return;
      }
      if (!lockApp || event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (lockApp && appShell) appShell.inert = previousInert;
    };
  }, [mode, index, dir, move, closeExperience]);

  // Locate the requested target only after route rendering, including lazy
  // page imports. The bounded retry prevents an endless loading/observer loop.
  useEffect(() => {
    if (mode !== 'tour') { setTargetRect(null); return; }
    let cancelled = false;
    let attempts = 0;
    let retryTimer = 0;
    let frame = 0;
    let target: HTMLElement | null = null;

    const measure = () => {
      if (cancelled || !target) return;
      const rect = target.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = Math.max(8, Math.min(window.innerWidth - 16, rect.left - 8));
      const y = Math.max(8, Math.min(window.innerHeight - 16, rect.top - 8));
      setTargetRect({
        x,
        y,
        width: Math.max(1, Math.min(window.innerWidth - x - 8, rect.width + 16)),
        height: Math.max(1, Math.min(window.innerHeight - y - 8, rect.height + 16)),
        radius: 16,
      });
    };
    const locate = () => {
      if (cancelled) return;
      target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (target) {
        target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        frame = window.requestAnimationFrame(() => {
          frame = window.requestAnimationFrame(measure);
        });
        setTargetMissing(false);
        return;
      }
      attempts += 1;
      if (attempts >= 25) {
        setTargetMissing(true);
        setTargetRect(null);
        return;
      }
      retryTimer = window.setTimeout(locate, 120);
    };
    locate();

    const scheduleMeasure = () => {
      if (!target || cancelled) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('scroll', scheduleMeasure, true);
    window.visualViewport?.addEventListener('resize', scheduleMeasure);
    window.visualViewport?.addEventListener('scroll', scheduleMeasure);
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, true);
      window.visualViewport?.removeEventListener('resize', scheduleMeasure);
      window.visualViewport?.removeEventListener('scroll', scheduleMeasure);
    };
  }, [mode, index, step.target]);

  const cardStyle = useMemo<CSSProperties>(() => {
    if (mode !== 'tour' || !targetRect) return {};
    const mobile = window.innerWidth <= 680;
    if (mobile) {
      const targetIsLow = targetRect.y + targetRect.height / 2 > window.innerHeight * 0.55;
      return targetIsLow
        ? { insetInline: 12, top: 'calc(12px + env(safe-area-inset-top))', bottom: 'auto' }
        : { insetInline: 12, bottom: 'calc(12px + env(safe-area-inset-bottom))', top: 'auto' };
    }
    const cardWidth = Math.min(390, window.innerWidth - 32);
    const estimatedHeight = 330;
    const below = targetRect.y + targetRect.height + estimatedHeight + 18 <= window.innerHeight;
    const top = below ? targetRect.y + targetRect.height + 18 : Math.max(14, targetRect.y - estimatedHeight - 18);
    const left = Math.max(16, Math.min(targetRect.x, window.innerWidth - cardWidth - 16));
    return { top, left, width: cardWidth };
  }, [mode, targetRect]);

  if (!mode) return null;

  const progressOverlay = targetRect && mode === 'tour' ? (
    <svg className="first-visit-spotlight-svg" width="100%" height="100%" viewBox={`0 0 ${Math.max(1, window.innerWidth)} ${Math.max(1, window.innerHeight)}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <mask id={spotlightId} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
          <rect x="0" y="0" width={Math.max(1, window.innerWidth)} height={Math.max(1, window.innerHeight)} fill="white"/>
          <rect x={targetRect.x} y={targetRect.y} width={targetRect.width} height={targetRect.height} rx={targetRect.radius} fill="black"/>
        </mask>
      </defs>
      <rect x="0" y="0" width={Math.max(1, window.innerWidth)} height={Math.max(1, window.innerHeight)} fill="rgba(2, 9, 15, .76)" mask={`url(#${spotlightId})`}/>
      <rect x={targetRect.x} y={targetRect.y} width={targetRect.width} height={targetRect.height} rx={targetRect.radius} fill="none" stroke="rgba(193,232,255,.95)" strokeWidth="2" className="first-visit-spotlight-ring"/>
    </svg>
  ) : mode === 'tour' ? <div className="first-visit-tour-dim" aria-hidden="true"/> : <div className="first-visit-tour-dim" aria-hidden="true"/>;

  return createPortal(
    <div className={`first-visit-overlay is-${mode}`} role="presentation">
      {mode === 'prompt' ? <button type="button" className="first-visit-backdrop" aria-label={ar ? 'إغلاق نافذة الترحيب' : 'Close welcome dialog'} onClick={closeExperience}/> : progressOverlay}

      {mode === 'prompt' && (
        <section ref={dialogRef} className="first-visit-card first-visit-prompt" role="dialog" aria-modal="true" aria-labelledby="first-visit-title" dir={dir} lang={selectedLocale}>
          <button type="button" className="first-visit-close" onClick={closeExperience} aria-label={copy.close}><X size={18}/></button>
          <div className="first-visit-brand-mark"><BookOpen size={22}/></div>
          <p className="first-visit-eyebrow">{copy.eyebrow}</p>
          <h2 id="first-visit-title">{copy.welcomeTitle}</h2>
          <p className="first-visit-copy">{copy.welcomeDescription}</p>
          <div className="first-visit-actions">
            <button type="button" className="first-visit-primary" onClick={startTour}>{copy.startTour}<ForwardIcon size={16}/></button>
            <button type="button" className="first-visit-secondary" onClick={closeExperience}>{copy.continueGuest}</button>
          </div>
        </section>
      )}

      {mode === 'tour' && (
        <section ref={dialogRef} className={`first-visit-card first-visit-tour${targetMissing ? ' is-target-missing' : targetRect && window.innerWidth <= 680 && targetRect.y + targetRect.height / 2 > window.innerHeight * 0.55 ? ' is-top-placement' : ''}`} style={cardStyle} role="region" aria-live="polite" aria-labelledby="first-visit-title" dir={dir} lang={selectedLocale}>
          <header className="first-visit-tour-header">
            <div className="first-visit-step-count">{copy.stepLabel(index + 1, steps.length)}</div>
            <button type="button" className="first-visit-close" onClick={closeExperience} aria-label={copy.close}><X size={18}/></button>
          </header>
          <div className="first-visit-progress" aria-label={copy.stepLabel(index + 1, steps.length)}>
            {steps.map((item, itemIndex) => <span key={item.id} className={itemIndex <= index ? 'is-complete' : ''}/>) }
          </div>
          <div className="first-visit-tour-icon"><Icon size={24}/></div>
          <p className="first-visit-eyebrow">{copy.tourEyebrow}</p>
          <h2 id="first-visit-title">{stepCopy.title}</h2>
          <p className="first-visit-copy">{stepCopy.description}</p>
          <div className="first-visit-hint"><span>{copy.quickTip}</span><p>{stepCopy.hint}</p></div>
          {targetMissing && <p className="first-visit-target-note" role="status">{copy.targetMissing}</p>}
          <footer className="first-visit-tour-actions">
            <button type="button" className="first-visit-secondary" onClick={() => move(index - 1)} disabled={index === 0}><BackIcon size={15}/>{copy.previous}</button>
            <button type="button" className="first-visit-secondary first-visit-skip" onClick={closeExperience}>{copy.skip}</button>
            {index < steps.length - 1 ? (
              <button type="button" className="first-visit-primary" onClick={() => move(index + 1)}>{copy.next}<ForwardIcon size={15}/></button>
            ) : (
              <button type="button" className="first-visit-primary" onClick={finishTour}>{copy.finish}<Bot size={16}/></button>
            )}
          </footer>
        </section>
      )}

      {mode === 'complete' && (
        <section ref={dialogRef} className="first-visit-card first-visit-complete" role="dialog" aria-modal="true" aria-labelledby="first-visit-title" dir={dir} lang={selectedLocale}>
          <button type="button" className="first-visit-close" onClick={closeExperience} aria-label={copy.close}><X size={18}/></button>
          <div className="first-visit-brand-mark"><Bot size={24}/></div>
          <p className="first-visit-eyebrow">TAAMEN / READY TO PLAY</p>
          <h2 id="first-visit-title">{copy.completeTitle}</h2>
          <p className="first-visit-copy">{copy.completeDescription}</p>
          <p className="first-visit-ai-description">{copy.assistantDescription}</p>
          <div className="first-visit-actions">
            <button type="button" className="first-visit-primary" onClick={() => { onNavigate('assistant'); closeExperience(); }}>{copy.assistantCta}<Bot size={16}/></button>
            <button type="button" className="first-visit-secondary" onClick={closeExperience}>{copy.close}</button>
          </div>
        </section>
      )}
    </div>,
    document.body,
  );
}

export const FIRST_VISIT_TOUR_ROUTES = steps.map((step) => step.route);
