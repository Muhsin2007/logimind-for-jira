import { useMemo, useState } from 'react';
import { call, useAsync, type Shipment } from '../api';
import { EmptyState, ErrorState, Loading, SeverityBadge, StatusBadge } from '../components';
import type { NavProps } from '../App';
import { useI18n } from '../i18n';

export function Shipments({ dataVersion, onOpenShipment }: NavProps) {
  const state = useAsync(() => call('listShipments'), [dataVersion]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | Shipment['status']>('all');
  const [atRiskOnly, setAtRiskOnly] = useState(false);
  const { t, fmt } = useI18n();

  const rows = useMemo(() => {
    if (state.status !== 'ready') return [];
    const q = query.trim().toLowerCase();
    return state.data.shipments.filter(
      (s) =>
        (status === 'all' || s.status === status) &&
        (!atRiskOnly || s.riskIds.length > 0) &&
        (!q || [s.id, s.orderId, s.supplier, s.sku, s.productName, s.warehouse].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [state, query, status, atRiskOnly]);

  if (state.status === 'loading') return <Loading label={t.loadingShipments} />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={state.reload} />;
  if (state.data.shipments.length === 0) {
    return <EmptyState title={t.noShipmentsTitle}>{t.noShipmentsText}</EmptyState>;
  }

  return (
    <div className="stack">
      <div className="filters" role="search">
        <input
          type="search"
          className="input"
          placeholder={t.searchShipments}
          aria-label={t.searchShipmentsLabel}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="input" aria-label={t.filterStatus} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">{t.allStatuses}</option>
          {Object.entries(t.status).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <label className="checkbox">
          <input type="checkbox" checked={atRiskOnly} onChange={(e) => setAtRiskOnly(e.target.checked)} /> {t.atRiskOnly}
        </label>
        <span className="muted small">{t.ofTotal(rows.length, state.data.shipments.length)}</span>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t.colShipment}</th><th>{t.colSupplier}</th><th>{t.colSku}</th><th className="num">{t.colQty}</th>
              <th>{t.colPlanned}</th><th>{t.colEta}</th><th>{t.colStatus}</th><th>{t.colWarehouse}</th><th>{t.colRisk}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              // The ID button is the accessible control; row click is a mouse convenience.
              <tr key={s.id} className="clickable" onClick={() => onOpenShipment(s.id)}>
                <td>
                  <button
                    type="button"
                    className="link mono"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenShipment(s.id);
                    }}
                  >
                    {s.id}
                  </button>
                </td>
                <td>{s.supplier}</td>
                <td className="mono">{s.sku}</td>
                <td className="num">{fmt.number(s.qty)}</td>
                <td>{fmt.date(s.plannedArrival)}</td>
                <td>{s.actualArrival ? <span className="muted">{t.arrivedOn(fmt.date(s.actualArrival))}</span> : fmt.date(s.eta)}</td>
                <td><StatusBadge status={s.status} /></td>
                <td>{s.warehouse}</td>
                <td>{s.topSeverity ? <SeverityBadge severity={s.topSeverity} /> : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted pad">{t.noShipmentsMatch}</p>}
      </div>
    </div>
  );
}
