import { call, useAsync } from '../api';
import { ErrorState, Facts, Loading, SeverityBadge, StatusBadge } from '../components';
import { fmtDate, fmtDateTime, fmtNumber, RISK_TYPE_LABEL } from '../format';

/** Sidebar on a Jira issue: the LogiMind risk and shipment this issue was created from. */
export function IssueContext() {
  const state = useAsync(() => call('getIssueContext'), []);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={state.reload} />;
  const { link, currentRisk, shipment } = state.data;
  if (!link) return <p className="muted">This issue was not created from a LogiMind risk.</p>;

  return (
    <div className="stack compact-stack">
      <div>
        <SeverityBadge severity={link.severity} /> <span className="muted small">{RISK_TYPE_LABEL[link.riskType]}</span>
        <p><strong>{link.riskTitle}</strong></p>
        <p className="small">
          {currentRisk ? (
            <span>Still active in the current data (evaluated {currentRisk.evaluatedOn}).</span>
          ) : (
            <span className="text-success">No longer active: the condition is resolved in the current data.</span>
          )}
        </p>
        <p className="muted small mono">{link.riskId} · created {fmtDateTime(link.createdAt)}</p>
      </div>
      {shipment && (
        <Facts
          items={[
            ['Shipment', <span key="i" className="mono">{shipment.shipment.id}</span>],
            ['Status', <StatusBadge key="s" status={shipment.shipment.status} />],
            ['Supplier', shipment.shipment.supplier],
            ['SKU', <span key="k" className="mono">{shipment.shipment.sku}</span>],
            ['Qty', fmtNumber(shipment.shipment.qty)],
            ['Planned', fmtDate(shipment.shipment.plannedArrival)],
            ['ETA', fmtDate(shipment.shipment.eta)],
            ['Warehouse', shipment.shipment.warehouse],
          ]}
        />
      )}
      {link.entityType === 'shipment' && !shipment && (
        <p className="muted small">Shipment {link.entityKey} is not in the current dataset.</p>
      )}
    </div>
  );
}
