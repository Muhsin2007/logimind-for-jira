import { useMemo, useState } from 'react';
import { call, useAsync, type InventoryRow } from '../api';
import { CoverValue, EmptyState, ErrorState, Loading, Meter, SearchField, Segmented, SeverityBadge } from '../components';
import type { NavProps } from '../App';
import { useI18n } from '../i18n';
import { StockOutlookPanel } from './Outlook';

type StockFilter = 'all' | 'below';

// JSON keeps the pair unambiguous even when a SKU or warehouse contains "@".
const keyOf = (i: InventoryRow) => JSON.stringify([i.sku, i.warehouse]);
const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;

/** The position to chart first: the most severe risk, then the earliest stock-out. */
function firstToChart(items: InventoryRow[]): InventoryRow | undefined {
  return [...items].sort(
    (a, b) =>
      (a.risk ? SEV_RANK[a.risk.severity] : 9) - (b.risk ? SEV_RANK[b.risk.severity] : 9) ||
      (a.cover.stockOutDate ?? '9999').localeCompare(b.cover.stockOutDate ?? '9999'),
  )[0];
}

export function Inventory({ dataVersion }: NavProps) {
  const state = useAsync(() => call('listInventory'), [dataVersion]);
  // Only the chart needs shipments: the table never waits for them or fails because of them.
  const pipeline = useAsync(() => call('listShipments'), [dataVersion]);
  const [chartKey, setChartKey] = useState<string | null>(null);
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
  const charted = items.find((i) => keyOf(i) === chartKey) ?? firstToChart(items);

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

      {charted && pipeline.status === 'ready' && <StockOutlookPanel item={charted} shipments={pipeline.data.shipments} today={state.data.today} />}

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
        <span className="toolbar-count" role="status">{t.ofTotal(rows.length, items.length)}</span>
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
              const selected = charted !== undefined && keyOf(charted) === keyOf(i);
              return (
                <tr key={keyOf(i)} className={[accent, selected ? 'row-selected' : ''].filter(Boolean).join(' ') || undefined}>
                  <td>
                    <button type="button" className="link-btn mono cell-main" aria-pressed={selected} aria-label={t.design.chartButton(i.sku, i.warehouse)} onClick={() => setChartKey(keyOf(i))}>
                      {i.sku}
                    </button>
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
