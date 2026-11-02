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
export const RULE_VERSION = '1.0.0';
/** Inbound shipments arriving within this many days count towards available stock. */
export const INBOUND_WINDOW_DAYS = 7;

const CLOSED = new Set(['delivered', 'cancelled']);

export function isOpen(s: Shipment): boolean {
  return !CLOSED.has(s.status) && !s.actualArrival;
}

export function isLate(s: Shipment, today: IsoDate): boolean {
  return isOpen(s) && daysBetween(s.plannedArrival, today) > 0;
}

/** Best known arrival date for an open shipment: ETA when supplied, otherwise the plan. */
export function expectedArrival(s: Shipment): IsoDate {
  return s.eta ?? s.plannedArrival;
}

/**
 * Evaluates all deterministic risk rules. The same inputs and `today` always produce
 * the same risks, IDs and severities; nothing here is predicted or learned.
 */
export function evaluateRisks(shipments: Shipment[], inventory: InventoryItem[], today: IsoDate): RiskEvent[] {
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

  const windowEnd = addDays(today, INBOUND_WINDOW_DAYS);
  for (const item of inventory) {
    const position = stockPosition(item, shipments, today, windowEnd);
    if (position.projected >= item.safetyStock) continue;
    const entityKey = `${item.sku}@${item.warehouse}`;
    const severity: Severity =
      position.available <= 0 ? 'critical' : position.projected < item.safetyStock / 2 ? 'high' : 'medium';
    risks.push({
      ...base,
      id: `LOW_STOCK:${entityKey}`,
      type: 'LOW_STOCK',
      severity,
      entityType: 'inventory',
      entityKey,
      title: `${item.sku} at ${item.warehouse} is below safety stock`,
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

export interface StockPosition {
  available: number;
  inboundSoon: number;
  projected: number;
  shortfall: number;
  inboundShipmentIds: string[];
}

/**
 * Available = on hand − reserved. Inbound counts open shipments for the same SKU and
 * warehouse that are not late and expected by `windowEnd`.
 */
export function stockPosition(item: InventoryItem, shipments: Shipment[], today: IsoDate, windowEnd: IsoDate): StockPosition {
  const available = item.onHand - item.reserved;
  const inbound = shipments.filter(
    (s) =>
      s.sku === item.sku &&
      s.warehouse === item.warehouse &&
      isOpen(s) &&
      !isLate(s, today) &&
      daysBetween(expectedArrival(s), windowEnd) >= 0,
  );
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

function compareRisks(a: RiskEvent, b: RiskEvent): number {
  const bySeverity = SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity);
  return bySeverity !== 0 ? bySeverity : a.id.localeCompare(b.id);
}
