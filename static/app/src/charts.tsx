import { daysBetween } from '../../../src/domain/dates';
import type { StockSeries } from '../../../src/domain/stock-series';
import type { InboundTimeline, TimelineItem } from '../../../src/domain/timeline';
import type { IsoDate } from './api';
import { useI18n } from './i18n';

/* ------------------------------------------------------------------ Inbound timeline */

type Tone = 'overdue' | 'slip' | 'onplan';
const toneOf = (i: TimelineItem): Tone => (i.overdue ? 'overdue' : i.slipDays > 0 ? 'slip' : 'onplan');

/**
 * Open shipments on a calendar, one row each: a bar from planned to expected arrival (to today
 * when the shipment is overdue). Rows are buttons that open the shipment; every row carries its
 * facts as text, so colour is never the only signal.
 */
export function InboundTimelineChart({ timeline, onOpen }: { timeline: InboundTimeline; onOpen: (id: string) => void }) {
  const { t, fmt } = useI18n();
  const d = t.design;
  const span = Math.max(1, daysBetween(timeline.start, timeline.end));
  const ratio = (date: IsoDate) => Math.min(span, Math.max(0, daysBetween(timeline.start, date))) / span;
  const pos = (date: IsoDate) => `${ratio(date) * 100}%`;
  const today = pos(timeline.today);

  const state = (i: TimelineItem) =>
    i.overdue ? d.stateOverdue(i.daysLate) : i.slipDays > 0 ? d.stateSlip(i.slipDays) : i.slipDays < 0 ? d.stateEarly(-i.slipDays) : d.stateOnPlan;
  const note = (i: TimelineItem) => (i.overdue ? d.noteLate(i.daysLate) : i.slipDays > 0 ? d.noteSlip(i.slipDays) : '');

  return (
    <div className="tl">
      <div className="tl-axis" aria-hidden="true">
        <span className="tl-label" />
        <span className="tl-axis-track">
          {timeline.ticks.map((tick) => (
            <span key={tick} className={`tl-tick${tick === timeline.today ? ' tl-tick-today' : ''}${ratio(tick) > 0.9 ? ' tl-tick-end' : ''}`} style={{ left: pos(tick) }}>
              {tick === timeline.today ? d.todayLine : fmt.dayMonth(tick)}
            </span>
          ))}
        </span>
      </div>
      <ul className="tl-rows">
        {timeline.items.map((i) => {
          const tone = toneOf(i);
          const from = i.planned < i.expected ? i.planned : i.expected;
          const to = i.overdue ? timeline.today : i.planned > i.expected ? i.planned : i.expected;
          return (
            <li key={i.id}>
              <button
                type="button"
                className="tl-row"
                aria-label={d.timelineRow(i.id, i.sku, i.warehouse, fmt.date(i.planned), i.eta ? fmt.date(i.expected) : d.noEta, state(i))}
                onClick={() => onOpen(i.id)}
              >
                <span className="tl-label" aria-hidden="true">
                  <span className="mono tl-id">{i.id}</span>
                  <span className="tl-sub">{fmt.number(i.qty)} × {i.sku} → {i.warehouse}</span>
                </span>
                <span className="tl-track" aria-hidden="true">
                  <span className="tl-today" style={{ left: today }} />
                  {to > from && <span className={`tl-bar tl-${tone}`} style={{ left: pos(from), width: `${(ratio(to) - ratio(from)) * 100}%` }} />}
                  {(i.overdue || i.planned !== i.expected) && <span className="tl-mark tl-mark-planned" style={{ left: pos(i.planned) }} />}
                  {!i.overdue && <span className={`tl-mark tl-mark-expected tl-${tone}`} style={{ left: pos(i.expected) }} />}
                  {note(i) && (ratio(to) > 0.85
                    ? <span className={`tl-note tl-note-${tone} tl-note-left`} style={{ left: pos(from) }}>{note(i)}</span>
                    : <span className={`tl-note tl-note-${tone}`} style={{ left: pos(to) }}>{note(i)}</span>)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <ul className="chart-legend" aria-label={d.legend}>
        <li><span className="lg-swatch tl-onplan" aria-hidden="true" />{d.legendOnTime}</li>
        <li><span className="lg-swatch tl-slip" aria-hidden="true" />{d.legendSlip}</li>
        <li><span className="lg-swatch tl-overdue" aria-hidden="true" />{d.legendOverdue}</li>
        <li><span className="lg-swatch lg-planned" aria-hidden="true" />{d.plannedMark}</li>
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ Stock chart */

const W = 640;
const H = 220;
const PAD = { left: 44, right: 16, top: 20, bottom: 28 };

/** Polyline points from the domain path (arrivals are jumps; a drop to zero meets 0 exactly). */
const linePoints = (series: StockSeries, x: (day: number) => number, y: (v: number) => number): string =>
  series.path.map((p) => `${x(p.day)},${y(p.level)}`).join(' ');

/** A round axis maximum: 10, 20, …, 100, 200, … */
const niceMax = (v: number) => {
  if (v <= 10) return 10;
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / step) * step;
};

/**
 * Projected stock per day with the safety-stock line, arrivals and the stock-out date. With
 * `compare`, a second (dashed) line shows the same position in a what-if scenario or with
 * suppliers as late as usual. The summary
 * sentence and the arrivals list carry the same facts as text.
 */
export function StockChart({ series, stockOutDate, belowSafetyDate, compare, compareStockOutDate, compareKind = 'delay' }: {
  series: StockSeries;
  stockOutDate: IsoDate | null;
  belowSafetyDate: IsoDate | null;
  compare?: StockSeries;
  compareStockOutDate?: IsoDate | null;
  /** What the dashed line means: a what-if delay, or suppliers being as late as usual. */
  compareKind?: 'delay' | 'history';
}) {
  const { t, fmt } = useI18n();
  const d = t.design;
  const history = compareKind === 'history';
  const today = series.points[0].date;
  const all = [...series.points, ...(compare?.points ?? [])].map((p) => p.level);
  const top = niceMax(Math.max(series.safetyStock, ...all) * 1.1);
  const x = (day: number) => PAD.left + (day / series.days) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / top) * (H - PAD.top - PAD.bottom);
  const dayOf = (date: IsoDate) => daysBetween(today, date);
  const inWindow = (date: IsoDate | null | undefined): date is IsoDate => !!date && dayOf(date) >= 0 && dayOf(date) <= series.days;
  const ticks = series.points.filter((p) => p.day % 7 === 0 && p.day <= series.days - 3);
  const end = series.points[series.points.length - 1];
  const line = linePoints(series, x, y);

  let summary = d.chartSummary(fmt.number(series.points[0].level), fmt.number(end.level), series.days, fmt.number(series.safetyStock));
  if (inWindow(stockOutDate)) summary += d.chartSummaryOut(fmt.date(stockOutDate));
  else if (inWindow(belowSafetyDate)) summary += d.chartSummaryBelow(fmt.date(belowSafetyDate));
  if (compare && inWindow(compareStockOutDate) && !(history && compareStockOutDate === stockOutDate)) summary += (history ? t.supplier.chartSummaryOut : d.chartSummaryCompareOut)(fmt.date(compareStockOutDate));

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" aria-hidden="true" focusable="false">
        {series.safetyStock > 0 && (
          <rect className="ch-danger-zone" x={PAD.left} y={y(series.safetyStock)} width={W - PAD.left - PAD.right} height={y(0) - y(series.safetyStock)} />
        )}
        {[0, top / 2, top].map((v) => (
          <g key={v}>
            <line className="ch-grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text className="ch-axis" x={PAD.left - 6} y={y(v) + 4} textAnchor="end">{fmt.number(Math.round(v))}</text>
          </g>
        ))}
        {ticks.map((p) => (
          <text key={p.day} className="ch-axis" x={x(p.day)} y={H - 8} textAnchor={p.day === 0 ? 'start' : 'middle'}>
            {p.day === 0 ? d.chartToday : fmt.dayMonth(p.date)}
          </text>
        ))}
        {series.safetyStock > 0 && <line className="ch-safety" x1={PAD.left} x2={W - PAD.right} y1={y(series.safetyStock)} y2={y(series.safetyStock)} />}

        <polygon className="ch-area" points={`${x(0)},${y(0)} ${line} ${x(series.days)},${y(0)}`} />
        {compare && <polyline className="ch-line ch-line-compare" points={linePoints(compare, x, y)} />}
        <polyline className="ch-line" points={line} />

        {series.arrivals.map((a) => (
          <g key={a.day}>
            <circle className="ch-arrival" cx={x(a.day)} cy={y(series.points[a.day].level)} r={4} />
            <text className="ch-label" x={x(a.day)} y={y(series.points[a.day].level) - 9} textAnchor="middle">+{fmt.number(a.qty)}</text>
          </g>
        ))}
        {series.stockOut !== null && <StockOutMark x={x(series.stockOut)} y={y(0)} />}
        {compare && compare.stockOut !== null && <StockOutMark x={x(compare.stockOut)} y={y(0)} compare />}
      </svg>
      <figcaption>
        <p className="chart-summary">{summary}</p>
        <ul className="chart-legend" aria-label={d.legend}>
          <li><span className="lg-swatch lg-line" aria-hidden="true" />{compare ? d.chartTodayLine : d.chartLevel}</li>
          {compare && <li><span className="lg-swatch lg-line-compare" aria-hidden="true" />{history ? t.supplier.chartLine : d.chartWithDelay}</li>}
          {series.safetyStock > 0 && <li><span className="lg-swatch lg-safety" aria-hidden="true" />{d.chartSafety}</li>}
          <li><span className="lg-swatch lg-arrival" aria-hidden="true" />{d.chartArrival}</li>
          <li><span className="lg-swatch lg-out" aria-hidden="true" />{d.chartStockOut}</li>
        </ul>
        {series.flat && <p className="footnote">{d.chartFlat}</p>}
        {compare && history && <p className="footnote">{t.supplier.chartNote}</p>}
        {compare && <p className="footnote">{d.chartLostSales}</p>}
        <p className="sr-only">
          {d.chartArrivals}: {series.arrivals.length === 0 ? d.chartNoArrivals : series.arrivals.map((a) => `${fmt.date(a.date)} +${fmt.number(a.qty)}`).join(', ')}
        </p>
      </figcaption>
    </figure>
  );
}

function StockOutMark({ x, y, compare }: { x: number; y: number; compare?: boolean }) {
  return <path className={`ch-out${compare ? ' ch-out-compare' : ''}`} d={`M ${x} ${y - 10} L ${x + 6} ${y} L ${x - 6} ${y} Z`} />;
}
