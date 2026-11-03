import type { RiskEvent, Severity, Shipment } from '../domain/types';
import type { CopilotRecommendation, InventoryRow } from '../shared/api';

const PRIORITY: Record<Severity, CopilotRecommendation['priority']> = { critical: 'high', high: 'high', medium: 'medium', low: 'low' };

export interface RecommendationContext {
  /** The shipment a shipment risk refers to. */
  shipment?: Shipment | null;
  /** Stock rows for the risk's SKU in every warehouse (for transfer suggestions). */
  stock?: InventoryRow[];
}

/**
 * Deterministic next steps for a risk. Each one names the records it is based on and only
 * uses numbers present in the data; when the data does not support an action, none is made.
 */
export function recommend(risk: RiskEvent, ctx: RecommendationContext): CopilotRecommendation[] {
  const priority = PRIORITY[risk.severity];
  const s = ctx.shipment;

  if (risk.entityType === 'shipment' && s) {
    switch (risk.type) {
      case 'LATE_SHIPMENT': {
        const daysLate = risk.evidence.find((e) => e.label === 'Days late')?.value;
        return [{
          priority,
          text: `Contact ${s.supplier}${s.carrier ? ` and carrier ${s.carrier}` : ''} for a confirmed delivery date for ${s.id}.`,
          ids: [s.id, risk.id],
          evidence: `Planned arrival ${s.plannedArrival}, not delivered${daysLate !== undefined ? ` (${daysLate} days late)` : ''}.`,
          confidence: 'high',
        }];
      }
      case 'ETA_SLIP':
        return [{
          priority,
          text: `Check which orders depend on ${s.sku} from ${s.id}${s.orderId ? ` (order ${s.orderId})` : ''} and whether the later ETA delays them.`,
          ids: [s.id, risk.id],
          evidence: `ETA ${s.eta} is after planned arrival ${s.plannedArrival}.`,
          confidence: 'high',
        }];
      case 'MISSING_ETA':
        return [{
          priority,
          text: `Ask ${s.carrier ?? s.supplier} for an ETA for ${s.id}.`,
          ids: [s.id, risk.id],
          evidence: `Status ${s.status} with no ETA in the data.`,
          confidence: 'high',
        }];
      default:
        return [];
    }
  }

  if (risk.type === 'LOW_STOCK') return recommendForStock(risk, ctx.stock ?? []);
  return [];
}

function recommendForStock(risk: RiskEvent, stock: InventoryRow[]): CopilotRecommendation[] {
  const row = stock.find((r) => `${r.sku}@${r.warehouse}` === risk.entityKey);
  if (!row) return [];
  const priority = PRIORITY[risk.severity];
  const out: CopilotRecommendation[] = [];

  if (row.inboundShipmentIds.length > 0) {
    out.push({
      priority,
      text: `Prioritise receiving ${row.inboundShipmentIds.join(', ')} at ${row.warehouse} (${row.inboundSoon} units due within 7 days).`,
      ids: [...row.inboundShipmentIds, risk.id],
      evidence: `Available ${row.available}, safety stock ${row.safetyStock}.`,
      confidence: 'high',
    });
  }

  // Units still needed: with nothing available now, enough to reach safety stock today;
  // otherwise the gap that remains after inbound stock arrives.
  let remaining = row.available <= 0 ? row.safetyStock - row.available : row.shortfall;

  // A donor gives only what keeps it at or above its own safety stock now and after its inbound.
  for (const other of stock) {
    if (other === row || remaining <= 0) continue;
    const surplus = Math.min(other.available, other.projected) - other.safetyStock;
    if (surplus <= 0) continue;
    const qty = Math.min(surplus, remaining);
    remaining -= qty;
    out.push({
      priority,
      text: `Consider transferring up to ${qty} units of ${row.sku} from ${other.warehouse} to ${row.warehouse}.`,
      ids: [`${other.sku}@${other.warehouse}`, risk.id],
      evidence: `${other.warehouse} has ${other.available} available against safety stock ${other.safetyStock}.`,
      confidence: 'medium',
    });
  }

  if (remaining > 0) {
    out.push({
      priority,
      text: `Raise a replenishment order for ${row.sku} at ${row.warehouse}: ${remaining} units still needed to reach safety stock.`,
      ids: [risk.id],
      evidence: `Available ${row.available}, inbound within 7 days ${row.inboundSoon}, safety stock ${row.safetyStock}.`,
      confidence: 'medium',
    });
  }
  return out;
}
