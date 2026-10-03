import { EN } from './i18n.en';

export type Lang = 'fr' | 'en';

export const LANGUAGES: { id: Lang; label: string }[] = [
  { id: 'fr', label: 'Français' },
  { id: 'en', label: 'English' },
];

const STORAGE_KEY = 'nutri-lang';

/** The saved choice if there is one, else French for French browsers and English otherwise. */
function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'fr' || saved === 'en') return saved;
  } catch {
    // Storage can be blocked (private mode): fall through to the browser language.
  }
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

/**
 * Language of this page load. It is a constant, not a signal: changing it
 * reloads the app (`setLang`), so module-level labels and `OnPush` templates
 * can call `t()` without subscribing to anything.
 */
export const LANG: Lang = detectLang();

/** For `toLocaleDateString()` and `localeCompare()`. */
export const LOCALE = LANG === 'fr' ? 'fr-FR' : 'en-GB';

if (typeof document !== 'undefined') document.documentElement.lang = LANG;

/** `translate()` for the given language — split from `t()` so it can be tested. */
export function translate(
  lang: Lang,
  fr: string,
  params?: Record<string, string | number>,
): string {
  let text = lang === 'fr' ? fr : (EN[fr] ?? fr);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      text = text.replaceAll(`{${key}}`, String(value));
    }
  }
  return text;
}

/**
 * Translates a French source string — French is the key, gettext-style, and
 * `i18n.en.ts` maps it to English (a missing entry falls back to the French).
 * `{name}` placeholders are filled from `params`. `npm run check:i18n` verifies
 * that every literal passed here has an English entry.
 */
export function t(fr: string, params?: Record<string, string | number>): string {
  return translate(LANG, fr, params);
}

/** Saves the choice and reloads, since `LANG` is read once at startup. */
export function setLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Without storage the choice cannot survive the reload; nothing more to do.
  }
  location.reload();
}
