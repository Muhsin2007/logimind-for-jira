import { describe, expect, it } from 'vitest';
import { buildPipelineIndex } from '../../src/domain/cover';
import { demoInventoryCsv, demoShipmentsCsv } from '../../src/domain/demo-data';
import { importCsv } from '../../src/domain/importer';
import { seriesFor } from '../../src/domain/stock-series';
import {
  forecastArrival,
  MIN_HISTORY,
  reliabilityIndex,
  supplierKey,
  supplierReliability,
  withForecastArrivals,
} from '../../src/domain/supplier-reliability';
import type { InventoryItem, Shipment } from '../../src/domain/types';

const TODAY = '2026-11-10';

function ship(id: string, p: Partial<Shipment>): Shipment {
  return {
    id,
    orderId: null,
    supplier: 'Acme',
    sku: 'SKU-1',
    productName: null,
    qty: 10,
    plannedArrival: '2026-11-01',
    eta: null,
    actualArrival: null,
    status: 'in_transit',
    warehouse: 'Main',
    carrier: null,
    trackingRef: null,
    ...p,
  };
}

/** A delivered shipment `delay` days after its planned date (negative = early). */
const delivered = (id: string, planned: string, delay: number, supplier = 'Acme'): Shipment => {
  const d = new Date(`${planned}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delay);
  const actual = d.toISOString().slice(0, 10);
  return ship(id, { supplier, plannedArrival: planned, eta: actual, actualArrival: actual, status: 'delivered' });
};

describe('supplierReliability', () => {
  it('counts deliveries, on-time rate and the typical (median) delay; early counts as on time', () => {
    const list = supplierReliability(
      [
        delivered('A1', '2026-10-01', 0),
        delivered('A2', '2026-10-05', -2),
        delivered('A3', '2026-10-10', 6),
        delivered('A4', '2026-10-15', 8),
        delivered('A5', '2026-10-20', 7),
      ],
      TODAY,
    );
    expect(list).toHaveLength(1);
    const acme = list[0];
    expect(acme).toMatchObject({ supplier: 'Acme', deliveries: 5, onTime: 2, typicalDelayDays: 6, maxDelayDays: 8, grade: 'unreliable' });
    expect(acme.onTimeRate).toBeCloseTo(0.4);
  });

  it('rounds an even-count median up to whole days', () => {
    const [acme] = supplierReliability(
      [delivered('A1', '2026-10-01', 0), delivered('A2', '2026-10-02', 1), delivered('A3', '2026-10-03', 2), delivered('A4', '2026-10-04', 5)],
      TODAY,
    );
    expect(acme.typicalDelayDays).toBe(2); // median of 0,1,2,5 is 1.5 → 2
  });

  it('grades by on-time rate and marks suppliers with little history as new', () => {
    const many = (supplier: string, lateCount: number) =>
      Array.from({ length: 10 }, (_, i) => delivered(`${supplier}${i}`, '2026-10-01', i < lateCount ? 3 : 0, supplier));
    const byName = reliabilityIndex(
      supplierReliability([...many('Good', 1), ...many('Watch', 2), ...many('Bad', 4), delivered('N1', '2026-10-01', 9, 'Newco')], TODAY),
    );
    expect(byName.get(supplierKey('Good'))?.grade).toBe('reliable'); // 90 %
    expect(byName.get(supplierKey('Watch'))?.grade).toBe('watch'); // 80 %
    expect(byName.get(supplierKey('Bad'))?.grade).toBe('unreliable'); // 60 %
    expect(byName.get(supplierKey('Newco'))).toMatchObject({ deliveries: 1, grade: 'new' });
    expect(MIN_HISTORY).toBe(3);
  });

  it('ignores cancelled shipments and counts open and late (past planned date) ones separately', () => {
    const [acme] = supplierReliability(
      [
        ship('C1', { status: 'cancelled', plannedArrival: '2026-09-01' }),
        ship('O1', { plannedArrival: '2026-11-05' }), // overdue (no ETA, plan passed)
        ship('O2', { plannedArrival: '2026-11-20' }),
        delivered('D1', '2026-10-01', 0),
      ],
      TODAY,
    );
    expect(acme).toMatchObject({ deliveries: 1, openShipments: 2, lateNow: 1, grade: 'new' });
  });

  it('has no rate or delay without deliveries, and sorts the least reliable first', () => {
    const list = supplierReliability(
      [
        ship('X1', { supplier: 'Zed' }),
        ...[0, 0, 0].map((d, i) => delivered(`G${i}`, '2026-10-01', d, 'Good')),
        ...[5, 5, 0].map((d, i) => delivered(`B${i}`, '2026-10-01', d, 'Bad')),
      ],
      TODAY,
    );
    expect(list.map((r) => r.supplier)).toEqual(['Bad', 'Good', 'Zed']);
    expect(list[2]).toMatchObject({ deliveries: 0, onTimeRate: null, typicalDelayDays: 0, grade: 'new' });
  });

  it('groups supplier names after trimming spaces', () => {
    const list = supplierReliability([delivered('A1', '2026-10-01', 0, 'Acme '), delivered('A2', '2026-10-01', 0, ' Acme')], TODAY);
    expect(list).toHaveLength(1);
    expect(list[0].supplier).toBe('Acme');
  });

  it('groups names that differ only in case or repeated inner spaces, showing the first spelling', () => {
    const list = supplierReliability(
      [delivered('A1', '2026-10-01', 0, 'Acme  Ltd'), delivered('A2', '2026-10-01', 0, 'ACME LTD'), delivered('A3', '2026-10-01', 0, 'acme ltd')],
      TODAY,
    );
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ key: 'acme ltd', supplier: 'Acme Ltd', deliveries: 3, grade: 'reliable' });
  });

  it('does not count an actual arrival dated after today as a delivery', () => {
    const [acme] = supplierReliability([delivered('A1', '2026-11-12', 0), delivered('A2', '2026-10-01', 0)], TODAY);
    expect(acme.deliveries).toBe(1);
  });
});

describe('forecastArrival', () => {
  // Typical delay 6 days, never on time.
  const late = reliabilityIndex(supplierReliability([5, 6, 7, 6].map((d, i) => delivered(`H${i}`, '2026-09-01', d)), TODAY));

  it('moves the arrival to plan + typical delay when that is later than the ETA', () => {
    const s = ship('S1', { plannedArrival: '2026-11-12', eta: '2026-11-14' });
    expect(forecastArrival(s, late, TODAY)).toEqual({ date: '2026-11-18', basis: 'history', shiftDays: 4, typicalDelayDays: 6, adjusted: true, from: 'eta' });
  });

  it('keeps an ETA that already slipped more than the supplier usually does', () => {
    const s = ship('S1', { plannedArrival: '2026-11-12', eta: '2026-11-25' });
    expect(forecastArrival(s, late, TODAY)).toEqual({ date: '2026-11-25', basis: 'eta', shiftDays: 0, typicalDelayDays: 6, adjusted: true, from: 'eta' });
  });

  it('gives an overdue shipment a date when the supplier history says it is still coming', () => {
    const s = ship('S1', { plannedArrival: '2026-11-08' }); // plan passed 2 days ago
    expect(forecastArrival(s, late, TODAY)).toEqual({ date: '2026-11-14', basis: 'history', shiftDays: 6, typicalDelayDays: 6, adjusted: true, from: 'plan' });
  });

  it('marks a forecast for an on-time supplier as adjusted, so the UI does not call it "too little history"', () => {
    const onTime = reliabilityIndex(supplierReliability([0, 0, 0].map((d, i) => delivered(`G${i}`, '2026-09-01', d)), TODAY));
    expect(forecastArrival(ship('S1', { plannedArrival: '2026-11-12' }), onTime, TODAY)).toEqual({
      date: '2026-11-12', basis: 'plan', shiftDays: 0, typicalDelayDays: 0, adjusted: true, from: 'plan',
    });
  });

  it('returns null when even the history-adjusted date has passed (real date unknown)', () => {
    expect(forecastArrival(ship('S1', { plannedArrival: '2026-10-20' }), late, TODAY)).toBeNull();
  });

  it('does not adjust without enough history, for unknown suppliers, or for closed shipments', () => {
    const fresh = reliabilityIndex(supplierReliability([delivered('H1', '2026-09-01', 9)], TODAY));
    const s = ship('S1', { plannedArrival: '2026-11-12' });
    expect(forecastArrival(s, fresh, TODAY)).toEqual({ date: '2026-11-12', basis: 'plan', shiftDays: 0, typicalDelayDays: 0, adjusted: false, from: 'plan' });
    expect(forecastArrival(s, new Map(), TODAY)?.basis).toBe('plan');
    expect(forecastArrival(ship('S2', { status: 'delivered', actualArrival: '2026-11-01' }), late, TODAY)).toBeNull();
    expect(forecastArrival(ship('S3', { status: 'cancelled' }), late, TODAY)).toBeNull();
  });
});

describe('withForecastArrivals', () => {
  it('replaces the ETA only where history moves it, leaving everything else untouched', () => {
    const history = [5, 6, 7, 6].map((d, i) => delivered(`H${i}`, '2026-09-01', d));
    const moved = ship('S1', { plannedArrival: '2026-11-12', eta: '2026-11-14' });
    const kept = ship('S2', { plannedArrival: '2026-11-12', eta: '2026-11-30' });
    const out = withForecastArrivals([...history, moved, kept], TODAY);
    expect(out.find((s) => s.id === 'S1')?.eta).toBe('2026-11-18');
    expect(out.find((s) => s.id === 'S2')).toBe(kept);
    expect(out.filter((s) => s.id.startsWith('H'))).toEqual(history);
  });

  it('leaves overdue shipments alone, so the "late as usual" line is never above the base line', () => {
    const history = [5, 6, 7, 6].map((d, i) => delivered(`H${i}`, '2026-09-01', d));
    const overdue = ship('S1', { plannedArrival: '2026-11-08' }); // forecastArrival would give 14 Nov
    expect(withForecastArrivals([...history, overdue], TODAY).find((s) => s.id === 'S1')).toBe(overdue);
  });
});

describe('demo data tells a supplier story', () => {
  const s = importCsv(demoShipmentsCsv(TODAY));
  const shipments = s.ok && s.kind === 'shipments' ? s.records : [];
  const byName = reliabilityIndex(supplierReliability(shipments, TODAY));

  it('has reliable, watch and unreliable suppliers, with NorthStar Parts the latest', () => {
    expect(byName.get(supplierKey('NorthStar Parts'))).toMatchObject({ grade: 'unreliable', typicalDelayDays: 7 });
    expect(byName.get(supplierKey('Altai Components'))).toMatchObject({ grade: 'unreliable', typicalDelayDays: 3 });
    expect(byName.get(supplierKey('EastLine Supply'))?.grade).toBe('watch');
    expect(byName.get(supplierKey('Silk Road Motors'))?.grade).toBe('watch');
    expect(byName.get(supplierKey('MetroParts'))).toMatchObject({ grade: 'reliable', onTimeRate: 1 });
  });

  it('shows SKU-01 at Tashkent dipping below safety stock again once NorthStar is expected to be late as usual', () => {
    const inv = importCsv(demoInventoryCsv(TODAY));
    const item = (inv.ok && inv.kind === 'inventory' ? inv.records : []).find((i) => i.sku === 'SKU-01' && i.warehouse === 'Tashkent') as InventoryItem;
    expect(forecastArrival(shipments.find((x) => x.id === 'SHP-1001') as Shipment, byName, TODAY)).toMatchObject({ basis: 'history', shiftDays: 3 });
    const daysBelowSafety = (list: Shipment[]) => seriesFor(item, buildPipelineIndex(list), TODAY).points.filter((p) => p.level < item.safetyStock).length;
    expect(daysBelowSafety(withForecastArrivals(shipments, TODAY))).toBeGreaterThan(daysBelowSafety(shipments));
  });
});
