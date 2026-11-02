import { describe, expect, it } from 'vitest';
import { evaluateRisks, RULE_VERSION } from '../../src/domain/risk-engine';
import { computeKpis } from '../../src/domain/kpis';
import { importCsv } from '../../src/domain/importer';
import { demoInventoryCsv, demoShipmentsCsv } from '../../src/domain/demo-data';
import type { InventoryItem, Shipment } from '../../src/domain/types';

const TODAY = '2026-11-02';

function ship(overrides: Partial<Shipment>): Shipment {
  return {
    id: 'SHP-1', orderId: null, supplier: 'Acme', sku: 'SKU-1', productName: null, qty: 10,
    plannedArrival: TODAY, eta: TODAY, actualArrival: null, status: 'in_transit',
    warehouse: 'W', carrier: null, trackingRef: null, ...overrides,
  };
}

function inv(overrides: Partial<InventoryItem>): InventoryItem {
  return {
    sku: 'SKU-1', productName: null, warehouse: 'W', onHand: 100, reserved: 0, inboundQty: 0,
    safetyStock: 10, unitCost: 2, updatedAt: TODAY, ...overrides,
  };
}

const types = (shipments: Shipment[], inventory: InventoryItem[] = []) =>
  evaluateRisks(shipments, inventory, TODAY).map((r) => `${r.type}:${r.severity}`);

describe('LATE_SHIPMENT', () => {
  it('is not raised on the planned arrival day', () => {
    expect(types([ship({ plannedArrival: TODAY })])).toEqual([]);
  });
  it.each([
    ['2026-11-01', 'medium'],
    ['2026-10-30', 'high'],
    ['2026-10-26', 'critical'],
  ])('planned %s → %s', (planned, severity) => {
    expect(types([ship({ plannedArrival: planned, eta: planned })])).toEqual([`LATE_SHIPMENT:${severity}`]);
  });
  it('ignores delivered, cancelled and shipments with an actual arrival', () => {
    const past = '2026-10-01';
    expect(types([
      ship({ id: 'A', plannedArrival: past, status: 'delivered', actualArrival: past }),
      ship({ id: 'B', plannedArrival: past, status: 'cancelled' }),
      ship({ id: 'C', plannedArrival: past, actualArrival: past }),
    ])).toEqual([]);
  });
});

describe('ETA_SLIP and MISSING_ETA', () => {
  it('grades ETA slip by days after plan', () => {
    expect(types([ship({ plannedArrival: '2026-11-10', eta: '2026-11-11' })])).toEqual(['ETA_SLIP:low']);
    expect(types([ship({ plannedArrival: '2026-11-10', eta: '2026-11-13' })])).toEqual(['ETA_SLIP:medium']);
    expect(types([ship({ plannedArrival: '2026-11-10', eta: '2026-11-17' })])).toEqual(['ETA_SLIP:high']);
  });
  it('raises MISSING_ETA only for in-transit/customs, never inventing a date', () => {
    expect(types([ship({ eta: null, plannedArrival: '2026-11-20' })])).toEqual(['MISSING_ETA:low']);
    expect(types([ship({ eta: null, plannedArrival: '2026-11-04', status: 'customs' })])).toEqual(['MISSING_ETA:medium']);
    expect(types([ship({ eta: null, plannedArrival: '2026-11-20', status: 'planned' })])).toEqual([]);
  });
});

describe('LOW_STOCK', () => {
  it('uses on_hand − reserved', () => {
    expect(types([], [inv({ onHand: 20, reserved: 12, safetyStock: 10 })])).toEqual(['LOW_STOCK:medium']);
  });
  it('is critical when nothing is available and high below half of safety stock', () => {
    expect(types([], [inv({ onHand: 5, reserved: 5 })])).toEqual(['LOW_STOCK:critical']);
    expect(types([], [inv({ onHand: 4, safetyStock: 10 })])).toEqual(['LOW_STOCK:high']);
  });
  it('counts on-time inbound within 7 days, but not late or far-off shipments', () => {
    const item = inv({ onHand: 4, safetyStock: 10 });
    expect(types([ship({ qty: 6, plannedArrival: '2026-11-09', eta: '2026-11-09' })], [item])).toEqual([]);
    expect(types([ship({ qty: 6, plannedArrival: '2026-11-10', eta: '2026-11-10' })], [item])).toEqual(['LOW_STOCK:high']);
    const risks = types([ship({ qty: 6, plannedArrival: '2026-11-01', eta: '2026-11-03' })], [item]);
    expect(risks).toContain('LOW_STOCK:high');
  });
  it('flags a stock-out today as critical even when inbound covers safety stock', () => {
    const item = inv({ onHand: 12, reserved: 12, safetyStock: 50 });
    const risks = evaluateRisks([ship({ qty: 140, plannedArrival: '2026-11-06', eta: '2026-11-06' })], [item], TODAY);
    expect(risks.map((r) => [r.type, r.severity, r.title])).toEqual([
      ['LOW_STOCK', 'critical', 'SKU-1 at W has no available stock'],
    ]);
  });
  it('only counts inbound for the same SKU and warehouse', () => {
    const item = inv({ onHand: 4, safetyStock: 10 });
    expect(types([ship({ qty: 50, warehouse: 'Other' })], [item])).toEqual(['LOW_STOCK:high']);
  });
});

describe('evaluateRisks output', () => {
  it('produces deterministic IDs, evidence and ordering', () => {
    const s = [ship({ id: 'SHP-B', plannedArrival: '2026-11-01', eta: '2026-11-01' }), ship({ id: 'SHP-A', plannedArrival: '2026-10-20', eta: '2026-10-20' })];
    const first = evaluateRisks(s, [], TODAY);
    expect(first.map((r) => r.id)).toEqual(['LATE_SHIPMENT:SHP-A', 'LATE_SHIPMENT:SHP-B']);
    expect(first[0]).toMatchObject({ ruleVersion: RULE_VERSION, evaluatedOn: TODAY, entityType: 'shipment' });
    expect(first[0].evidence).toContainEqual({ label: 'Days late', value: 13 });
    expect(evaluateRisks(s, [], TODAY)).toEqual(first);
  });
});

describe('computeKpis', () => {
  it('computes on-time rate, late count and value at risk', () => {
    const shipments = [
      ship({ id: 'D1', status: 'delivered', plannedArrival: '2026-10-10', actualArrival: '2026-10-09' }),
      ship({ id: 'D2', status: 'delivered', plannedArrival: '2026-10-10', actualArrival: '2026-10-12' }),
      ship({ id: 'L1', plannedArrival: '2026-10-30', eta: '2026-10-30' }),
    ];
    const inventory = [inv({ onHand: 4, safetyStock: 10, unitCost: 2.5 })];
    const k = computeKpis(shipments, inventory, evaluateRisks(shipments, inventory, TODAY), TODAY);
    expect(k).toMatchObject({ shipmentsTotal: 3, shipmentsDelivered: 2, shipmentsLate: 1, onTimeRate: 0.5, skusBelowSafety: 1, valueAtRisk: 15 });
  });
  it('reports null on-time rate when nothing is delivered', () => {
    expect(computeKpis([], [], [], TODAY).onTimeRate).toBeNull();
  });
});

describe('demo dataset', () => {
  it('imports cleanly and exercises every risk type', () => {
    const s = importCsv(demoShipmentsCsv(TODAY));
    const i = importCsv(demoInventoryCsv(TODAY));
    if (!s.ok || s.kind !== 'shipments' || !i.ok || i.kind !== 'inventory') throw new Error('demo import failed');
    expect(s.errors).toEqual([]);
    expect(i.errors).toEqual([]);
    const riskTypes = new Set(evaluateRisks(s.records, i.records, TODAY).map((r) => r.type));
    expect([...riskTypes].sort()).toEqual(['ETA_SLIP', 'LATE_SHIPMENT', 'LOW_STOCK', 'MISSING_ETA']);
  });
});
