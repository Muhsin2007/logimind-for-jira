import { useMemo, useState } from 'react';
import { daysBetween } from '../../../../src/domain/dates';
import { call, useAsync, type Shipment } from '../api';
import { EmptyState, ErrorState, Loading, SearchField, Segmented, SeverityBadge, StatusBadge } from '../components';
import type { NavProps } from '../App';
import { useI18n } from '../i18n';
import { Icon } from '../icons';

type RiskFilter = 'all' | 'at' | 'none';

export function Shipments({ dataVersion, onOpenShipment }: NavProps) {
  const state = useAsync(() => call('listShipments'), [dataVersion]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | Shipment['status']>('all');
  const [risk, setRisk] = useState<RiskFilter>('all');
  const { t, fmt } = useI18n();

  const rows = useMemo(() => {
    if (state.status !== 'ready') return [];
    const q = query.trim().toLowerCase();
    return state.data.shipments.filter(
      (s) =>
        (status === 'all' || s.status === status) &&
        (risk === 'all' || (risk === 'at') === s.riskIds.length > 0) &&
        (!q || [s.id, s.orderId, s.supplier, s.sku, s.productName, s.warehouse].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [state, query, status, risk]);

  if (state.status === 'loading') return <Loading label={t.loadingShipments} variant="inline" />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={state.reload} />;
  if (state.data.shipments.length === 0) {
    return <EmptyState title={t.noShipmentsTitle} icon="truck">{t.noShipmentsText}</EmptyState>;
  }

  const all = state.data.shipments;
  const atRisk = all.filter((s) => s.riskIds.length > 0).length;
  const filtered = query !== '' || status !== 'all' || risk !== 'all';
  const clearFilters = () => {
    setQuery('');
    setStatus('all');
    setRisk('all');
  };

  return (
    <div className="stack">
      <div className="toolbar" role="search">
        <SearchField value={query} onChange={setQuery} placeholder={t.searchShipments} label={t.searchShipmentsLabel} />
        <select className="input" aria-label={t.filterStatus} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">{t.allStatuses}</option>
          {Object.entries(t.status).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <Segmented<RiskFilter>
          label={t.filterRisk}
          value={risk}
          onChange={setRisk}
          options={[
            { value: 'all', label: t.riskFilterAll, count: all.length },
            { value: 'at', label: t.riskFilterAt, count: atRisk },
            { value: 'none', label: t.riskFilterNone, count: all.length - atRisk },
          ]}
        />
        <span className="toolbar-count">{t.ofTotal(rows.length, all.length)}</span>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t.colShipment}</th><th>{t.colSupplier}</th><th>{t.colSku}</th><th className="num">{t.colQty}</th>
              <th>{t.colPlanned}</th><th>{t.colEta}</th><th>{t.colStatus}</th><th>{t.colWarehouse}</th><th>{t.colRisk}</th>
              <th><span className="sr-only">{t.shipment}</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const slip = s.eta && !s.actualArrival ? daysBetween(s.plannedArrival, s.eta) : 0;
              return (
                // The ID button is the accessible control; row click is a mouse convenience.
                <tr key={s.id} className={`clickable${s.topSeverity === 'critical' ? ' row-accent-critical' : ''}`} onClick={() => onOpenShipment(s.id)}>
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
                    {s.orderId && <div className="cell-sub mono">{s.orderId}</div>}
                  </td>
                  <td>
                    <div className="cell-main">{s.supplier}</div>
                    {s.carrier && <div className="cell-sub">{s.carrier}</div>}
                  </td>
                  <td>
                    <div className="mono">{s.sku}</div>
                    {s.productName && <div className="cell-sub">{s.productName}</div>}
                  </td>
                  <td className="num">{fmt.number(s.qty)}</td>
                  <td className="nowrap">{fmt.date(s.plannedArrival)}</td>
                  <td>
                    {s.actualArrival ? (
                      <span className="muted nowrap">{t.arrivedOn(fmt.date(s.actualArrival))}</span>
                    ) : (
                      <span className="eta-cell">
                        {fmt.date(s.eta)}
                        {slip > 0 && (
                          <span className="badge badge-slip" title={t.etaSlipTitle(slip)}>
                            <span aria-hidden="true">{t.etaSlip(slip)}</span>
                            <span className="sr-only">{t.etaSlipTitle(slip)}</span>
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td><StatusBadge status={s.status} /></td>
                  <td>{s.warehouse}</td>
                  <td>{s.topSeverity ? <SeverityBadge severity={s.topSeverity} /> : <span className="subtlest">—</span>}</td>
                  <td className="row-chevron"><Icon name="chevronRight" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="pad row">
            <span className="muted">{t.noShipmentsMatch}</span>
            {filtered && <button type="button" className="btn btn-sm" onClick={clearFilters}>{t.clearFilters}</button>}
          </div>
        )}
      </div>
    </div>
  );
}
