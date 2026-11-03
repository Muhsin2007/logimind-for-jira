import { describe, expect, it } from 'vitest';
import { COVER_HORIZON_DAYS, projectCover } from '../../src/domain/cover';

const TODAY = '2026-11-02';
const day = (n: number) => new Date(Date.UTC(2026, 10, 2 + n)).toISOString().slice(0, 10);
const project = (available: number, dailyUsage: number | null, arrivals: [number, number][] = [], safetyStock = 0) =>
  projectCover({ available, safetyStock, dailyUsage, arrivals: arrivals.map(([d, qty]) => ({ date: day(d), qty })) }, TODAY);

describe('projectCover', () => {
  it('makes no projection without a positive daily usage', () => {
    for (const usage of [null, 0]) {
      expect(project(10, usage)).toEqual({ dailyUsage: usage, daysOfCover: null, stockOutDate: null, belowSafetyDate: null, beyondHorizon: false });
    }
  });

  it('counts whole days of cover from available stock', () => {
    expect(project(10, 3)).toMatchObject({ daysOfCover: 3, stockOutDate: day(3) });
    expect(project(9, 3)).toMatchObject({ daysOfCover: 3, stockOutDate: day(3) });
    expect(project(10, 2.5)).toMatchObject({ daysOfCover: 4, stockOutDate: day(4) });
  });

  it('is a stock-out today when nothing is available', () => {
    expect(project(0, 5)).toMatchObject({ daysOfCover: 0, stockOutDate: TODAY });
  });

  it('adds inbound stock on its expected arrival date', () => {
    // 10 − 2×3 = 4 left on day 3, +10 arrives → 14 lasts 7 more days.
    expect(project(10, 2, [[3, 10]])).toMatchObject({ daysOfCover: 10, stockOutDate: day(10) });
  });

  it('reports the first stock-out even when a later shipment refills the shelf', () => {
    expect(project(4, 2, [[5, 100]])).toMatchObject({ daysOfCover: 2, stockOutDate: day(2) });
  });

  it('treats an arrival on the day stock reaches zero as just in time', () => {
    expect(project(6, 2, [[3, 6]])).toMatchObject({ daysOfCover: 6, stockOutDate: day(6) });
  });

  it('ignores arrivals before today (overdue: their date is unknown)', () => {
    expect(project(4, 2, [[-1, 100]])).toMatchObject({ daysOfCover: 2 });
  });

  it('dates the first drop below safety stock', () => {
    expect(project(50, 5, [], 30)).toMatchObject({ belowSafetyDate: day(4), stockOutDate: day(10) });
    expect(project(20, 5, [], 30)).toMatchObject({ belowSafetyDate: TODAY });
    expect(project(20, 5, [], 0).belowSafetyDate).toBeNull();
  });

  it('stops at the horizon', () => {
    expect(project(1_000_000, 1)).toMatchObject({ daysOfCover: null, stockOutDate: null, beyondHorizon: true });
    expect(project(COVER_HORIZON_DAYS * 2 - 1, 2)).toMatchObject({ daysOfCover: COVER_HORIZON_DAYS - 1, beyondHorizon: false });
  });

  it('handles fractional usage without floating-point drift', () => {
    expect(project(1, 0.1, [[10, 1]])).toMatchObject({ daysOfCover: 20 });
  });
});
