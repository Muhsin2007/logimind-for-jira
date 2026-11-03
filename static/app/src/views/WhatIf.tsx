import { useDeferredValue, useId, useMemo, useState, type ReactNode } from 'react';
import { delayCandidates, MAX_DELAY_DAYS, simulateDelay, type StockOutlook } from '../../../../src/domain/what-if';
import { call, useAsync } from '../api';
import { CoverValue, EmptyState, ErrorState, Loading, Panel, SeverityBadge } from '../components';
import type { NavProps } from '../App';
import { useI18n } from '../i18n';

type Mode = 'shipment' | 'supplier';
const DEFAULT_DELAY = 7;

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

  if (state.status === 'loading') return <Loading label={t.loadingWhatIf} />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={state.reload} />;
  if (state.data.shipments.length === 0 || state.data.items.length === 0) return <EmptyState title={t.whatIfNoData} />;
  if (!candidates || candidates.shipments.length === 0 || !result) return <EmptyState title={t.noUpcoming} />;

  const worse = result.rows.filter((r) => r.worse).length;
  const delayText = t.delayDays(result.delayDays);
  // A shipment sent from the drawer that can no longer be delayed (e.g. it became overdue).
  const preselectMissing = mode === 'shipment' && !!whatIfShipmentId && shipmentId === whatIfShipmentId && selectedId !== whatIfShipmentId;

  return (
    <div className="stack">
      <p className="notice" role="note">{t.whatIfIntro}</p>

      <Panel title={t.tabs.whatIf}>
        <div className="whatif-controls">
          <fieldset className="radio-group">
            <legend className="h4">{t.delayWhat}</legend>
            {(['shipment', 'supplier'] as const).map((m) => (
              <label key={m} className="checkbox">
                <input type="radio" name={`${ids}-mode`} value={m} checked={mode === m} onChange={() => setMode(m)} />
                {m === 'shipment' ? t.modeShipment : t.modeSupplier}
              </label>
            ))}
          </fieldset>

          {mode === 'shipment' ? (
            <label className="field">
              <span className="h4">{t.chooseShipment}</span>
              <select className="input" value={selectedId} onChange={(e) => setShipmentId(e.target.value)}>
                {candidates.shipments.map((s) => (
                  <option key={s.id} value={s.id}>{t.shipmentOption(s.id, s.sku, s.warehouse, fmt.date(s.eta ?? s.plannedArrival))}</option>
                ))}
              </select>
            </label>
          ) : (
            <label className="field">
              <span className="h4">{t.chooseSupplier}</span>
              <select className="input" value={selectedSupplier} onChange={(e) => setSupplier(e.target.value)}>
                {candidates.suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}

          <div className="field slider-field">
            <label htmlFor={`${ids}-delay`} className="h4">{t.delayBy}</label>
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
            <output htmlFor={`${ids}-delay`} className="slider-value">{t.delayDays(delay)}</output>
          </div>
        </div>

        {preselectMissing && <p className="notice" role="note">{t.notUpcoming(whatIfShipmentId)}</p>}
        <p className="whatif-summary" aria-live="polite">
          {result.delayDays === 0 ? t.moveSlider : worse > 0 ? <strong className="text-danger">{t.summaryWorse(worse, delayText)}</strong> : t.summaryNone(delayText)}
        </p>

        <h3 className="h4">{t.delayedShipments}</h3>
        <ul className="plain-list">
          {result.shipments.map((s) => (
            <li key={s.id}>
              <span className="mono">{s.id}</span> · {fmt.number(s.qty)} × <span className="mono">{s.sku}</span> → {s.warehouse}:{' '}
              {t.arrivalMove(fmt.date(s.from), fmt.date(s.to))}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={t.impactTitle}>
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
                    <td className="mono">{r.sku}</td>
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
        {result.untracked.length > 0 && <p className="muted small">{t.untracked(result.untracked.join(', '))}</p>}
        <p className="muted small">{t.coverNote}</p>
      </Panel>
    </div>
  );
}

/** "today → with delay", with both halves labelled for screen readers. */
function Compare({ before, after, render }: { before: StockOutlook; after: StockOutlook; render: (o: StockOutlook) => ReactNode }) {
  const { t } = useI18n();
  return (
    <span className="compare">
      <span><span className="sr-only">{t.today}: </span>{render(before)}</span>
      <span aria-hidden="true" className="muted"> → </span>
      <span><span className="sr-only">{t.withDelay}: </span>{render(after)}</span>
    </span>
  );
}
