import { useState } from 'react';
import { call, errorMessage, useAsync, type RiskEvent } from '../api';
import { EmptyState, ErrorState, KpiCard, Loading, Panel, SeverityBadge, SeverityDistribution } from '../components';
import type { NavProps } from '../App';
import { useI18n } from '../i18n';
import { Icon } from '../icons';

export function Dashboard({ dataVersion, onOpenShipment, onNavigate, onDataChanged }: NavProps) {
  const state = useAsync(() => call('getDashboard'), [dataVersion]);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const { t, fmt } = useI18n();

  if (state.status === 'loading') return <Loading label={t.loadingDashboard} />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={state.reload} />;
  const { kpis, topRisks, recentImports, hasData, today } = state.data;

  if (!hasData) {
    const loadDemo = async () => {
      setLoadingDemo(true);
      setDemoError(null);
      try {
        await call('loadDemoData');
        onDataChanged();
      } catch (err) {
        setDemoError(errorMessage(err));
      } finally {
        setLoadingDemo(false);
      }
    };
    return (
      <EmptyState title={t.noDataTitle}>
        <p>{t.noDataText}</p>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={loadDemo} disabled={loadingDemo}>
            {loadingDemo ? t.loadingDemo : t.loadDemo}
          </button>
          <button type="button" className="btn" onClick={() => onNavigate('import')}>
            <Icon name="upload" /> {t.importCsv}
          </button>
        </div>
        {demoError && <p role="alert" className="text-danger">{demoError}</p>}
      </EmptyState>
    );
  }

  const openRisk = (r: RiskEvent) => (r.entityType === 'shipment' ? onOpenShipment(r.entityKey) : onNavigate('inventory'));
  const totalRisks = Object.values(kpis.risksBySeverity).reduce((a, b) => a + b, 0);
  const urgent = kpis.risksBySeverity.critical + kpis.risksBySeverity.high;

  return (
    <div className="stack">
      {urgent > 0 ? (
        <div className="attention attention-danger">
          <span className="attention-icon"><Icon name="alert" size={18} /></span>
          <div className="attention-body">
            <strong>{t.attentionTitle(urgent)}</strong>
            <span>{t.attentionText(kpis.risksBySeverity.critical, kpis.risksBySeverity.high)}</span>
          </div>
          <button type="button" className="btn" onClick={() => onNavigate('risks')}>
            {t.reviewRisks} <Icon name="arrowRight" size={14} />
          </button>
        </div>
      ) : (
        <div className="attention attention-ok">
          <span className="attention-icon"><Icon name="checkCircle" size={18} /></span>
          <div className="attention-body">
            <strong>{t.allClearTitle}</strong>
            <span>{t.allClearText}</span>
          </div>
        </div>
      )}

      <div className="kpis">
        <KpiCard
          icon="truck"
          label={t.kpiOpenShipments}
          value={fmt.number(kpis.shipmentsOpen)}
          sub={t.kpiOpenHint(fmt.number(kpis.shipmentsInTransit), fmt.number(kpis.shipmentsTotal))}
          info={t.kpiInfoOpen}
          onClick={() => onNavigate('shipments')}
          actionLabel={t.viewShipmentsLink}
        />
        <KpiCard
          icon="clock"
          label={t.kpiLate}
          value={fmt.number(kpis.shipmentsLate)}
          sub={t.kpiLateHint}
          info={t.kpiInfoLate}
          tone={kpis.shipmentsLate > 0 ? 'danger' : undefined}
        />
        <KpiCard
          icon="checkCircle"
          label={t.kpiOnTime}
          value={fmt.percent(kpis.onTimeRate)}
          sub={kpis.onTimeRate === null ? t.noDeliveriesYet : t.kpiOnTimeHint(fmt.number(kpis.shipmentsDelivered))}
          info={t.kpiInfoOnTime}
        />
        <KpiCard
          icon="box"
          label={t.kpiBelowSafety}
          value={<>{fmt.number(kpis.skusBelowSafety)}<span className="kpi-of"> / {fmt.number(kpis.skusTracked)}</span></>}
          sub={t.kpiBelowSafetyHint}
          info={t.kpiInfoBelowSafety}
          tone={kpis.skusBelowSafety > 0 ? 'warning' : undefined}
          onClick={() => onNavigate('inventory')}
          actionLabel={t.viewStockLink}
        />
        <KpiCard icon="layers" label={t.kpiValueAtRisk} value={fmt.money(kpis.valueAtRisk)} sub={t.kpiValueAtRiskHint} info={t.kpiInfoValue} />
      </div>

      <div className="grid-main">
        <Panel title={t.riskDistribution} icon="alert" actions={<span className="badge badge-neutral">{t.openRisks(totalRisks)}</span>}>
          <SeverityDistribution counts={kpis.risksBySeverity} />
          <p className="footnote">{t.ruleScoreNote(fmt.date(today))}</p>
        </Panel>

        <Panel
          title={t.topRisks}
          icon="layers"
          actions={
            <button type="button" className="btn btn-sm btn-subtle" onClick={() => onNavigate('risks')}>
              {t.viewAll} <Icon name="arrowRight" size={14} />
            </button>
          }
        >
          {topRisks.length === 0 ? (
            <p className="muted">{t.noOpenRisks}</p>
          ) : (
            <ul className="risk-list">
              {topRisks.map((r) => (
                <li key={r.id}>
                  <button type="button" className="risk-link" onClick={() => openRisk(r)}>
                    <SeverityBadge severity={r.severity} />
                    <span className="risk-link-text">
                      <span className="risk-link-title">{t.riskTitle(r)}</span>
                      <span className="risk-link-meta">{t.riskType[r.type]} · <span className="mono">{r.entityKey}</span></span>
                    </span>
                    <Icon name="chevronRight" className="risk-link-chevron" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title={t.recentImports} icon="file">
        {recentImports.length === 0 ? (
          <p className="muted">{t.noImportsRecorded}</p>
        ) : (
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr><th>{t.colFile}</th><th>{t.colType}</th><th>{t.colImported}</th><th className="num">{t.colValid}</th><th className="num">{t.colRejected}</th></tr>
              </thead>
              <tbody>
                {recentImports.map((b) => (
                  <tr key={b.id}>
                    <td className="cell-main">{b.filename}</td>
                    <td><span className="badge badge-neutral">{t.importKind[b.kind]}</span></td>
                    <td className="muted">{fmt.dateTime(b.importedAt)}</td>
                    <td className="num">{fmt.number(b.rowsValid)}</td>
                    <td className="num">{b.rowsRejected > 0 ? <span className="text-danger">{fmt.number(b.rowsRejected)}</span> : <span className="muted">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
