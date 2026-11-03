import { useMemo, useState } from 'react';
import { call, useAsync, type RiskEvent, type Severity, type Shipment } from '../api';
import { EmptyState, ErrorState, Loading, SeverityBadge } from '../components';
import type { NavProps } from '../App';
import { useI18n } from '../i18n';
import { IssueAction, useIssueLinks } from '../issues';

export function RiskCenter({ dataVersion, onOpenShipment, onNavigate }: NavProps) {
  const state = useAsync(() => call('listRisks'), [dataVersion]);
  const issues = useIssueLinks(dataVersion);
  const [severity, setSeverity] = useState<'all' | Severity>('all');
  const [type, setType] = useState<'all' | RiskEvent['type']>('all');
  const { t, fmt } = useI18n();

  const risks = useMemo(
    () =>
      state.status === 'ready'
        ? state.data.risks.filter((r) => (severity === 'all' || r.severity === severity) && (type === 'all' || r.type === type))
        : [],
    [state, severity, type],
  );

  if (state.status === 'loading') return <Loading label={t.evaluatingRules} />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={state.reload} />;
  if (state.data.risks.length === 0) {
    return <EmptyState title={t.noRisksTitle}>{t.noRisksText}</EmptyState>;
  }

  // Shipment statuses in evidence are codes; everything else is shown as stored.
  const evidenceValue = (label: string, value: string | number) =>
    label === 'Status' && typeof value === 'string' && value in t.status ? t.status[value as Shipment['status']] : value;

  return (
    <div className="stack">
      <div className="filters">
        <select className="input" aria-label={t.filterSeverity} value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}>
          <option value="all">{t.allSeverities}</option>
          {Object.entries(t.severity).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="input" aria-label={t.filterRiskType} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="all">{t.allRiskTypes}</option>
          {Object.entries(t.riskType).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className="muted small">{t.ofTotal(risks.length, state.data.risks.length)} · {t.evaluatedOn(fmt.date(state.data.today))}</span>
      </div>

      <ul className="cards">
        {risks.map((r) => (
          <li key={r.id} className={`card card-sev-${r.severity}`}>
            <div className="card-head">
              <SeverityBadge severity={r.severity} />
              <span className="muted small">{t.riskType[r.type]}</span>
              <span className="muted small mono card-id">{r.id}</span>
            </div>
            <h3 className="card-title">{t.riskTitle(r)}</h3>
            <dl className="evidence">
              {r.evidence
                .filter((e): e is typeof e & { value: string | number } => e.value !== null && e.value !== '')
                .map((e) => (
                  <div key={e.label}>
                    <dt>{t.evidence[e.label] ?? e.label}</dt>
                    <dd>{evidenceValue(e.label, e.value)}</dd>
                  </div>
                ))}
            </dl>
            <div className="row">
              {r.entityType === 'shipment' ? (
                <button type="button" className="btn" onClick={() => onOpenShipment(r.entityKey)}>{t.viewShipment(r.entityKey)}</button>
              ) : (
                <button type="button" className="btn" onClick={() => onNavigate('inventory')}>{t.viewInventory}</button>
              )}
              <span className="muted small">{t.ruleVersion(r.ruleVersion)}</span>
            </div>
            <div className="row card-issue">
              {issues.data ? (
                <IssueAction risk={r} link={issues.byRisk.get(r.id)} config={issues.data.config} onChanged={issues.state.reload} />
              ) : issues.state.status === 'error' ? (
                <span className="text-danger small">{t.jiraLinksUnavailable(issues.state.message)}</span>
              ) : (
                <span className="muted small">{t.loadingJiraLink}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {risks.length === 0 && <p className="muted">{t.noRisksMatch}</p>}
      {issues.data?.statusError && <p className="muted small">{t.jiraStatusNotRefreshed(issues.data.statusError)}</p>}
    </div>
  );
}
