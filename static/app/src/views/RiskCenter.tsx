import { useMemo, useState } from 'react';
import { call, useAsync, type RiskEvent, type Severity } from '../api';
import { EmptyState, ErrorState, Loading, SeverityBadge } from '../components';
import { RISK_TYPE_LABEL, SEVERITY_LABEL } from '../format';
import type { NavProps } from '../App';

export function RiskCenter({ dataVersion, onOpenShipment, onNavigate }: NavProps) {
  const state = useAsync(() => call('listRisks'), [dataVersion]);
  const [severity, setSeverity] = useState<'all' | Severity>('all');
  const [type, setType] = useState<'all' | RiskEvent['type']>('all');

  const risks = useMemo(
    () =>
      state.status === 'ready'
        ? state.data.risks.filter((r) => (severity === 'all' || r.severity === severity) && (type === 'all' || r.type === type))
        : [],
    [state, severity, type],
  );

  if (state.status === 'loading') return <Loading label="Evaluating risk rules…" />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={state.reload} />;
  if (state.data.risks.length === 0) {
    return <EmptyState title="No open risks">All shipments and stock levels pass the current rules.</EmptyState>;
  }

  return (
    <div className="stack">
      <div className="filters">
        <select className="input" aria-label="Filter by severity" value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}>
          <option value="all">All severities</option>
          {Object.entries(SEVERITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="input" aria-label="Filter by risk type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="all">All risk types</option>
          {Object.entries(RISK_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className="muted small">{risks.length} of {state.data.risks.length} · evaluated {state.data.today}</span>
      </div>

      <ul className="cards">
        {risks.map((r) => (
          <li key={r.id} className={`card card-sev-${r.severity}`}>
            <div className="card-head">
              <SeverityBadge severity={r.severity} />
              <span className="muted small">{RISK_TYPE_LABEL[r.type]}</span>
              <span className="muted small mono card-id">{r.id}</span>
            </div>
            <h3 className="card-title">{r.title}</h3>
            <dl className="evidence">
              {r.evidence
                .filter((e) => e.value !== null && e.value !== '')
                .map((e) => (
                  <div key={e.label}>
                    <dt>{e.label}</dt>
                    <dd>{e.value}</dd>
                  </div>
                ))}
            </dl>
            <div className="row">
              {r.entityType === 'shipment' ? (
                <button type="button" className="btn" onClick={() => onOpenShipment(r.entityKey)}>View shipment {r.entityKey}</button>
              ) : (
                <button type="button" className="btn" onClick={() => onNavigate('inventory')}>View inventory</button>
              )}
              <span className="muted small">Rule v{r.ruleVersion}</span>
            </div>
          </li>
        ))}
      </ul>
      {risks.length === 0 && <p className="muted">No risks match these filters.</p>}
    </div>
  );
}
