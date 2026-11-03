import { buildPipelineIndex, coverFor, type CoverProjection } from './cover';
import { addDays, daysBetween } from './dates';
import { buildInboundIndex, expectedArrival, inventoryEntityKey, isOpen, locationKey, lowStockSeverity, stockPosition } from './risk-engine';
import { SEVERITIES, type InventoryItem, type IsoDate, type Severity, type Shipment } from './types';

export const MAX_DELAY_DAYS = 30;

/** Which shipments to delay: explicit IDs, or every upcoming shipment of one supplier. */
export interface DelayScenario {
  shipmentIds?: string[];
  supplier?: string;
  delayDays: number;
}

export interface DelayedShipment {
  id: string;
  sku: string;
  warehouse: string;
  supplier: string;
  qty: number;
  /** Expected arrival today and with the delay. */
  from: IsoDate;
  to: IsoDate;
}

export interface StockOutlook {
  /** Available + inbound within the 7-day risk window. */
  projected: number;
  /** LOW_STOCK severity the rules would give, or null. */
  lowStock: Severity | null;
  cover: CoverProjection;
}

export interface WhatIfRow {
  sku: string;
  warehouse: string;
  productName: string | null;
  entityKey: string;
  safetyStock: number;
  delayedShipmentIds: string[];
  before: StockOutlook;
  after: StockOutlook;
  /** The delay makes this position worse: a higher low-stock severity, or an earlier/new stock-out or safety breach. */
  worse: boolean;
}

export interface WhatIfResult {
  today: IsoDate;
  delayDays: number;
  shipments: DelayedShipment[];
  rows: WhatIfRow[];
  /** SKU@warehouse of delayed shipments with no inventory record, so no stock impact is known. */
  untracked: string[];
}

/** Open shipments still expected (not overdue), so a delay moves a real future arrival. */
const isUpcoming = (s: Shipment, today: IsoDate) => isOpen(s) && daysBetween(today, expectedArrival(s)) >= 0;
const sameSupplier = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** What can be delayed: upcoming shipments by arrival, and their suppliers (first spelling wins). */
export function delayCandidates(shipments: Shipment[], today: IsoDate): { shipments: Shipment[]; suppliers: string[] } {
  const upcoming = shipments
    .filter((s) => isUpcoming(s, today))
    .sort((a, b) => expectedArrival(a).localeCompare(expectedArrival(b)) || a.id.localeCompare(b.id));
  const suppliers: string[] = [];
  for (const s of upcoming) if (!suppliers.some((x) => sameSupplier(x, s.supplier))) suppliers.push(s.supplier.trim());
  return { shipments: upcoming, suppliers: suppliers.sort((a, b) => a.localeCompare(b)) };
}

/**
 * Read-only "what if these shipments arrive N days later?": moves their expected arrival and
 * re-runs the same stock rules and days-of-cover projection. Nothing is stored.
 */
export function simulateDelay(shipments: Shipment[], inventory: InventoryItem[], today: IsoDate, scenario: DelayScenario): WhatIfResult {
  const delayDays = Math.min(MAX_DELAY_DAYS, Math.max(0, Math.trunc(scenario.delayDays) || 0));
  const ids = new Set((scenario.shipmentIds ?? []).map((id) => id.trim().toUpperCase()));
  const supplier = scenario.supplier;
  const selected = shipments
    .filter((s) => isUpcoming(s, today) && (ids.has(s.id.toUpperCase()) || (supplier !== undefined && supplier.trim() !== '' && sameSupplier(s.supplier, supplier))))
    .sort((a, b) => expectedArrival(a).localeCompare(expectedArrival(b)) || a.id.localeCompare(b.id));
  const delayed = new Map(selected.map((s) => [s.id, addDays(expectedArrival(s), delayDays)]));
  const scenarioShipments = shipments.map((s) => (delayed.has(s.id) ? { ...s, eta: delayed.get(s.id) ?? s.eta } : s));

  const outlook = (list: Shipment[]) => {
    const index = buildInboundIndex(list, today);
    const pipeline = buildPipelineIndex(list);
    return (item: InventoryItem): StockOutlook => {
      const p = stockPosition(item, index);
      return { projected: p.projected, lowStock: lowStockSeverity(item, p), cover: coverFor(item, pipeline, today) };
    };
  };
  const before = outlook(shipments);
  const after = outlook(scenarioShipments);

  const byLocation = new Map<string, Shipment[]>();
  for (const s of selected) {
    const key = locationKey(s.sku, s.warehouse);
    byLocation.set(key, [...(byLocation.get(key) ?? []), s]);
  }
  const rows: WhatIfRow[] = [];
  const untracked: string[] = [];
  for (const [key, list] of byLocation) {
    const item = inventory.find((i) => locationKey(i.sku, i.warehouse) === key);
    if (!item) {
      untracked.push(`${list[0].sku}@${list[0].warehouse}`);
      continue;
    }
    const b = before(item);
    const a = after(item);
    rows.push({
      sku: item.sku,
      warehouse: item.warehouse,
      productName: item.productName,
      entityKey: inventoryEntityKey(item),
      safetyStock: item.safetyStock,
      delayedShipmentIds: list.map((s) => s.id),
      before: b,
      after: a,
      worse: isWorse(b, a),
    });
  }
  rows.sort((x, y) => Number(y.worse) - Number(x.worse) || x.entityKey.localeCompare(y.entityKey));

  return {
    today,
    delayDays,
    shipments: selected.map((s) => ({ id: s.id, sku: s.sku, warehouse: s.warehouse, supplier: s.supplier, qty: s.qty, from: expectedArrival(s), to: delayed.get(s.id) ?? expectedArrival(s) })),
    rows,
    untracked,
  };
}

const rank = (s: Severity | null) => (s === null ? SEVERITIES.length : SEVERITIES.indexOf(s));
/** A date that appears, or moves earlier. */
const earlier = (before: IsoDate | null, after: IsoDate | null) => after !== null && (before === null || after < before);

function isWorse(b: StockOutlook, a: StockOutlook): boolean {
  return rank(a.lowStock) < rank(b.lowStock) || earlier(b.cover.stockOutDate, a.cover.stockOutDate) || earlier(b.cover.belowSafetyDate, a.cover.belowSafetyDate);
}
