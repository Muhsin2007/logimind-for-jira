import type { CoverInput, PipelineIndex } from './cover';
import { addDays, daysBetween } from './dates';
import { expectedArrival, locationKey } from './risk-engine';
import type { InventoryItem, IsoDate } from './types';

/** The chart never looks further ahead than this. */
export const MAX_SERIES_DAYS = 90;

export interface StockPoint {
  /** Whole days from today (0 = today). */
  day: number;
  date: IsoDate;
  /** Units available at the start of the day, after that day's arrivals; never below 0. */
  level: number;
  /** Units arriving that day. */
  arrival: number;
}

export interface StockSeries {
  days: number;
  safetyStock: number;
  dailyUsage: number | null;
  /** No usable daily usage: the level only changes when shipments arrive. */
  flat: boolean;
  /** `days + 1` points, today included. */
  points: StockPoint[];
  /** Arrivals counted in the window, by day. */
  arrivals: { day: number; date: IsoDate; qty: number }[];
}

/** Hides floating-point noise from fractional daily usage. */
const tidy = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Day-by-day stock level for the chart, with the same conventions as `projectCover`: stock is
 * used at the average daily rate, each arrival lands at the start of its expected day, and
 * overdue arrivals (dated before today) are not counted. A stock-out stays at 0 until the next
 * arrival refills it; unmet demand is not carried over.
 */
export function stockSeries(input: CoverInput, today: IsoDate, days = 30): StockSeries {
  const window = Math.min(MAX_SERIES_DAYS, Math.max(1, Math.trunc(days) || 1));
  const usable = input.dailyUsage !== null && Number.isFinite(input.dailyUsage) && input.dailyUsage > 0;
  const usage = usable ? (input.dailyUsage as number) : 0;

  const byDay = new Map<number, number>();
  for (const a of input.arrivals) {
    const day = daysBetween(today, a.date);
    if (day < 0 || day > window) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + a.qty);
  }

  const points: StockPoint[] = [];
  let level = Math.max(0, input.available);
  for (let day = 0; day <= window; day++) {
    if (day > 0) level = Math.max(0, level - usage);
    const arrival = byDay.get(day) ?? 0;
    level = tidy(level + arrival);
    points.push({ day, date: addDays(today, day), level, arrival });
  }

  return {
    days: window,
    safetyStock: input.safetyStock,
    dailyUsage: input.dailyUsage,
    flat: !usable,
    points,
    arrivals: [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, qty]) => ({ day, date: addDays(today, day), qty })),
  };
}

/** The series for a stock position, using every open inbound shipment to its location (as `coverFor`). */
export function seriesFor(item: InventoryItem, pipeline: PipelineIndex, today: IsoDate, days = 30): StockSeries {
  const inbound = pipeline.get(locationKey(item.sku, item.warehouse)) ?? [];
  return stockSeries(
    {
      available: item.onHand - item.reserved,
      safetyStock: item.safetyStock,
      dailyUsage: item.dailyUsage ?? null,
      arrivals: inbound.map((s) => ({ date: expectedArrival(s), qty: s.qty })),
    },
    today,
    days,
  );
}
