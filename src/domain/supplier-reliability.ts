import { addDays, daysBetween } from './dates';
import { expectedArrival, isLate, isOpen } from './risk-engine';
import type { IsoDate, Shipment } from './types';

/** Fewer deliveries than this are not enough to judge a supplier or move its dates. */
export const MIN_HISTORY = 3;
/** On-time share at or above which a supplier is "reliable"; at or above WATCH_RATE it is "watch". */
export const RELIABLE_RATE = 0.9;
export const WATCH_RATE = 0.7;

export type ReliabilityGrade = 'reliable' | 'watch' | 'unreliable' | 'new';

export interface SupplierReliability {
  /** Matching key: trimmed, inner spaces collapsed, lower case (see `supplierKey`). */
  key: string;
  /** Display name: the first spelling found in the file. */
  supplier: string;
  /** Shipments that arrived (actual arrival date on or before today), cancelled ones excluded. */
  deliveries: number;
  /** Deliveries that arrived on or before their planned date. */
  onTime: number;
  onTimeRate: number | null;
  /** Median days late over all deliveries (early or on time counts as 0), rounded up. */
  typicalDelayDays: number;
  maxDelayDays: number;
  openShipments: number;
  /** Open shipments already past their planned (committed) date. */
  lateNow: number;
  grade: ReliabilityGrade;
}

export type ReliabilityIndex = Map<string, SupplierReliability>;

export interface ArrivalForecast {
  date: IsoDate;
  /** `history`: moved by the supplier's typical delay; otherwise the ETA or the plan as given. */
  basis: 'history' | 'eta' | 'plan';
  /** Days the forecast is later than the ETA (or plan); 0 unless the basis is `history`. */
  shiftDays: number;
  typicalDelayDays: number;
  /** Whether the supplier has enough history (MIN_HISTORY deliveries) for its delay to count. */
  adjusted: boolean;
  /** The date `shiftDays` is measured from: the ETA, or the plan when there is no ETA. */
  from: 'eta' | 'plan';
}

/** Supplier names match ignoring case, outer spaces and repeated inner spaces. */
export const supplierKey = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function gradeOf(deliveries: number, rate: number | null): ReliabilityGrade {
  if (deliveries < MIN_HISTORY || rate === null) return 'new';
  if (rate >= RELIABLE_RATE) return 'reliable';
  return rate >= WATCH_RATE ? 'watch' : 'unreliable';
}

const GRADE_ORDER: Record<ReliabilityGrade, number> = { unreliable: 0, watch: 1, reliable: 2, new: 3 };

/**
 * Delivery record per supplier from the shipments file: how often deliveries arrived by the
 * planned date and how late they usually were. Deterministic; the least reliable come first.
 */
export function supplierReliability(shipments: Shipment[], today: IsoDate): SupplierReliability[] {
  const groups = new Map<string, Shipment[]>();
  for (const s of shipments) {
    if (s.status === 'cancelled') continue;
    const key = supplierKey(s.supplier);
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
  }

  const result: SupplierReliability[] = [];
  for (const [key, list] of groups) {
    const supplier = list[0].supplier.trim().replace(/\s+/g, ' ');
    const delays = list.filter((s) => s.actualArrival && s.actualArrival <= today).map((s) => Math.max(0, daysBetween(s.plannedArrival, s.actualArrival as IsoDate)));
    const onTime = delays.filter((d) => d === 0).length;
    const onTimeRate = delays.length === 0 ? null : onTime / delays.length;
    result.push({
      key,
      supplier,
      deliveries: delays.length,
      onTime,
      onTimeRate,
      typicalDelayDays: delays.length === 0 ? 0 : Math.ceil(median(delays)),
      maxDelayDays: delays.length === 0 ? 0 : Math.max(...delays),
      openShipments: list.filter(isOpen).length,
      lateNow: list.filter((s) => isLate(s, today)).length,
      grade: gradeOf(delays.length, onTimeRate),
    });
  }
  return result.sort(
    (a, b) =>
      GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade] ||
      (a.onTimeRate ?? 2) - (b.onTimeRate ?? 2) ||
      b.typicalDelayDays - a.typicalDelayDays ||
      a.supplier.localeCompare(b.supplier),
  );
}

export function reliabilityIndex(list: SupplierReliability[]): ReliabilityIndex {
  return new Map(list.map((r) => [r.key, r]));
}

/**
 * When an open shipment will probably arrive, given how late its supplier usually is: the plan
 * plus the typical delay, if that is later than the current ETA (an ETA that already slipped
 * further is kept). Suppliers with fewer than MIN_HISTORY deliveries are not adjusted. Returns
 * null for closed shipments and when the forecast date has already passed (real date unknown,
 * the same convention as days of cover).
 */
export function forecastArrival(s: Shipment, index: ReliabilityIndex, today: IsoDate): ArrivalForecast | null {
  if (!isOpen(s)) return null;
  const known = expectedArrival(s);
  const record = index.get(supplierKey(s.supplier));
  const adjusted = !!record && record.grade !== 'new';
  const typical = adjusted ? record.typicalDelayDays : 0;
  const fromHistory = addDays(s.plannedArrival, typical);
  const from = s.eta ? 'eta' : 'plan';
  const forecast: ArrivalForecast =
    typical > 0 && fromHistory > known
      ? { date: fromHistory, basis: 'history', shiftDays: daysBetween(known, fromHistory), typicalDelayDays: typical, adjusted, from }
      : { date: known, basis: from, shiftDays: 0, typicalDelayDays: typical, adjusted, from };
  return forecast.date < today ? null : forecast;
}

/**
 * The same shipments with each history-adjusted forecast written into `eta`, so the cover and
 * stock-chart code can project "if suppliers are as late as usual" without knowing about it.
 * Shipments already overdue are left as they are: the cover ignores arrivals before today, so
 * moving them into the future would make the "late as usual" line look better than today's.
 */
export function withForecastArrivals(shipments: Shipment[], today: IsoDate): Shipment[] {
  const index = reliabilityIndex(supplierReliability(shipments, today));
  return shipments.map((s) => {
    if (expectedArrival(s) < today) return s;
    const f = forecastArrival(s, index, today);
    return f && f.basis === 'history' ? { ...s, eta: f.date } : s;
  });
}
