import { useMemo, useState } from 'react';
import { call, useAsync } from '../api';
import { CoverValue, EmptyState, ErrorState, Loading, Meter, SearchField, Segmented, SeverityBadge } from '../components';
import type { NavProps } from '../App';
import { useI18n } from '../i18n';

type StockFilter = 'all' | 'below';

export function Inventory({ dataVersion }: NavProps) {
  const state = useAsync(() => call('listInventory'), [dataVersion]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');
  const { t, fmt } = useI18n();

  const rows = useMemo(() => {
    if (state.status !== 'ready') return [];
    const q = query.trim().toLowerCase();
    return state.data.items.filter(
      (i) =>
        (filter === 'all' || i.shortfall > 0) &&
        (!q || [i.sku, i.productName, i.warehouse].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [state, query, filter]);

  if (state.status === 'loading') return <Loading label={t.loadingInventory} variant="inline" />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={state.reload} />;
  if (state.data.items.length === 0) {
    return <EmptyState title={t.noInventoryTitle} icon="box">{t.noInventoryText}</EmptyState>;
  }

  const items = state.data.items;
  const critical = items.filter((i) => i.risk?.severity === 'critical').length;
  const below = items.filter((i) => i.shortfall > 0).length;
  const noUsage = items.filter((i) => i.cover.dailyUsage === null || i.cover.dailyUsage <= 0).length;

  return (
    <div className="stack">
      <div className="summary">
        <div className="summary-item">
          <span className="summary-value">{fmt.number(items.length)}</span>
          <span className="summary-label">{t.sumPositions}</span>
        </div>
        <div className={`summary-item${critical > 0 ? ' summary-critical' : ''}`}>
          <span className="summary-value">{fmt.number(critical)}</span>
          <span className="summary-label"><span className="summary-dot" aria-hidden="true" />{t.sumCritical}</span>
        </div>
        <div className="summary-item summary-below">
          <span className="summary-value">{fmt.number(below)}</span>
          <span className="summary-label"><span className="summary-dot" aria-hidden="true" />{t.sumBelow}</span>
        </div>
        <div className="summary-item">
          <span className="summary-value">{fmt.number(noUsage)}</span>
          <span className="summary-label">{t.sumNoUsage}</span>
        </div>
      </div>

      <div className="toolbar" role="search">
        <SearchField value={query} onChange={setQuery} placeholder={t.searchInventory} label={t.searchInventoryLabel} />
        <Segmented<StockFilter>
          label={t.stockFilter}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t.stockFilterAll, count: items.length },
            { value: 'below', label: t.belowSafetyOnly, count: below },
          ]}
        />
        <span className="toolbar-count">{t.ofTotal(rows.length, items.length)}</span>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t.colSku}</th><th>{t.colWarehouse}</th>
              <th className="num">{t.colAvailable}</th><th className="num">{t.colInbound7}</th>
              <th>{t.colProjectedVsSafety}</th><th className="num">{t.colDailyUsage}</th><th>{t.colDaysOfCover}</th>
              <th className="num">{t.colUnitCost}</th><th>{t.colRisk}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const coverage = i.safetyStock === 0 ? 1 : Math.max(0, i.projected) / i.safetyStock;
              const accent = i.risk?.severity === 'critical' ? 'row-accent-critical' : i.risk?.severity === 'high' ? 'row-accent-high' : undefined;
              return (
                <tr key={`${i.sku}@${i.warehouse}`} className={accent}>
                  <td>
                    <div className="mono cell-main">{i.sku}</div>
                    {i.productName && <div className="cell-sub">{i.productName}</div>}
                  </td>
                  <td>{i.warehouse}</td>
                  <td className="num">
                    <div className={`cell-main${i.available <= 0 ? ' text-danger' : ''}`}>{fmt.number(i.available)}</div>
                    <div className="cell-sub nowrap">{t.onHandReserved(fmt.number(i.onHand), fmt.number(i.reserved))}</div>
                  </td>
                  <td className="num">
                    <div>{fmt.number(i.inboundSoon)}</div>
                    {i.inboundShipmentIds.length > 0 && <div className="cell-sub mono">{t.inboundVia(i.inboundShipmentIds.join(', '))}</div>}
                  </td>
                  <td>
                    <span className="coverage">
                      <Meter ratio={coverage} label={t.coverageLabel} valueText={t.coverageText(Math.round(coverage * 100))} />
                      <span className="coverage-text">
                        <strong>{fmt.number(i.projected)}</strong> / {fmt.number(i.safetyStock)}
                      </span>
                    </span>
                  </td>
                  <td className="num">{i.cover.dailyUsage === null ? <span className="subtlest">—</span> : fmt.number(i.cover.dailyUsage)}</td>
                  <td><CoverValue cover={i.cover} /></td>
                  <td className="num">{i.unitCost === null ? <span className="subtlest">—</span> : fmt.money(i.unitCost)}</td>
                  <td>{i.risk ? <SeverityBadge severity={i.risk.severity} /> : <span className="subtlest">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted pad">{t.noInventoryMatch}</p>}
      </div>
      <p className="footnote">{t.inventoryNote} {t.coverNote}</p>
    </div>
  );
}
