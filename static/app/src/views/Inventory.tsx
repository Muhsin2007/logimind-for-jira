import { useMemo, useState } from 'react';
import { call, useAsync } from '../api';
import { EmptyState, ErrorState, Loading, SeverityBadge } from '../components';
import { fmtMoney, fmtNumber } from '../format';
import type { NavProps } from '../App';

export function Inventory({ dataVersion }: NavProps) {
  const state = useAsync(() => call('listInventory'), [dataVersion]);
  const [query, setQuery] = useState('');
  const [belowOnly, setBelowOnly] = useState(false);

  const rows = useMemo(() => {
    if (state.status !== 'ready') return [];
    const q = query.trim().toLowerCase();
    return state.data.items.filter(
      (i) =>
        (!belowOnly || i.shortfall > 0) &&
        (!q || [i.sku, i.productName, i.warehouse].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [state, query, belowOnly]);

  if (state.status === 'loading') return <Loading label="Loading inventory…" />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={state.reload} />;
  if (state.data.items.length === 0) {
    return <EmptyState title="No inventory imported">Import an inventory CSV from Import &amp; Settings.</EmptyState>;
  }

  return (
    <div className="stack">
      <div className="filters" role="search">
        <input
          type="search"
          className="input"
          placeholder="Search SKU, product, warehouse…"
          aria-label="Search inventory"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="checkbox">
          <input type="checkbox" checked={belowOnly} onChange={(e) => setBelowOnly(e.target.checked)} /> Below safety stock only
        </label>
        <span className="muted small">{rows.length} of {state.data.items.length}</span>
      </div>
      <p className="muted small">
        Available = on hand − reserved. Projected adds open, on-time inbound shipments due within 7 days.
      </p>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>SKU</th><th>Product</th><th>Warehouse</th>
              <th className="num">On hand</th><th className="num">Reserved</th><th className="num">Available</th>
              <th className="num">Inbound 7d</th><th className="num">Projected</th><th className="num">Safety</th>
              <th>Coverage</th><th className="num">Unit cost</th><th>Risk</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const coverage = i.safetyStock === 0 ? 1 : Math.max(0, i.projected) / i.safetyStock;
              return (
                <tr key={`${i.sku}@${i.warehouse}`}>
                  <td className="mono">{i.sku}</td>
                  <td>{i.productName ?? '—'}</td>
                  <td>{i.warehouse}</td>
                  <td className="num">{fmtNumber(i.onHand)}</td>
                  <td className="num">{fmtNumber(i.reserved)}</td>
                  <td className="num">{fmtNumber(i.available)}</td>
                  <td className="num" title={i.inboundShipmentIds.join(', ') || undefined}>{fmtNumber(i.inboundSoon)}</td>
                  <td className="num"><strong>{fmtNumber(i.projected)}</strong></td>
                  <td className="num">{fmtNumber(i.safetyStock)}</td>
                  <td>
                    <span
                      className="meter"
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(Math.min(coverage, 1) * 100)}
                      aria-label={`Projected stock is ${Math.round(coverage * 100)}% of safety stock`}
                      title={`${Math.round(coverage * 100)}% of safety stock`}
                    >
                      <span className={`meter-fill${coverage < 1 ? ' meter-low' : ''}`} style={{ width: `${Math.min(coverage, 1) * 100}%` }} />
                    </span>
                  </td>
                  <td className="num">{i.unitCost === null ? '—' : fmtMoney(i.unitCost)}</td>
                  <td>{i.risk ? <SeverityBadge severity={i.risk.severity} /> : <span className="muted">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted pad">No inventory rows match these filters.</p>}
      </div>
    </div>
  );
}
