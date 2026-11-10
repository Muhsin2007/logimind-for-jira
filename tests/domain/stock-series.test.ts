import { describe, expect, it } from 'vitest';
import { buildPipelineIndex, projectCover } from '../../src/domain/cover';
import { demoInventoryCsv, demoShipmentsCsv } from '../../src/domain/demo-data';
import { importCsv } from '../../src/domain/importer';
import { seriesFor, stockSeries } from '../../src/domain/stock-series';

const TODAY = '2026-11-02';

describe('stockSeries', () => {
  it('uses stock at the daily rate and adds arrivals at the start of their day', () => {
    const s = stockSeries({ available: 50, safetyStock: 20, dailyUsage: 10, arrivals: [{ date: '2026-11-05', qty: 40 }] }, TODAY, 7);
    expect(s.points.map((p) => p.level)).toEqual([50, 40, 30, 60, 50, 40, 30, 20]);
    expect(s.points[3]).toMatchObject({ day: 3, date: '2026-11-05', arrival: 40 });
    expect(s.arrivals).toEqual([{ day: 3, date: '2026-11-05', qty: 40 }]);
    expect(s).toMatchObject({ days: 7, safetyStock: 20, dailyUsage: 10, flat: false });
  });

  it('never goes below zero and refills from zero after a stock-out', () => {
    const s = stockSeries({ available: 15, safetyStock: 0, dailyUsage: 10, arrivals: [{ date: '2026-11-06', qty: 30 }] }, TODAY, 6);
    expect(s.points.map((p) => p.level)).toEqual([15, 5, 0, 0, 30, 20, 10]);
  });

  it('agrees with the days-of-cover projection on the stock-out day', () => {
    const input = { available: 47, safetyStock: 10, dailyUsage: 4, arrivals: [{ date: '2026-11-20', qty: 10 }] };
    const cover = projectCover(input, TODAY);
    const s = stockSeries(input, TODAY, 30);
    const out = cover.daysOfCover ?? -1;
    // Stock lasts into the stock-out day and is gone by the start of the next one.
    expect(s.points[out].level).toBeGreaterThan(0);
    expect(s.points[out + 1].level).toBe(0);
  });

  it('ignores overdue and out-of-window arrivals, like the cover projection', () => {
    const s = stockSeries({ available: 10, safetyStock: 5, dailyUsage: 1, arrivals: [{ date: '2026-10-30', qty: 99 }, { date: '2026-12-30', qty: 99 }] }, TODAY, 5);
    expect(s.arrivals).toEqual([]);
    expect(s.points.at(-1)?.level).toBe(5);
  });

  it('is flat without daily usage, still showing arrivals', () => {
    const s = stockSeries({ available: 10, safetyStock: 5, dailyUsage: null, arrivals: [{ date: '2026-11-03', qty: 5 }] }, TODAY, 3);
    expect(s.points.map((p) => p.level)).toEqual([10, 15, 15, 15]);
    expect(s.flat).toBe(true);
    expect(stockSeries({ available: 10, safetyStock: 5, dailyUsage: Number.NaN, arrivals: [] }, TODAY, 2).flat).toBe(true);
  });

  it('starts at zero when stock is already negative and clamps the window', () => {
    const s = stockSeries({ available: -5, safetyStock: 5, dailyUsage: 1, arrivals: [] }, TODAY, 999);
    expect(s.points[0].level).toBe(0);
    expect(s.days).toBe(90);
    expect(stockSeries({ available: 1, safetyStock: 0, dailyUsage: 1, arrivals: [] }, TODAY, 0).days).toBe(1);
  });

  it('seriesFor uses every open inbound shipment to the location (demo SKU-01 @ Samarkand)', () => {
    const s = importCsv(demoShipmentsCsv(TODAY));
    const i = importCsv(demoInventoryCsv(TODAY));
    if (!s.ok || s.kind !== 'shipments' || !i.ok || i.kind !== 'inventory') throw new Error('demo data invalid');
    const item = i.records.find((r) => r.sku === 'SKU-01' && r.warehouse === 'Samarkand');
    if (!item) throw new Error('missing demo item');
    const series = seriesFor(item, buildPipelineIndex(s.records), TODAY, 30);
    // SHP-1011 (100 units) is expected on day 21; stock runs out on day 18 before it lands.
    expect(series.arrivals).toEqual([{ day: 21, date: '2026-11-23', qty: 100 }]);
    expect(series.points[19].level).toBe(0);
    expect(series.points[21].level).toBe(100);
  });
});
