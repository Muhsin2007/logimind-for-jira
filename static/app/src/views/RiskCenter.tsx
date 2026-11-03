import { useMemo, useState } from 'react';
import { call, useAsync, type RiskEvent, type Severity, type Shipment } from '../api';
import { EmptyState, ErrorState, Loading, Segmented, SEVERITY_ORDER, SeverityBadge } from '../components';
import type { NavProps } from '../App';
import { useI18n } from '../i18n';
import { Icon } from '../icons';
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

  if (state.status === 'loading') return <Loading label={t.evaluatingRules} variant="inline" />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={state.reload} />;
  if (state.data.risks.length === 0) {
    return <EmptyState title={t.noRisksTitle} icon="checkCircle">{t.noRisksText}</EmptyState>;
  }

  // Shipment statuses in evidence are codes; everything else is shown as stored.
  const evidenceValue = (label: string, value: string | number) =>
    label === 'Status' && typeof value === 'string' && value in t.status ? t.status[value as Shipment['status']] : value;
  const all = state.data.risks;

  return (
    <div className="stack">
      <div className="toolbar">
        <Segmented<'all' | Severity>
          label={t.filterSeverity}
          value={severity}
          onChange={setSeverity}
          options={[
            { value: 'all', label: t.allSeverities, count: all.length },
            ...SEVERITY_ORDER.map((s) => ({ value: s, label: t.severity[s], count: all.filter((r) => r.severity === s).length })),
          ]}
        />
        <select className="input" aria-label={t.filterRiskType} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="all">{t.allRiskTypes}</option>
          {Object.entries(t.riskType).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className="toolbar-count">{t.ofTotal(risks.length, all.length)} · {t.evaluatedOn(fmt.date(state.data.today))}</span>
      </div>

      <ul className="risk-cards">
        {risks.map((r) => (
          <li key={r.id} className={`risk-card risk-card-${r.severity}`}>
            <div className="risk-card-head">
              <SeverityBadge severity={r.severity} />
              <span className="risk-card-type">{t.riskType[r.type]}</span>
              <span className="risk-card-id mono">{r.id}</span>
            </div>
            <h3 className="risk-card-title">{t.riskTitle(r)}</h3>

            <dl className="risk-answers">
              <div>
                <dt><Icon name="info" size={13} />{t.riskWhy}</dt>
                <dd>{t.whyText(r, fmt)}</dd>
              </div>
              <div>
                <dt><Icon name="layers" size={13} />{t.riskImpact}</dt>
                <dd>{t.impactText(r, fmt)}</dd>
              </div>
              <div className="answer-next">
                <dt><Icon name="arrowRight" size={13} />{t.riskNextStep}</dt>
                <dd>{t.nextText(r)}</dd>
              </div>
            </dl>

            <div className="risk-card-foot">
              <div className="row">
                {r.entityType === 'shipment' ? (
                  <button type="button" className="btn btn-sm" onClick={() => onOpenShipment(r.entityKey)}>
                    <Icon name="truck" size={14} /> {t.viewShipment(r.entityKey)}
                  </button>
                ) : (
                  <button type="button" className="btn btn-sm" onClick={() => onNavigate('inventory')}>
                    <Icon name="box" size={14} /> {t.viewInventory}
                  </button>
                )}
                {issues.data ? (
                  <IssueAction risk={r} link={issues.byRisk.get(r.id)} config={issues.data.config} onChanged={issues.state.reload} />
                ) : issues.state.status === 'error' ? (
                  <span className="text-danger small">{t.jiraLinksUnavailable(issues.state.message)}</span>
                ) : (
                  <span className="muted small">{t.loadingJiraLink}</span>
                )}
              </div>
              <details className="disclosure">
                <summary><Icon name="chevronDown" size={14} />{t.riskEvidence} · {t.ruleVersion(r.ruleVersion)}</summary>
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
              </details>
            </div>
          </li>
        ))}
      </ul>
      {risks.length === 0 && <p className="muted">{t.noRisksMatch}</p>}
      {issues.data?.statusError && <p className="footnote">{t.jiraStatusNotRefreshed(issues.data.statusError)}</p>}
    </div>
  );
}
