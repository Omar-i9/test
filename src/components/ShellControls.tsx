import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Moon, Sun } from 'lucide-react';
import { shellCopy } from '../i18n/translations';
import type { TaamenTheme } from '../theme/theme';
import { LOCALE_OPTIONS, type LocaleCode } from '../i18n/languages';

type Language = 'ar' | 'en';

export function LanguageSwitch({
  language,
  onLanguage,
  selectedLocale,
  onLocaleChange,
  className = '',
}: {
  language: Language;
  onLanguage: () => void;
  selectedLocale?: LocaleCode;
  onLocaleChange?: (locale: LocaleCode) => void;
  className?: string;
}) {
  // Public screens share the same native-language picker as Settings whenever
  // the app-level locale state is available. Keep the two-language fallback
  // for isolated legacy embeddings that only provide onLanguage.
  if (selectedLocale && onLocaleChange) {
    return <LanguagePicker language={language} selectedLocale={selectedLocale} onChange={onLocaleChange} className={className}/>;
  }
  const copy = shellCopy[language];
  return (
    <button
      type="button"
      className={`language-switch language-button ${className}`.trim()}
      onClick={onLanguage}
      aria-label={copy.languageSwitch}
    >
      <span className="language-switch-label">{language === 'ar' ? 'English' : 'العربية'}</span>
    </button>
  );
}

export function LanguagePicker({
  language,
  selectedLocale,
  onChange,
  className = '',
}: {
  language: Language;
  selectedLocale: LocaleCode;
  onChange: (locale: LocaleCode) => void;
  className?: string;
}) {
  const ar = language === 'ar';
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = LOCALE_OPTIONS.find((option) => option.code === selectedLocale) ?? LOCALE_OPTIONS[0];

  const updateMenuPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const offsetLeft = viewport?.offsetLeft ?? 0;
    const offsetTop = viewport?.offsetTop ?? 0;
    const width = Math.max(180, Math.min(320, rect.width, viewportWidth - 24));
    const rtl = selected.dir === 'rtl';
    const desiredLeft = rtl ? rect.right - width : rect.left;
    const left = Math.max(offsetLeft + 12, Math.min(desiredLeft, offsetLeft + viewportWidth - width - 12));
    const maxHeight = Math.max(160, Math.min(420, viewportHeight - 24));
    const below = offsetTop + viewportHeight - (rect.bottom + 8);
    const above = rect.top - offsetTop - 8;
    const top = below >= Math.min(260, maxHeight) || below >= above
      ? Math.min(rect.bottom + 8, offsetTop + viewportHeight - maxHeight - 12)
      : Math.max(offsetTop + 12, rect.top - maxHeight - 8);
    setMenuPosition({ top, left, width, maxHeight });
  };

  useLayoutEffect(() => {
    if (!open) { setMenuPosition(null); return; }
    updateMenuPosition();
  }, [open, selectedLocale]);

  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const schedulePosition = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { frame = 0; updateMenuPosition(); });
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', schedulePosition);
    window.addEventListener('scroll', schedulePosition, true);
    window.visualViewport?.addEventListener('resize', schedulePosition);
    window.visualViewport?.addEventListener('scroll', schedulePosition);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', schedulePosition);
      window.removeEventListener('scroll', schedulePosition, true);
      window.visualViewport?.removeEventListener('resize', schedulePosition);
      window.visualViewport?.removeEventListener('scroll', schedulePosition);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [open, selectedLocale]);

  const choose = (locale: LocaleCode) => {
    onChange(locale);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const menu = open && typeof document !== 'undefined' ? createPortal(
    <div
      ref={menuRef}
      className="language-picker-menu language-picker-menu-portaled"
      role="menu"
      aria-label={ar ? 'اللغات المتاحة' : 'Available languages'}
      dir={selected.dir}
      style={{
        position: 'fixed',
        top: menuPosition?.top ?? 0,
        left: menuPosition?.left ?? 0,
        width: menuPosition?.width ?? 180,
        maxHeight: menuPosition?.maxHeight ?? 0,
        visibility: menuPosition ? 'visible' : 'hidden',
      }}
    >
      {LOCALE_OPTIONS.map((option) => (
        <button
          type="button"
          role="menuitemradio"
          aria-checked={selectedLocale === option.code}
          className={`language-picker-option${selectedLocale === option.code ? ' is-selected' : ''}`}
          key={option.code}
          onClick={() => choose(option.code)}
        >
          <span className="language-picker-option-name" lang={option.code} dir={option.dir}>{option.nativeName}</span>
          <span className="language-picker-option-meta">
            {option.beta && <span className="language-beta-badge">BETA</span>}
            {selectedLocale === option.code && <Check size={15} aria-hidden="true"/>}
          </span>
        </button>
      ))}
      {selected.beta && (
        <p className="language-picker-note">
          {ar
            ? 'اللغات الخمس الإضافية في مرحلة BETA. الترحيب والجولة وأسماء التنقل مترجمة؛ بعض صفحات التطبيق القديمة ما زالت تستخدم الإنجليزية إلى حين استكمال مراجعتها.'
            : 'The five additional languages are in BETA. Welcome, tour, and navigation labels are translated; some legacy app pages still use English while their translations are completed and reviewed.'}
        </p>
      )}
    </div>, document.body,
  ) : null;

  return (
    <div className={`language-picker ${className}`.trim()} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="language-picker-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ar ? 'اختيار لغة الواجهة' : 'Choose interface language'}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="language-picker-current" lang={selected.code} dir={selected.dir}>{selected.nativeName}</span>
        {selected.beta && <span className="language-beta-badge">BETA</span>}
        <ChevronDown size={15} aria-hidden="true" className={open ? 'is-open' : ''}/>
      </button>
      {menu}
    </div>
  );
}

export function ThemeToggle({
  theme,
  onTheme,
  language,
  className = '',
}: {
  theme: TaamenTheme;
  onTheme: () => void;
  language: Language;
  className?: string;
}) {
  const copy = shellCopy[language];
  const toLight = theme === 'dark';
  const Icon = toLight ? Sun : Moon;
  return (
    <button
      type="button"
      className={`theme-toggle icon-button ${className}`.trim()}
      onClick={onTheme}
      aria-pressed={!toLight}
      aria-label={toLight ? copy.themeToLight : copy.themeToDark}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
