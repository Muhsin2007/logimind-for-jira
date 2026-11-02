import { addDays, daysBetween } from './dates';
import { INBOUND_WINDOW_DAYS, isLate, isOpen, stockPosition } from './risk-engine';
import { SEVERITIES, type InventoryItem, type IsoDate, type Kpis, type RiskEvent, type Severity, type Shipment } from './types';

export function computeKpis(shipments: Shipment[], inventory: InventoryItem[], risks: RiskEvent[], today: IsoDate): Kpis {
  const delivered = shipments.filter((s) => s.status === 'delivered' && s.actualArrival);
  const onTime = delivered.filter((s) => daysBetween(s.plannedArrival, s.actualArrival as IsoDate) <= 0);
  const windowEnd = addDays(today, INBOUND_WINDOW_DAYS);

  let skusBelowSafety = 0;
  let valueAtRisk = 0;
  for (const item of inventory) {
    const { shortfall } = stockPosition(item, shipments, today, windowEnd);
    if (shortfall > 0) {
      skusBelowSafety++;
      if (item.unitCost !== null) valueAtRisk += shortfall * item.unitCost;
    }
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
