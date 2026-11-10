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
  /** Units available at the start of the day, after that day's arrivals; never below 0 (a shortfall shows as 0). */
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
  /** Vertices of the drawn line: arrivals are vertical jumps, and a drop to zero meets 0 at its exact time. */
  path: { day: number; level: number }[];
  /**
   * When stock first runs out, in (fractional) days from today, or null if not in the window.
   * `Math.floor(stockOut)` equals `projectCover().daysOfCover` for the same input.
   */
  stockOut: number | null;
}

const EPSILON = 1e-9;

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
  const path: { day: number; level: number }[] = [];
  let stockOut: number | null = null;
  const shown = (balance: number) => tidy(Math.max(0, balance));
  // A negative balance is stock already reserved: arrivals cover it first. Daily use is only
  // taken from stock that exists; demand while out of stock is lost, not carried over.
  let balance = input.available;
  for (let day = 0; day <= window; day++) {
    const arrival = byDay.get(day) ?? 0;
    if (day > 0 && balance > 0) {
      const after = balance - usage;
      // Reaching zero exactly as a shipment lands is just in time (as in projectCover).
      const ranOut = after < -EPSILON || (after <= EPSILON && arrival === 0);
      if (ranOut) {
        const at = tidy(day - 1 + balance / usage);
        stockOut ??= at;
        if (at < day) path.push({ day: at, level: 0 });
      }
      balance = Math.max(0, after);
    }
    if (arrival > 0) path.push({ day, level: shown(balance) });
    balance += arrival;
    if (day === 0 && stockOut === null && balance <= EPSILON && usage > 0) stockOut = 0;
    points.push({ day, date: addDays(today, day), level: shown(balance), arrival });
    path.push({ day, level: shown(balance) });
  }

  return {
    days: window,
    safetyStock: input.safetyStock,
    dailyUsage: input.dailyUsage,
    flat: !usable,
    points,
    arrivals: [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, qty]) => ({ day, date: addDays(today, day), qty })),
    path,
    stockOut,
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
