import type { UiLocale } from './api';

export interface Formatters {
  number: (n: number) => string;
  money: (n: number) => string;
  percent: (n: number | null) => string;
  /** `YYYY-MM-DD` (or an ISO timestamp) as a short calendar date. */
  date: (iso: string | null) => string;
  /** `YYYY-MM-DD` as day and month only, for chart axes. */
  dayMonth: (iso: string) => string;
  dateTime: (iso: string) => string;
}

const INTL_LOCALE: Record<UiLocale, string> = { en: 'en-GB', ru: 'ru-RU' };
const cache = new Map<UiLocale, Formatters>();

/** Number and date formatting for the UI language; built once per locale. */
export function formatters(locale: UiLocale): Formatters {
  const cached = cache.get(locale);
  if (cached) return cached;
  const tag = INTL_LOCALE[locale];
  // English keeps the US digit grouping the app has always shown.
  const number = new Intl.NumberFormat(locale === 'en' ? 'en-US' : tag);
  const money = new Intl.NumberFormat(locale === 'en' ? 'en-US' : tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const percent = new Intl.NumberFormat(tag, { style: 'percent', maximumFractionDigits: 0 });
  const day = new Intl.DateTimeFormat(tag, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const short = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const date = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? iso : day.format(d);
  };
  const out: Formatters = {
    number: (n) => number.format(n),
    money: (n) => money.format(n),
    percent: (n) => (n === null ? '—' : percent.format(n)),
    date,
    dayMonth: (iso) => {
      const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
      return Number.isNaN(d.getTime()) ? iso : short.format(d);
    },
    dateTime: (iso) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? iso : `${day.format(d)} ${d.toISOString().slice(11, 16)} UTC`;
    },
  };
  cache.set(locale, out);
  return out;
}
