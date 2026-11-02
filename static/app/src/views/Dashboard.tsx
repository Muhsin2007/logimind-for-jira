import { useState } from 'react';
import { call, errorMessage, useAsync, type RiskEvent } from '../api';
import { BarList, EmptyState, ErrorState, Loading, Panel, SeverityBadge, StatTile } from '../components';
import { fmtDateTime, fmtMoney, fmtNumber, fmtPercent, RISK_TYPE_LABEL, SEVERITY_LABEL } from '../format';
import type { NavProps } from '../App';

export function Dashboard({ dataVersion, onOpenShipment, onNavigate, onDataChanged }: NavProps) {
  const state = useAsync(() => call('getDashboard'), [dataVersion]);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  if (state.status === 'loading') return <Loading label="Loading dashboard…" />;
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
      <EmptyState title="No logistics data yet">
        <p>Import shipment and inventory CSV files, or load the synthetic demo dataset to explore LogiMind.</p>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={loadDemo} disabled={loadingDemo}>
            {loadingDemo ? 'Loading demo data…' : 'Load demo data'}
          </button>
          <button type="button" className="btn" onClick={() => onNavigate('import')}>
            Import CSV
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
        <StatTile label="Open shipments" value={fmtNumber(kpis.shipmentsOpen)} hint={`${fmtNumber(kpis.shipmentsInTransit)} in transit · ${fmtNumber(kpis.shipmentsTotal)} total`} />
        <StatTile label="Late shipments" value={fmtNumber(kpis.shipmentsLate)} hint="Past planned arrival, not delivered" tone={kpis.shipmentsLate > 0 ? 'danger' : undefined} />
        <StatTile label="On-time delivery" value={fmtPercent(kpis.onTimeRate)} hint={`${fmtNumber(kpis.shipmentsDelivered)} delivered shipments`} />
        <StatTile label="SKUs below safety stock" value={`${fmtNumber(kpis.skusBelowSafety)} / ${fmtNumber(kpis.skusTracked)}`} hint="After inbound due within 7 days" tone={kpis.skusBelowSafety > 0 ? 'warning' : undefined} />
        <StatTile label="Stock value at risk" value={fmtMoney(kpis.valueAtRisk)} hint="Shortfall × unit cost (file currency)" />
      </div>

      <div className="grid-2">
        <Panel title={`Open risks (${totalRisks})`} actions={<button type="button" className="btn btn-subtle" onClick={() => onNavigate('risks')}>Risk Center →</button>}>
          <BarList
            ariaLabel="Open risks by severity"
            data={(['critical', 'high', 'medium', 'low'] as const).map((s) => ({
              key: s,
              label: SEVERITY_LABEL[s],
              value: kpis.risksBySeverity[s],
              className: `bar-sev-${s}`,
            }))}
          />
          <p className="muted small">Rule-based risk score (deterministic rules, evaluated {today}). Not a statistical prediction.</p>
        </Panel>

        <Panel title="Top risks">
          {topRisks.length === 0 ? (
            <p className="muted">No open risks.</p>
          ) : (
            <ul className="risk-list">
              {topRisks.map((r) => (
                <li key={r.id}>
                  <button type="button" className="risk-link" onClick={() => openRisk(r)}>
                    <SeverityBadge severity={r.severity} />
                    <span className="risk-title">{r.title}</span>
                    <span className="muted small">{RISK_TYPE_LABEL[r.type]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Recent imports">
        {recentImports.length === 0 ? (
          <p className="muted">No imports recorded.</p>
        ) : (
          <table className="table compact">
            <thead>
              <tr><th>File</th><th>Type</th><th>Imported</th><th className="num">Valid</th><th className="num">Rejected</th></tr>
            </thead>
            <tbody>
              {recentImports.map((b) => (
                <tr key={b.id}>
                  <td>{b.filename}</td>
                  <td>{b.kind}</td>
                  <td>{fmtDateTime(b.importedAt)}</td>
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
