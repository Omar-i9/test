export type LocaleCode = 'ar' | 'en' | 'es' | 'fr' | 'de' | 'pt' | 'tr';
export type ContentLanguage = 'ar' | 'en';

export interface LocaleOption {
  code: LocaleCode;
  nativeName: string;
  englishName: string;
  dir: 'rtl' | 'ltr';
  beta: boolean;
}

/**
 * The locale list is deliberately language-based, never country-based.
 * Arabic and English are complete application locales. The five additional
 * locales are an explicitly labelled beta while legacy feature copy is being
 * translated and reviewed; the shared onboarding/shell surfaces have native
 * translations and TAAMEN AI receives the selected locale.
 */
export const LOCALE_OPTIONS: readonly LocaleOption[] = [
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic', dir: 'rtl', beta: false },
  { code: 'en', nativeName: 'English', englishName: 'English', dir: 'ltr', beta: false },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish', dir: 'ltr', beta: true },
  { code: 'fr', nativeName: 'Français', englishName: 'French', dir: 'ltr', beta: true },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German', dir: 'ltr', beta: true },
  { code: 'pt', nativeName: 'Português', englishName: 'Portuguese', dir: 'ltr', beta: true },
  { code: 'tr', nativeName: 'Türkçe', englishName: 'Turkish', dir: 'ltr', beta: true },
] as const;

const localeCodes = new Set<string>(LOCALE_OPTIONS.map((option) => option.code));

export function isLocaleCode(value: unknown): value is LocaleCode {
  return typeof value === 'string' && localeCodes.has(value);
}

export function parseLocale(value: string | null | undefined): LocaleCode {
  return isLocaleCode(value) ? value : 'ar';
}

/**
 * Legacy feature modules still expose only Arabic and English copy. Keep that
 * fallback explicit instead of pretending the five beta locales are complete.
 * The localized shell/onboarding/auth surfaces use LocaleCode directly.
 */
export function contentLanguageForLocale(locale: LocaleCode): ContentLanguage {
  return locale === 'ar' ? 'ar' : 'en';
}

export function localeDirection(locale: LocaleCode): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

export function getLocaleOption(locale: LocaleCode): LocaleOption {
  return LOCALE_OPTIONS.find((option) => option.code === locale) ?? LOCALE_OPTIONS[0];
}
