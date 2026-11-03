import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { UiLocale } from '../api';
import { formatters, type Formatters } from '../format';
import { en, type Messages } from './en';
import { ru } from './ru';

export const MESSAGES: Record<UiLocale, Messages> = { en, ru };
export const LOCALE_NAMES: Record<UiLocale, string> = { en: 'English', ru: 'Русский' };
const STORAGE_KEY = 'logimind.locale';

/** The person's saved choice; English when nothing (valid) is stored or storage is blocked. */
function readLocale(): UiLocale {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const locale: UiLocale = saved === 'ru' ? 'ru' : 'en';
    // Set before the first paint so screen readers start in the right language.
    document.documentElement.lang = locale;
    return locale;
  } catch {
    return 'en';
  }
}

function saveLocale(locale: UiLocale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* Storage may be blocked in the iframe; the choice then lasts for this page only. */
  }
}

interface I18n {
  locale: UiLocale;
  setLocale: (locale: UiLocale) => void;
  t: Messages;
  fmt: Formatters;
}

const I18nContext = createContext<I18n>({ locale: 'en', setLocale: () => undefined, t: en, fmt: formatters('en') });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<UiLocale>(readLocale);
  const setLocale = useCallback((next: UiLocale) => {
    setLocaleState(next);
    saveLocale(next);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo(() => ({ locale, setLocale, t: MESSAGES[locale], fmt: formatters(locale) }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** UI text (`t`), number/date formatting (`fmt`) and the language switch for the current person. */
export const useI18n = () => useContext(I18nContext);
