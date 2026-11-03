import { describe, expect, it } from 'vitest';
import { en } from '../../static/app/src/i18n/en';
import { plural, ru } from '../../static/app/src/i18n/ru';
import type { RiskEvent } from '../../src/domain/types';

/** Every key path with the kind of value it holds, e.g. `tabs.copilot: string`. */
function shape(value: unknown, path = ''): Record<string, string> {
  if (typeof value === 'function') return { [path]: `function/${value.length}` };
  if (Array.isArray(value)) return { [path]: `array/${value.length}` };
  if (value && typeof value === 'object') {
    return Object.assign({}, ...Object.entries(value).map(([k, v]) => shape(v, path ? `${path}.${k}` : k)));
  }
  return { [path]: typeof value };
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

const risk = (over: Partial<RiskEvent>): RiskEvent => ({
  id: 'X', type: 'LATE_SHIPMENT', severity: 'high', entityType: 'shipment', entityKey: 'SHP-1', title: 'English title',
  evidence: [], ruleVersion: '1', evaluatedOn: '2026-11-02', ...over,
});

describe('UI dictionaries', () => {
  it('have exactly the same keys, value kinds and function arity in English and Russian', () => {
    expect(shape(ru)).toEqual(shape(en));
  });

  it('have no empty text', () => {
    for (const s of [...strings(en), ...strings(ru)]) expect(s.trim()).not.toBe('');
  });

  it('really translate: Russian text is not left in English', () => {
    const same = Object.entries(shape(en))
      .filter(([, kind]) => kind === 'string')
      .map(([path]) => path)
      .filter((path) => {
        const get = (o: unknown) => path.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown>)[k], o);
        return get(en) === get(ru);
      });
    // Codes and abbreviations that are the same in both languages.
    expect(same.every((p) => ['evidence.ETA', 'colEta', 'factEta'].includes(p))).toBe(true);
  });

  it('uses Russian plural forms', () => {
    expect([1, 2, 5, 11, 21, 22, 25, 111].map((n) => plural(n, 'день', 'дня', 'дней'))).toEqual(['день', 'дня', 'дней', 'дней', 'день', 'дня', 'дней', 'дней']);
  });

  it('builds Russian risk titles from structured evidence and falls back to the English title', () => {
    expect(ru.riskTitle(risk({ evidence: [{ label: 'Days late', value: 2 }] }))).toBe('Поставка SHP-1 опаздывает на 2 дня относительно плановой даты');
    expect(ru.riskTitle(risk({ type: 'LOW_STOCK', entityType: 'inventory', entityKey: 'SKU-04@Samarkand', evidence: [{ label: 'Available', value: 0 }] })))
      .toBe('SKU-04 на складе Samarkand: доступного остатка нет');
    expect(ru.riskTitle(risk({ evidence: [] }))).toBe('English title');
    expect(en.riskTitle(risk({}))).toBe('English title');
  });
});
