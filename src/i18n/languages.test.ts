import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { contentLanguageForLocale, getLocaleOption, isLocaleCode, localeDirection, parseLocale, LOCALE_OPTIONS } from './languages.ts';

test('language picker exposes the requested seven locales in native script', () => {
  assert.deepEqual(LOCALE_OPTIONS.map(option => option.code), ['ar', 'en', 'es', 'fr', 'de', 'pt', 'tr']);
  assert.deepEqual(LOCALE_OPTIONS.map(option => option.nativeName), ['العربية', 'English', 'Español', 'Français', 'Deutsch', 'Português', 'Türkçe']);
  assert.deepEqual(LOCALE_OPTIONS.filter(option => option.beta).map(option => option.code), ['es', 'fr', 'de', 'pt', 'tr']);
  assert.ok(LOCALE_OPTIONS.every(option => !/[🇦-🇿]/u.test(option.nativeName)));
});

test('locale parsing is safe for old storage values and unknown codes', () => {
  assert.equal(parseLocale('en'), 'en');
  assert.equal(parseLocale('de'), 'de');
  assert.equal(parseLocale('pt'), 'pt');
  assert.equal(parseLocale('tr'), 'tr');
  assert.equal(parseLocale('zh'), 'ar');
  assert.equal(parseLocale('unknown'), 'ar');
  assert.equal(parseLocale(null), 'ar');
  assert.equal(isLocaleCode('tr'), true);
  assert.equal(isLocaleCode('zh'), false);
});

test('locale direction and current legacy-content fallback are explicit', () => {
  assert.equal(contentLanguageForLocale('ar'), 'ar');
  for (const locale of ['en', 'es', 'fr', 'de', 'pt', 'tr'] as const) {
    assert.equal(contentLanguageForLocale(locale), 'en');
    assert.equal(localeDirection(locale), 'ltr');
  }
  assert.equal(localeDirection('ar'), 'rtl');
});

test('public language entry points use the shared native-language picker without country flags', async () => {
  const files = ['../components/AuthEntry.tsx', '../components/PublicSharePreview.tsx', '../pages/LegalDocument.tsx', '../pages/Settings.tsx'];
  const sources = await Promise.all(files.map(file => readFile(new URL(file, import.meta.url), 'utf8')));
  assert.ok(sources.every(source => source.includes('LanguagePicker') || source.includes('selectedLocale=')));
  const shell = await readFile(new URL('../components/ShellControls.tsx', import.meta.url), 'utf8');
  assert.match(shell, /selectedLocale\?: LocaleCode/);
  assert.match(shell, /<LanguagePicker language=\{language\} selectedLocale=\{selectedLocale\}/);
  assert.match(shell, />BETA</);
  assert.doesNotMatch(shell, /BEAT|language-beat|FlagAr|FlagEn|🇵🇸|🇺🇸/);
});

test('each supported locale has welcome and tour copy', async () => {
  const source = await readFile(new URL('./localeCopy.ts', import.meta.url), 'utf8');
  for (const locale of ['ar', 'en', 'es', 'fr', 'de', 'pt', 'tr']) {
    assert.match(source, new RegExp(`\\n  ${locale}: \\{`));
  }
  assert.match(source, /getLocalizedRouteLabel/);
  assert.match(source, /getLocalizedSectionLabel/);
  const app = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(app, /document\.documentElement\.lang=selectedLocale/);
  assert.match(app, /document\.documentElement\.dir=localeDirection\(selectedLocale\)/);
  assert.match(app, /localStorage\.setItem\('taamen-language',selectedLocale\)/);
});
