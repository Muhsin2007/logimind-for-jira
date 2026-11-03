import { useMemo, useState } from 'react';
import { call, useAsync } from '../api';
import { CoverValue, EmptyState, ErrorState, Loading, SeverityBadge } from '../components';
import type { NavProps } from '../App';
import { useI18n } from '../i18n';

export function Inventory({ dataVersion }: NavProps) {
  const state = useAsync(() => call('listInventory'), [dataVersion]);
  const [query, setQuery] = useState('');
  const [belowOnly, setBelowOnly] = useState(false);
  const { t, fmt } = useI18n();

  const rows = useMemo(() => {
    if (state.status !== 'ready') return [];
    const q = query.trim().toLowerCase();
    return state.data.items.filter(
      (i) =>
        (!belowOnly || i.shortfall > 0) &&
        (!q || [i.sku, i.productName, i.warehouse].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [state, query, belowOnly]);

  if (state.status === 'loading') return <Loading label={t.loadingInventory} />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={state.reload} />;
  if (state.data.items.length === 0) {
    return <EmptyState title={t.noInventoryTitle}>{t.noInventoryText}</EmptyState>;
  }

  return (
    <div className="stack">
      <div className="filters" role="search">
        <input
          type="search"
          className="input"
          placeholder={t.searchInventory}
          aria-label={t.searchInventoryLabel}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="checkbox">
          <input type="checkbox" checked={belowOnly} onChange={(e) => setBelowOnly(e.target.checked)} /> {t.belowSafetyOnly}
        </label>
        <span className="muted small">{t.ofTotal(rows.length, state.data.items.length)}</span>
      </div>
      <p className="muted small">{t.inventoryNote} {t.coverNote}</p>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t.colSku}</th><th>{t.colProduct}</th><th>{t.colWarehouse}</th>
              <th className="num">{t.colOnHand}</th><th className="num">{t.colReserved}</th><th className="num">{t.colAvailable}</th>
              <th className="num">{t.colInbound7}</th><th className="num">{t.colProjected}</th><th className="num">{t.colSafety}</th>
              <th>{t.colCoverage}</th><th className="num">{t.colDailyUsage}</th><th>{t.colDaysOfCover}</th><th className="num">{t.colUnitCost}</th><th>{t.colRisk}</th>
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
                  <td className="num">{fmt.number(i.onHand)}</td>
                  <td className="num">{fmt.number(i.reserved)}</td>
                  <td className="num">{fmt.number(i.available)}</td>
                  <td className="num" title={i.inboundShipmentIds.join(', ') || undefined}>{fmt.number(i.inboundSoon)}</td>
                  <td className="num"><strong>{fmt.number(i.projected)}</strong></td>
                  <td className="num">{fmt.number(i.safetyStock)}</td>
                  <td className="nowrap">
                    <span
                      className="meter"
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(Math.min(coverage, 1) * 100)}
                      aria-valuetext={t.coverageText(Math.round(coverage * 100))}
                      aria-label={t.coverageLabel}
                    >
                      <span className={`meter-fill${coverage < 1 ? ' meter-low' : ''}`} style={{ width: `${Math.min(coverage, 1) * 100}%` }} />
                    </span>{' '}
                    <span className="small" aria-hidden="true">{Math.round(coverage * 100)}%</span>
                  </td>
                  <td className="num">{i.cover.dailyUsage === null ? '—' : fmt.number(i.cover.dailyUsage)}</td>
                  <td><CoverValue cover={i.cover} /></td>
                  <td className="num">{i.unitCost === null ? '—' : fmt.money(i.unitCost)}</td>
                  <td>{i.risk ? <SeverityBadge severity={i.risk.severity} /> : <span className="muted">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted pad">{t.noInventoryMatch}</p>}
      </div>
    </div>
  );
}
