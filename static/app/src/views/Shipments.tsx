import { useMemo, useState } from 'react';
import { call, useAsync, type Shipment } from '../api';
import { EmptyState, ErrorState, Loading, SeverityBadge, StatusBadge } from '../components';
import { fmtDate, fmtNumber, STATUS_LABEL } from '../format';
import type { NavProps } from '../App';

export function Shipments({ dataVersion, onOpenShipment }: NavProps) {
  const state = useAsync(() => call('listShipments'), [dataVersion]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | Shipment['status']>('all');
  const [atRiskOnly, setAtRiskOnly] = useState(false);

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

  if (state.status === 'loading') return <Loading label="Loading shipments…" />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={state.reload} />;
  if (state.data.shipments.length === 0) {
    return <EmptyState title="No shipments imported">Import a shipments CSV from Import &amp; Settings.</EmptyState>;
  }

  return (
    <div className="stack">
      <div className="filters" role="search">
        <input
          type="search"
          className="input"
          placeholder="Search ID, supplier, SKU, warehouse…"
          aria-label="Search shipments"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="input" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <label className="checkbox">
          <input type="checkbox" checked={atRiskOnly} onChange={(e) => setAtRiskOnly(e.target.checked)} /> At risk only
        </label>
        <span className="muted small">{rows.length} of {state.data.shipments.length}</span>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Shipment</th><th>Supplier</th><th>SKU</th><th className="num">Qty</th>
              <th>Planned</th><th>ETA</th><th>Status</th><th>Warehouse</th><th>Risk</th>
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
                <td className="num">{fmtNumber(s.qty)}</td>
                <td>{fmtDate(s.plannedArrival)}</td>
                <td>{s.actualArrival ? <span className="muted">Arrived {fmtDate(s.actualArrival)}</span> : fmtDate(s.eta)}</td>
                <td><StatusBadge status={s.status} /></td>
                <td>{s.warehouse}</td>
                <td>{s.topSeverity ? <SeverityBadge severity={s.topSeverity} /> : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted pad">No shipments match these filters.</p>}
      </div>
    </div>
  );
}
