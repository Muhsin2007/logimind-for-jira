import { useState } from 'react';
import { call, errorMessage, useAsync, type RiskEvent } from '../api';
import { BarList, EmptyState, ErrorState, Loading, Panel, SeverityBadge, StatTile } from '../components';
import type { NavProps } from '../App';
import { useI18n } from '../i18n';

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
            {t.importCsv}
          </button>
        </div>
        {demoError && <p role="alert" className="text-danger">{demoError}</p>}
      </EmptyState>
    );
  }

  const openRisk = (r: RiskEvent) => (r.entityType === 'shipment' ? onOpenShipment(r.entityKey) : onNavigate('inventory'));
  const totalRisks = Object.values(kpis.risksBySeverity).reduce((a, b) => a + b, 0);

  return (
    <div className="stack">
      <div className="tiles">
        <StatTile label={t.kpiOpenShipments} value={fmt.number(kpis.shipmentsOpen)} hint={t.kpiOpenHint(fmt.number(kpis.shipmentsInTransit), fmt.number(kpis.shipmentsTotal))} />
        <StatTile label={t.kpiLate} value={fmt.number(kpis.shipmentsLate)} hint={t.kpiLateHint} tone={kpis.shipmentsLate > 0 ? 'danger' : undefined} />
        <StatTile label={t.kpiOnTime} value={fmt.percent(kpis.onTimeRate)} hint={t.kpiOnTimeHint(fmt.number(kpis.shipmentsDelivered))} />
        <StatTile label={t.kpiBelowSafety} value={`${fmt.number(kpis.skusBelowSafety)} / ${fmt.number(kpis.skusTracked)}`} hint={t.kpiBelowSafetyHint} tone={kpis.skusBelowSafety > 0 ? 'warning' : undefined} />
        <StatTile label={t.kpiValueAtRisk} value={fmt.money(kpis.valueAtRisk)} hint={t.kpiValueAtRiskHint} />
      </div>

      <div className="grid-2">
        <Panel title={t.openRisks(totalRisks)} actions={<button type="button" className="btn btn-subtle" onClick={() => onNavigate('risks')}>{t.toRiskCenter}</button>}>
          <BarList
            ariaLabel={t.openRisksBySeverity}
            data={(['critical', 'high', 'medium', 'low'] as const).map((s) => ({
              key: s,
              label: t.severity[s],
              value: kpis.risksBySeverity[s],
              className: `bar-sev-${s}`,
            }))}
          />
          <p className="muted small">{t.ruleScoreNote(fmt.date(today))}</p>
        </Panel>

        <Panel title={t.topRisks}>
          {topRisks.length === 0 ? (
            <p className="muted">{t.noOpenRisks}</p>
          ) : (
            <ul className="risk-list">
              {topRisks.map((r) => (
                <li key={r.id}>
                  <button type="button" className="risk-link" onClick={() => openRisk(r)}>
                    <SeverityBadge severity={r.severity} />
                    <span className="risk-title">{t.riskTitle(r)}</span>
                    <span className="muted small">{t.riskType[r.type]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title={t.recentImports}>
        {recentImports.length === 0 ? (
          <p className="muted">{t.noImportsRecorded}</p>
        ) : (
          <table className="table compact">
            <thead>
              <tr><th>{t.colFile}</th><th>{t.colType}</th><th>{t.colImported}</th><th className="num">{t.colValid}</th><th className="num">{t.colRejected}</th></tr>
            </thead>
            <tbody>
              {recentImports.map((b) => (
                <tr key={b.id}>
                  <td>{b.filename}</td>
                  <td>{t.importKind[b.kind]}</td>
                  <td>{fmt.dateTime(b.importedAt)}</td>
                  <td className="num">{b.rowsValid}</td>
                  <td className="num">{b.rowsRejected > 0 ? <span className="text-danger">{b.rowsRejected}</span> : 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
