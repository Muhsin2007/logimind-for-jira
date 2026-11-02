import { addDays, daysBetween } from './dates';
import {
  SEVERITIES,
  type InventoryItem,
  type IsoDate,
  type RiskEvent,
  type Severity,
  type Shipment,
} from './types';

/** Bump whenever a rule's condition or severity thresholds change. */
export const RULE_VERSION = '1.2.0';
/** Inbound shipments expected within this many days count towards projected stock. */
export const INBOUND_WINDOW_DAYS = 7;

const CLOSED = new Set(['delivered', 'cancelled']);

export function isOpen(s: Shipment): boolean {
  return !CLOSED.has(s.status) && !s.actualArrival;
}

/** Late = open and past the *planned* (committed) arrival date. */
export function isLate(s: Shipment, today: IsoDate): boolean {
  return isOpen(s) && daysBetween(s.plannedArrival, today) > 0;
}

/** Best known arrival date for an open shipment: ETA when supplied, otherwise the plan. */
export function expectedArrival(s: Shipment): IsoDate {
  return s.eta ?? s.plannedArrival;
}

/** Matching key for a SKU at a warehouse; case- and whitespace-insensitive. */
export function locationKey(sku: string, warehouse: string): string {
  return `${sku.trim().toUpperCase()}@${warehouse.trim().replace(/\s+/g, ' ').toLowerCase()}`;
}

/** Display key used in risk IDs and entity references. */
export function inventoryEntityKey(item: Pick<InventoryItem, 'sku' | 'warehouse'>): string {
  return `${item.sku}@${item.warehouse}`;
}

export type InboundIndex = Map<string, Shipment[]>;

/**
 * Open shipments whose expected arrival falls between today and the end of the inbound
 * window, grouped by location. An ETA already in the past is overdue, not inbound.
 */
export function buildInboundIndex(shipments: Shipment[], today: IsoDate): InboundIndex {
  const windowEnd = addDays(today, INBOUND_WINDOW_DAYS);
  const index: InboundIndex = new Map();
  for (const s of shipments) {
    const expected = expectedArrival(s);
    if (!isOpen(s) || daysBetween(today, expected) < 0 || daysBetween(expected, windowEnd) < 0) continue;
    const key = locationKey(s.sku, s.warehouse);
    const list = index.get(key);
    if (list) list.push(s);
    else index.set(key, [s]);
  }
  return index;
}

export interface StockPosition {
  available: number;
  inboundSoon: number;
  projected: number;
  shortfall: number;
  inboundShipmentIds: string[];
}

/** Available = on hand − reserved; projected adds inbound expected within the window. */
export function stockPosition(item: InventoryItem, index: InboundIndex): StockPosition {
  const inbound = index.get(locationKey(item.sku, item.warehouse)) ?? [];
  const available = item.onHand - item.reserved;
  const inboundSoon = inbound.reduce((sum, s) => sum + s.qty, 0);
  const projected = available + inboundSoon;
  return {
    available,
    inboundSoon,
    projected,
    shortfall: Math.max(0, item.safetyStock - projected),
    inboundShipmentIds: inbound.map((s) => s.id),
  };
}

/** Whether an inventory position breaches the LOW_STOCK rule; shared by risks and KPIs. */
export function lowStockSeverity(item: InventoryItem, p: StockPosition): Severity | null {
  // Nothing available today is a stock-out even if inbound will cover it later,
  // unless the item is deliberately not stocked (safety stock 0).
  if (p.available <= 0 && item.safetyStock > 0) return 'critical';
  if (p.projected >= item.safetyStock) return null;
  return p.projected < item.safetyStock / 2 ? 'high' : 'medium';
}

/**
 * Evaluates all deterministic risk rules. The same inputs and `today` always produce
 * the same risks, IDs and severities; nothing here is predicted or learned.
 */
export function evaluateRisks(
  shipments: Shipment[],
  inventory: InventoryItem[],
  today: IsoDate,
  index: InboundIndex = buildInboundIndex(shipments, today),
): RiskEvent[] {
  const risks: RiskEvent[] = [];
  const base = { ruleVersion: RULE_VERSION, evaluatedOn: today };

  for (const s of shipments) {
    if (!isOpen(s)) continue;
    const common = { ...base, entityType: 'shipment' as const, entityKey: s.id };
    const shipmentFacts = [
      { label: 'Supplier', value: s.supplier },
      { label: 'SKU', value: s.sku },
      { label: 'Qty', value: s.qty },
      { label: 'Status', value: s.status },
      { label: 'Planned arrival', value: s.plannedArrival },
      { label: 'ETA', value: s.eta },
    ];

    const daysLate = daysBetween(s.plannedArrival, today);
    if (daysLate > 0) {
      risks.push({
        ...common,
        id: `LATE_SHIPMENT:${s.id}`,
        type: 'LATE_SHIPMENT',
        severity: daysLate >= 7 ? 'critical' : daysLate >= 3 ? 'high' : 'medium',
        title: `Shipment ${s.id} is ${daysLate} day${daysLate === 1 ? '' : 's'} past planned arrival`,
        evidence: [{ label: 'Days late', value: daysLate }, ...shipmentFacts],
      });
    }

    if (s.eta) {
      const slip = daysBetween(s.plannedArrival, s.eta);
      if (slip > 0) {
        risks.push({
          ...common,
          id: `ETA_SLIP:${s.id}`,
          type: 'ETA_SLIP',
          severity: slip >= 7 ? 'high' : slip >= 3 ? 'medium' : 'low',
          title: `Shipment ${s.id} ETA is ${slip} day${slip === 1 ? '' : 's'} after plan`,
          evidence: [{ label: 'Slip (days)', value: slip }, ...shipmentFacts],
        });
      }
    } else if (s.status === 'in_transit' || s.status === 'customs') {
      const daysToPlan = daysBetween(today, s.plannedArrival);
      risks.push({
        ...common,
        id: `MISSING_ETA:${s.id}`,
        type: 'MISSING_ETA',
        severity: daysToPlan <= 3 ? 'medium' : 'low',
        title: `Shipment ${s.id} is ${s.status.replace('_', ' ')} with no ETA`,
        evidence: [{ label: 'Days to planned arrival', value: daysToPlan }, ...shipmentFacts],
      });
    }
  }

  for (const item of inventory) {
    const position = stockPosition(item, index);
    const severity = lowStockSeverity(item, position);
    if (!severity) continue;
    const entityKey = inventoryEntityKey(item);
    risks.push({
      ...base,
      id: `LOW_STOCK:${entityKey}`,
      type: 'LOW_STOCK',
      severity,
      entityType: 'inventory',
      entityKey,
      title:
        position.available <= 0
          ? `${item.sku} at ${item.warehouse} has no available stock`
          : `${item.sku} at ${item.warehouse} is below safety stock`,
      evidence: [
        { label: 'On hand', value: item.onHand },
        { label: 'Reserved', value: item.reserved },
        { label: 'Available', value: position.available },
        { label: `Inbound within ${INBOUND_WINDOW_DAYS} days`, value: position.inboundSoon },
        { label: 'Projected', value: position.projected },
        { label: 'Safety stock', value: item.safetyStock },
        { label: 'Inbound shipments', value: position.inboundShipmentIds.join(', ') || null },
      ],
    });
  }

  return risks.sort(compareRisks);
}

function compareRisks(a: RiskEvent, b: RiskEvent): number {
  const bySeverity = SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity);
  return bySeverity !== 0 ? bySeverity : a.id.localeCompare(b.id);
}
