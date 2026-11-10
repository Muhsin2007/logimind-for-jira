import { useDeferredValue, useId, useMemo, useState, type ReactNode } from 'react';
import { buildPipelineIndex } from '../../../../src/domain/cover';
import { daysBetween } from '../../../../src/domain/dates';
import { MAX_SERIES_DAYS, seriesFor } from '../../../../src/domain/stock-series';
import { delayCandidates, MAX_DELAY_DAYS, simulateDelay, type StockOutlook, type WhatIfResult } from '../../../../src/domain/what-if';
import { call, useAsync, type InventoryRow, type Shipment } from '../api';
import { StockChart } from '../charts';
import { Callout, CoverValue, EmptyState, ErrorState, Loading, Panel, Segmented, SeverityBadge } from '../components';
import type { NavProps } from '../App';
import { useI18n } from '../i18n';

type Mode = 'shipment' | 'supplier';
const DEFAULT_DELAY = 7;
/** Shortest comparison window; it grows so the latest delayed arrival lands with a week to spare. */
const MIN_CHART_DAYS = 45;
const chartDays = (today: string, arrivals: string[]): number =>
  Math.min(MAX_SERIES_DAYS, Math.max(MIN_CHART_DAYS, ...arrivals.map((date) => daysBetween(today, date) + 7)));

/**
 * Read-only "what if shipments arrive later?". The same domain code as the server runs here in
 * the browser, so the slider updates instantly; nothing is sent back or stored.
 */
export function WhatIf({ dataVersion, whatIfShipmentId }: NavProps) {
  const state = useAsync(
    () => Promise.all([call('listShipments'), call('listInventory')]).then(([s, i]) => ({ today: s.today, shipments: s.shipments, items: i.items })),
    [dataVersion],
  );
  const { t, fmt } = useI18n();
  const ids = useId();
  // The tab remounts on every visit, so a shipment chosen in the drawer arrives as the initial value.
  const [mode, setMode] = useState<Mode>('shipment');
  const [shipmentId, setShipmentId] = useState(whatIfShipmentId ?? '');
  const [supplier, setSupplier] = useState('');
  const [delay, setDelay] = useState(DEFAULT_DELAY);
  const [chartKey, setChartKey] = useState('');
  // The slider moves at once; the simulation and its announcement follow when React has time.
  const deferredDelay = useDeferredValue(delay);

  const candidates = useMemo(() => (state.status === 'ready' ? delayCandidates(state.data.shipments, state.data.today) : null), [state]);
  const selectedId = candidates?.shipments.some((s) => s.id === shipmentId) ? shipmentId : candidates?.shipments[0]?.id ?? '';
  const selectedSupplier = candidates?.suppliers.includes(supplier) ? supplier : candidates?.suppliers[0] ?? '';

  const result = useMemo(() => {
    if (state.status !== 'ready') return null;
    const scenario = mode === 'shipment' ? { shipmentIds: selectedId ? [selectedId] : [], delayDays: deferredDelay } : { supplier: selectedSupplier, delayDays: deferredDelay };
    return simulateDelay(state.data.shipments, state.data.items, state.data.today, scenario);
  }, [state, mode, selectedId, selectedSupplier, deferredDelay]);

  if (state.status === 'loading') return <Loading label={t.loadingWhatIf} variant="inline" />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={state.reload} />;
  if (state.data.shipments.length === 0 || state.data.items.length === 0) return <EmptyState title={t.whatIfNoData} icon="sliders" />;
  if (!candidates || candidates.shipments.length === 0 || !result) return <EmptyState title={t.noUpcoming} icon="sliders" />;

  const worse = result.rows.filter((r) => r.worse).length;
  const delayText = t.delayDays(result.delayDays);
  // A shipment sent from the drawer that can no longer be delayed (e.g. it became overdue).
  const preselectMissing = mode === 'shipment' && !!whatIfShipmentId && shipmentId === whatIfShipmentId && selectedId !== whatIfShipmentId;

  return (
    <div className="stack">
      <Callout tone="info" role="note">{t.whatIfIntro}</Callout>

      <Panel title={t.scenario} icon="sliders">
        <div className="whatif-controls">
          <div className="field">
            <span className="field-label">{t.delayWhat}</span>
            <Segmented<Mode>
              label={t.delayWhat}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'shipment', label: t.modeShipment },
                { value: 'supplier', label: t.modeSupplier },
              ]}
            />
          </div>

          {mode === 'shipment' ? (
            <label className="field">
              <span className="field-label">{t.chooseShipment}</span>
              <select className="input" value={selectedId} onChange={(e) => setShipmentId(e.target.value)}>
                {candidates.shipments.map((s) => (
                  <option key={s.id} value={s.id}>{t.shipmentOption(s.id, s.sku, s.warehouse, fmt.date(s.eta ?? s.plannedArrival))}</option>
                ))}
              </select>
            </label>
          ) : (
            <label className="field">
              <span className="field-label">{t.chooseSupplier}</span>
              <select className="input" value={selectedSupplier} onChange={(e) => setSupplier(e.target.value)}>
                {candidates.suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}

          <div className="field slider-field">
            <div className="slider-head">
              <label htmlFor={`${ids}-delay`} className="field-label">{t.delayBy}</label>
              <output htmlFor={`${ids}-delay`} className="slider-value">{t.delayDays(delay)}</output>
            </div>
            <input
              id={`${ids}-delay`}
              type="range"
              min={0}
              max={MAX_DELAY_DAYS}
              step={1}
              value={delay}
              aria-valuetext={t.delayDays(delay)}
              onChange={(e) => setDelay(Number(e.target.value))}
            />
            <div className="slider-scale" aria-hidden="true"><span>0</span><span>{MAX_DELAY_DAYS}</span></div>
          </div>
        </div>

        {preselectMissing && <Callout tone="warning" role="note" className="whatif-result">{t.notUpcoming(whatIfShipmentId)}</Callout>}
        <div className="whatif-result" aria-live="polite">
          {result.delayDays === 0 ? (
            <Callout tone="info">{t.moveSlider}</Callout>
          ) : worse > 0 ? (
            <Callout tone="danger" title={t.summaryWorse(worse, delayText)} />
          ) : (
            <Callout tone="success" title={t.summaryNone(delayText)} />
          )}
        </div>

        <h3 className="field-label whatif-result">{t.delayedShipments}</h3>
        <ul className="shipment-list">
          {result.shipments.map((s) => (
            <li key={s.id}>
              <span className="id-chip mono">{s.id}</span>
              <span>{fmt.number(s.qty)} × <span className="mono">{s.sku}</span> → {s.warehouse}</span>
              <span className="muted">{t.arrivalMove(fmt.date(s.from), fmt.date(s.to))}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={t.impactTitle} icon="warehouse">
        {result.rows.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.colSku}</th><th>{t.colWarehouse}</th><th className="num">{t.colSafety}</th>
                  <th>{t.colLowStock}</th><th>{t.colDaysOfCover}</th><th>{t.colBelowSafety}</th><th>{t.colChange}</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.entityKey} className={r.worse ? 'row-worse' : undefined}>
                    <td className="mono cell-main">{r.sku}</td>
                    <td>{r.warehouse}</td>
                    <td className="num">{fmt.number(r.safetyStock)}</td>
                    <td><Compare before={r.before} after={r.after} render={(o) => (o.lowStock ? <SeverityBadge severity={o.lowStock} /> : <span className="muted">{t.okLevel}</span>)} /></td>
                    <td><Compare before={r.before} after={r.after} render={(o) => <CoverValue cover={o.cover} />} /></td>
                    <td><Compare before={r.before} after={r.after} render={(o) => (o.cover.belowSafetyDate ? fmt.date(o.cover.belowSafetyDate) : '—')} /></td>
                    <td>{r.worse ? <span className="badge sev-critical">{t.worse}</span> : <span className="muted">{t.noChange}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result.rows.length > 0 && result.delayDays > 0 && (
          <CompareChart result={result} shipments={state.data.shipments} items={state.data.items} chartKey={chartKey} onChartKey={setChartKey} />
        )}
        {result.untracked.length > 0 && <p className="footnote">{t.untracked(result.untracked.join(', '))}</p>}
        <p className="footnote">{t.coverNote}</p>
      </Panel>
    </div>
  );
}

/** Stock line today and with the delay, for one affected position (the worst first). */
function CompareChart({ result, shipments, items, chartKey, onChartKey }: {
  result: WhatIfResult;
  shipments: Shipment[];
  items: InventoryRow[];
  chartKey: string;
  onChartKey: (key: string) => void;
}) {
  const { t } = useI18n();
  const d = t.design;
  const id = useId();
  const row = result.rows.find((r) => r.entityKey === chartKey) ?? result.rows[0];
  const item = items.find((i) => `${i.sku}@${i.warehouse}` === row.entityKey);
  const charts = useMemo(() => {
    if (!item) return null;
    const moved = new Map(result.shipments.map((s) => [s.id, s.to]));
    const delayed = shipments.map((s) => (moved.has(s.id) ? { ...s, eta: moved.get(s.id) ?? s.eta } : s));
    const days = chartDays(result.today, result.shipments.map((s) => s.to));
    return {
      before: seriesFor(item, buildPipelineIndex(shipments), result.today, days),
      after: seriesFor(item, buildPipelineIndex(delayed), result.today, days),
    };
  }, [item, result, shipments]);
  if (!item || !charts) return null;

  return (
    <div className="whatif-chart">
      <div className="whatif-chart-head">
        <h3 className="field-label">{d.whatIfChartTitle(row.sku, row.warehouse)}</h3>
        {result.rows.length > 1 && (
          <label className="inline-field" htmlFor={`${id}-pos`}>
            <span className="muted">{d.whatIfChartPick}</span>
            <select id={`${id}-pos`} className="input input-sm" value={row.entityKey} onChange={(e) => onChartKey(e.target.value)}>
              {result.rows.map((r) => <option key={r.entityKey} value={r.entityKey}>{r.entityKey}</option>)}
            </select>
          </label>
        )}
      </div>
      <StockChart
        series={charts.before}
        stockOutDate={row.before.cover.stockOutDate}
        belowSafetyDate={row.before.cover.belowSafetyDate}
        compare={charts.after}
        compareStockOutDate={row.after.cover.stockOutDate}
      />
    </div>
  );
}

/** "today → with delay", with both halves labelled for screen readers. */
function Compare({ before, after, render }: { before: StockOutlook; after: StockOutlook; render: (o: StockOutlook) => ReactNode }) {
  const { t } = useI18n();
  return (
    <span className="compare">
      <span><span className="sr-only">{t.today}: </span>{render(before)}</span>
      <span aria-hidden="true" className="subtlest">→</span>
      <span><span className="sr-only">{t.withDelay}: </span>{render(after)}</span>
    </span>
  );
}
