import { describe, expect, it } from 'vitest';
import { demoInventoryCsv, demoShipmentsCsv } from '../../src/domain/demo-data';
import { importCsv } from '../../src/domain/importer';
import type { InventoryItem, Shipment } from '../../src/domain/types';
import { delayCandidates, MAX_DELAY_DAYS, simulateDelay } from '../../src/domain/what-if';

const TODAY = '2026-11-02';

function ship(over: Partial<Shipment>): Shipment {
  return {
    id: 'SHP-1', orderId: null, supplier: 'Acme', sku: 'SKU-1', productName: null, qty: 100,
    plannedArrival: '2026-11-05', eta: '2026-11-05', actualArrival: null, status: 'in_transit',
    warehouse: 'W', carrier: null, trackingRef: null, ...over,
  };
}
function inv(over: Partial<InventoryItem>): InventoryItem {
  return {
    sku: 'SKU-1', productName: null, warehouse: 'W', onHand: 30, reserved: 0, inboundQty: 0,
    safetyStock: 20, unitCost: null, updatedAt: null, dailyUsage: 5, ...over,
  };
}

function demo() {
  const s = importCsv(demoShipmentsCsv(TODAY));
  const i = importCsv(demoInventoryCsv(TODAY));
  if (!s.ok || s.kind !== 'shipments' || !i.ok || i.kind !== 'inventory') throw new Error('demo invalid');
  return { shipments: s.records, inventory: i.records };
}

describe('simulateDelay', () => {
  it('moves the arrival and shows the stock-out it causes, compared with today', () => {
    // 30 available, 5/day: without the shipment stock is out on day 6. It lands on day 3 today.
    const r = simulateDelay([ship({})], [inv({})], TODAY, { shipmentIds: ['SHP-1'], delayDays: 5 });
    expect(r.shipments).toEqual([{ id: 'SHP-1', sku: 'SKU-1', warehouse: 'W', supplier: 'Acme', qty: 100, from: '2026-11-05', to: '2026-11-10' }]);
    expect(r.rows).toHaveLength(1);
    const row = r.rows[0];
    expect(row).toMatchObject({ entityKey: 'SKU-1@W', delayedShipmentIds: ['SHP-1'], worse: true });
    expect(row.before.cover.stockOutDate).toBe('2026-11-28');
    expect(row.after.cover.stockOutDate).toBe('2026-11-08');
    expect(row.before.lowStock).toBeNull();
    // Day 3 inbound leaves the 7-day window when delayed to day 8: projected 30 ≥ 20, still no LOW_STOCK.
    expect(row.after.projected).toBe(30);
  });

  it('is unchanged with no delay and never mutates the input', () => {
    const shipments = [ship({})];
    const r = simulateDelay(shipments, [inv({})], TODAY, { shipmentIds: ['SHP-1'], delayDays: 0 });
    expect(r.rows[0].worse).toBe(false);
    expect(r.rows[0].after).toEqual(r.rows[0].before);
    expect(shipments[0].eta).toBe('2026-11-05');
  });

  it('raises the 7-day low-stock severity when inbound slips out of the window', () => {
    const r = simulateDelay([ship({ qty: 10 })], [inv({ onHand: 15, dailyUsage: null })], TODAY, { shipmentIds: ['SHP-1'], delayDays: 7 });
    expect(r.rows[0].before).toMatchObject({ projected: 25, lowStock: null });
    expect(r.rows[0].after).toMatchObject({ projected: 15, lowStock: 'medium' });
    expect(r.rows[0].worse).toBe(true);
  });

  it('delays every open, upcoming shipment of a supplier (case-insensitive), not delivered or overdue ones', () => {
    const shipments = [
      ship({ id: 'A' }),
      ship({ id: 'B', supplier: 'ACME ', sku: 'SKU-2' }),
      ship({ id: 'C', status: 'delivered', actualArrival: '2026-11-01' }),
      ship({ id: 'D', eta: '2026-10-30' }),
      ship({ id: 'E', supplier: 'Other' }),
    ];
    const r = simulateDelay(shipments, [inv({}), inv({ sku: 'SKU-2' })], TODAY, { supplier: 'acme', delayDays: 3 });
    expect(r.shipments.map((s) => s.id)).toEqual(['A', 'B']);
    expect(r.rows.map((x) => x.entityKey)).toEqual(['SKU-1@W', 'SKU-2@W']);
  });

  it('lists affected locations without an inventory record separately', () => {
    const r = simulateDelay([ship({ sku: 'NEW' })], [inv({})], TODAY, { shipmentIds: ['SHP-1'], delayDays: 2 });
    expect(r.rows).toEqual([]);
    expect(r.untracked).toEqual(['NEW@W']);
  });

  it('clamps the delay to 0–30 whole days', () => {
    expect(simulateDelay([ship({})], [inv({})], TODAY, { shipmentIds: ['SHP-1'], delayDays: 99 }).delayDays).toBe(MAX_DELAY_DAYS);
    expect(simulateDelay([ship({})], [inv({})], TODAY, { shipmentIds: ['SHP-1'], delayDays: -4.5 }).delayDays).toBe(0);
  });

  it('tells the demo stories: delaying SHP-1001 or SHP-1027 creates a stock-out', () => {
    const { shipments, inventory } = demo();
    const northStar = simulateDelay(shipments, inventory, TODAY, { shipmentIds: ['SHP-1001'], delayDays: 10 });
    expect(northStar.rows[0]).toMatchObject({ entityKey: 'SKU-01@Tashkent', worse: true });
    expect(northStar.rows[0].before.cover.stockOutDate).toBe('2026-11-29');
    expect(northStar.rows[0].after.cover.stockOutDate).toBe('2026-11-14');

    const eastLine = simulateDelay(shipments, inventory, TODAY, { shipmentIds: ['SHP-1027'], delayDays: 2 });
    expect(eastLine.rows[0].before.cover.stockOutDate).not.toBe(eastLine.rows[0].after.cover.stockOutDate);
  });
});

describe('delayCandidates', () => {
  it('offers open shipments that have not passed their expected arrival, and their suppliers', () => {
    const c = delayCandidates([ship({ id: 'A' }), ship({ id: 'B', eta: '2026-10-01' }), ship({ id: 'C', status: 'cancelled' }), ship({ id: 'D', supplier: 'Zed' })], TODAY);
    expect(c.shipments.map((s) => s.id)).toEqual(['A', 'D']);
    expect(c.suppliers).toEqual(['Acme', 'Zed']);
  });
});
