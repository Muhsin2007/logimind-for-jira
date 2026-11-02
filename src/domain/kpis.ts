import { daysBetween } from './dates';
import { buildInboundIndex, isLate, isOpen, lowStockSeverity, stockPosition, type InboundIndex } from './risk-engine';
import { SEVERITIES, type InventoryItem, type IsoDate, type Kpis, type RiskEvent, type Severity, type Shipment } from './types';

export function computeKpis(
  shipments: Shipment[],
  inventory: InventoryItem[],
  risks: RiskEvent[],
  today: IsoDate,
  index: InboundIndex = buildInboundIndex(shipments, today),
): Kpis {
  const delivered = shipments.filter(
    (s): s is Shipment & { actualArrival: IsoDate } => s.status === 'delivered' && s.actualArrival !== null,
  );
  const onTime = delivered.filter((s) => daysBetween(s.plannedArrival, s.actualArrival) <= 0);

  let skusBelowSafety = 0;
  let valueAtRisk = 0;
  for (const item of inventory) {
    const position = stockPosition(item, index);
    // Same predicate as the LOW_STOCK rule, so the KPI and the Risk Center always agree.
    if (lowStockSeverity(item, position)) skusBelowSafety++;
    if (position.shortfall > 0 && item.unitCost !== null) valueAtRisk += position.shortfall * item.unitCost;
  }

  const risksBySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
  for (const r of risks) risksBySeverity[r.severity]++;

  return {
    shipmentsTotal: shipments.length,
    shipmentsOpen: shipments.filter(isOpen).length,
    shipmentsInTransit: shipments.filter((s) => s.status === 'in_transit' && isOpen(s)).length,
    shipmentsDelivered: delivered.length,
    shipmentsLate: shipments.filter((s) => isLate(s, today)).length,
    onTimeRate: delivered.length === 0 ? null : onTime.length / delivered.length,
    skusTracked: inventory.length,
    skusBelowSafety,
    valueAtRisk: Math.round(valueAtRisk * 100) / 100,
    risksBySeverity,
  };
}
