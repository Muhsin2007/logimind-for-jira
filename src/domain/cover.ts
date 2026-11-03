import { addDays, daysBetween } from './dates';
import { expectedArrival, isOpen, locationKey } from './risk-engine';
import type { InventoryItem, IsoDate, Shipment } from './types';

/** Projections look this far ahead; beyond it a SKU counts as covered. */
export const COVER_HORIZON_DAYS = 180;
/** Rounding guard so fractional usage (e.g. 0.1/day) never drifts across a day boundary. */
const EPSILON = 1e-9;

export interface CoverProjection {
  /** Average units used per day from the inventory file; null when not provided. */
  dailyUsage: number | null;
  /** Whole days until stock runs out; null without usage or when it lasts beyond the horizon. */
  daysOfCover: number | null;
  /** Day during which stock runs out (later arrivals may refill it). */
  stockOutDate: IsoDate | null;
  /** Day during which stock first drops below safety stock (same convention as the stock-out date). */
  belowSafetyDate: IsoDate | null;
  /** No stock-out within COVER_HORIZON_DAYS. */
  beyondHorizon: boolean;
}

export interface CoverInput {
  /** On hand − reserved. */
  available: number;
  safetyStock: number;
  dailyUsage: number | null;
  /** Expected arrivals of open shipments for this SKU at this warehouse. */
  arrivals: { date: IsoDate; qty: number }[];
}

/**
 * Deterministic stock projection: available stock is used up at the average daily usage, and
 * each inbound shipment adds its quantity at the start of its expected arrival day. Arrivals
 * dated before today are overdue (their real date is unknown) and are not counted.
 */
export function projectCover(input: CoverInput, today: IsoDate): CoverProjection {
  const usage = input.dailyUsage;
  // NaN or Infinity can only come from hand-edited storage; treat it as "no usage", never as "safe".
  if (usage === null || !Number.isFinite(usage) || usage <= 0) {
    return { dailyUsage: usage, daysOfCover: null, stockOutDate: null, belowSafetyDate: null, beyondHorizon: false };
  }
  const arrivals = input.arrivals
    .map((a) => ({ day: daysBetween(today, a.date), qty: a.qty }))
    .filter((a) => a.day >= 0 && a.day < COVER_HORIZON_DAYS)
    .sort((a, b) => a.day - b.day);

  const stockOut = firstDrop(input.available, usage, arrivals, 0, true);
  const belowSafety = input.safetyStock > 0 ? firstDrop(input.available, usage, arrivals, input.safetyStock, false) : null;
  return {
    dailyUsage: usage,
    daysOfCover: stockOut,
    stockOutDate: stockOut === null ? null : addDays(today, stockOut),
    belowSafetyDate: belowSafety === null ? null : addDays(today, belowSafety),
    beyondHorizon: stockOut === null,
  };
}

/**
 * Day offset (whole days from today) when stock first falls to the threshold (stock-out:
 * reaches 0) or below it (safety stock), or null if that does not happen within the horizon.
 */
function firstDrop(available: number, usage: number, arrivals: { day: number; qty: number }[], threshold: number, inclusive: boolean): number | null {
  let level = available;
  let t = 0;
  let i = 0;
  while (t < COVER_HORIZON_DAYS) {
    while (i < arrivals.length && arrivals[i].day <= t) level += arrivals[i++].qty;
    if (inclusive ? level <= threshold + EPSILON : level < threshold - EPSILON) return Math.floor(t + EPSILON);
    const next = i < arrivals.length ? arrivals[i].day : COVER_HORIZON_DAYS;
    const crossing = t + (level - threshold) / usage;
    // Reaching the threshold exactly when a shipment lands is just in time, not a drop.
    if (crossing < next - EPSILON) return crossing < COVER_HORIZON_DAYS ? Math.floor(crossing + EPSILON) : null;
    level -= usage * (next - t);
    t = next;
  }
  return null;
}

/** Open shipments by location (`locationKey`), at any expected arrival date. */
export type PipelineIndex = Map<string, Shipment[]>;

export function buildPipelineIndex(shipments: Shipment[]): PipelineIndex {
  const index: PipelineIndex = new Map();
  for (const s of shipments) {
    if (!isOpen(s)) continue;
    const key = locationKey(s.sku, s.warehouse);
    const list = index.get(key);
    if (list) list.push(s);
    else index.set(key, [s]);
  }
  return index;
}

/** Days of cover for a stock position, using every open inbound shipment to its location. */
export function coverFor(item: InventoryItem, pipeline: PipelineIndex, today: IsoDate): CoverProjection {
  const inbound = pipeline.get(locationKey(item.sku, item.warehouse)) ?? [];
  return projectCover(
    {
      available: item.onHand - item.reserved,
      safetyStock: item.safetyStock,
      dailyUsage: item.dailyUsage ?? null,
      arrivals: inbound.map((s) => ({ date: expectedArrival(s), qty: s.qty })),
    },
    today,
  );
}
