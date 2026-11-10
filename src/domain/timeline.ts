import { addDays, daysBetween } from './dates';
import { expectedArrival, isOpen } from './risk-engine';
import type { IsoDate, Shipment, ShipmentStatus } from './types';

export interface TimelineItem {
  id: string;
  sku: string;
  warehouse: string;
  supplier: string;
  qty: number;
  status: ShipmentStatus;
  planned: IsoDate;
  /** ETA, or the planned date when there is no ETA. */
  expected: IsoDate;
  eta: IsoDate | null;
  /** Expected minus planned arrival, in days (positive = slipped later). */
  slipDays: number;
  /** Days past the planned arrival (0 when not late). */
  daysLate: number;
  /** Expected before today: the shipment should already be here. */
  overdue: boolean;
}

export interface InboundTimeline {
  today: IsoDate;
  start: IsoDate;
  end: IsoDate;
  /** Weekly gridlines aligned to today, inside [start, end]. */
  ticks: IsoDate[];
  items: TimelineItem[];
  /** Open shipments not drawn: expected after the horizon, or over the item cap. */
  later: number;
}

export interface TimelineOptions {
  pastDays?: number;
  horizonDays?: number;
  maxItems?: number;
}

const MIN_AHEAD_DAYS = 7;
const minDate = (a: IsoDate, b: IsoDate) => (a < b ? a : b);
const maxDate = (a: IsoDate, b: IsoDate) => (a > b ? a : b);

/**
 * Open shipments on a calendar: planned → expected arrival for each, earliest first. The range
 * covers the shipments' dates, reaching back at most `pastDays` and ahead at most `horizonDays`.
 */
export function inboundTimeline(shipments: Shipment[], today: IsoDate, options: TimelineOptions = {}): InboundTimeline {
  const { pastDays = 14, horizonDays = 42, maxItems = 25 } = options;
  const floor = addDays(today, -pastDays);
  const horizon = addDays(today, horizonDays);

  const open = shipments
    .filter(isOpen)
    .map((s): TimelineItem => {
      const expected = expectedArrival(s);
      return {
        id: s.id,
        sku: s.sku,
        warehouse: s.warehouse,
        supplier: s.supplier,
        qty: s.qty,
        status: s.status,
        planned: s.plannedArrival,
        expected,
        eta: s.eta,
        slipDays: daysBetween(s.plannedArrival, expected),
        daysLate: Math.max(0, daysBetween(s.plannedArrival, today)),
        overdue: expected < today,
      };
    })
    .sort((a, b) => a.expected.localeCompare(b.expected) || a.id.localeCompare(b.id));

  let start = today;
  let end = addDays(today, MIN_AHEAD_DAYS);
  for (const i of open) {
    start = minDate(start, maxDate(floor, minDate(i.planned, i.expected)));
    end = maxDate(end, minDate(horizon, maxDate(i.planned, i.expected)));
  }

  const inRange = open.filter((i) => i.expected <= horizon);
  const items = inRange.slice(0, Math.max(0, maxItems));

  const ticks: IsoDate[] = [];
  const back = Math.floor(daysBetween(start, today) / 7);
  for (let d = addDays(today, -7 * back); d <= end; d = addDays(d, 7)) ticks.push(d);

  return { today, start, end, ticks, items, later: open.length - items.length };
}
