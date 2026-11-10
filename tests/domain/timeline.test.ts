import { describe, expect, it } from 'vitest';
import { demoShipmentsCsv } from '../../src/domain/demo-data';
import { importCsv } from '../../src/domain/importer';
import { inboundTimeline } from '../../src/domain/timeline';
import type { Shipment } from '../../src/domain/types';

const TODAY = '2026-11-02';

function ship(id: string, plannedArrival: string, eta: string | null, extra: Partial<Shipment> = {}): Shipment {
  return {
    id, orderId: null, supplier: 'ACME', sku: 'SKU-1', productName: null, qty: 10, plannedArrival, eta, actualArrival: null,
    status: 'in_transit', warehouse: 'Tashkent', carrier: null, trackingRef: null, ...extra,
  };
}

describe('inboundTimeline', () => {
  it('lists open shipments by expected arrival with slip and lateness', () => {
    const tl = inboundTimeline([
      ship('B', '2026-11-05', '2026-11-09'),
      ship('A', '2026-10-30', null),
      ship('C', '2026-11-04', '2026-11-04'),
      ship('D', '2026-11-01', '2026-11-01', { status: 'delivered', actualArrival: '2026-11-01' }),
    ], TODAY);
    expect(tl.items.map((i) => i.id)).toEqual(['A', 'C', 'B']);
    expect(tl.items[0]).toMatchObject({ planned: '2026-10-30', expected: '2026-10-30', eta: null, slipDays: 0, daysLate: 3, overdue: true });
    expect(tl.items[2]).toMatchObject({ planned: '2026-11-05', expected: '2026-11-09', slipDays: 4, daysLate: 0, overdue: false });
  });

  it('spans the shipments, at least a week ahead, within the past/horizon limits', () => {
    const tl = inboundTimeline([ship('A', '2026-09-01', '2026-09-01'), ship('B', '2026-11-04', '2027-03-01')], TODAY, { pastDays: 14, horizonDays: 42 });
    expect(tl.start).toBe('2026-10-19');
    // B lands after the horizon: counted, not drawn, and it does not stretch the range.
    expect(tl.end).toBe('2026-11-09');
    expect(tl.items.map((i) => i.id)).toEqual(['A']);
    expect(tl.later).toBe(1);
    const small = inboundTimeline([ship('C', '2026-11-03', '2026-11-03')], TODAY);
    expect(small).toMatchObject({ start: TODAY, end: '2026-11-09' });
  });

  it('counts lateness from the earliest promised date, so an early ETA that passed is late too', () => {
    const tl = inboundTimeline([ship('E', '2026-11-15', '2026-10-30'), ship('F', '2026-10-25', '2026-10-31')], TODAY);
    expect(tl.items.find((i) => i.id === 'E')).toMatchObject({ overdue: true, daysLate: 3, slipDays: -16 });
    expect(tl.items.find((i) => i.id === 'F')).toMatchObject({ overdue: true, daysLate: 8, slipDays: 6 });
  });

  it('has weekly ticks aligned to today', () => {
    const tl = inboundTimeline([ship('A', '2026-10-20', '2026-11-25')], TODAY);
    expect(tl.ticks).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']);
  });

  it('is empty without open shipments', () => {
    expect(inboundTimeline([], TODAY)).toMatchObject({ items: [], later: 0, start: TODAY, end: '2026-11-09' });
  });

  it('caps the number of drawn shipments and counts the rest', () => {
    const many = Array.from({ length: 30 }, (_, n) => ship(`S${String(n).padStart(2, '0')}`, '2026-11-05', '2026-11-05'));
    const tl = inboundTimeline(many, TODAY, { maxItems: 25 });
    expect(tl.items).toHaveLength(25);
    expect(tl.later).toBe(5);
  });

  it('fits the range to the drawn shipments only', () => {
    const tl = inboundTimeline([ship('A', '2026-11-03', '2026-11-12'), ship('B', '2026-11-20', '2026-12-01')], TODAY, { maxItems: 1 });
    expect(tl.items.map((i) => i.id)).toEqual(['A']);
    expect(tl.end).toBe('2026-11-12');
  });

  it('draws the demo pipeline (overdue SHP-1004 first, nothing past six weeks)', () => {
    const s = importCsv(demoShipmentsCsv(TODAY));
    if (!s.ok || s.kind !== 'shipments') throw new Error('demo data invalid');
    const tl = inboundTimeline(s.records, TODAY);
    expect(tl.items[0]).toMatchObject({ id: 'SHP-1004', overdue: true, daysLate: 9 });
    expect(tl.items.find((i) => i.id === 'SHP-1011')).toMatchObject({ slipDays: 7, expected: '2026-11-23' });
    expect(tl.later).toBe(0);
  });
});
