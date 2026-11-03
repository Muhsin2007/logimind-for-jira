import { call, useAsync } from '../api';
import { ErrorState, Facts, Loading, SeverityBadge, StatusBadge } from '../components';
import { useI18n } from '../i18n';

/** Sidebar on a Jira issue: the LogiMind risk and shipment this issue was created from. */
export function IssueContext() {
  const state = useAsync(() => call('getIssueContext'), []);
  const { t, fmt } = useI18n();

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={state.reload} />;
  const { link, currentRisk, shipment } = state.data;
  if (!link) return <p className="muted">{t.notFromLogiMind}</p>;

  return (
    <div className="stack compact-stack">
      <div>
        <SeverityBadge severity={link.severity} /> <span className="muted small">{t.riskType[link.riskType]}</span>
        {/* The stored title is English; a still-active risk is shown in the UI language. */}
        <p><strong>{currentRisk ? t.riskTitle(currentRisk) : link.riskTitle}</strong></p>
        <p className="small">
          {currentRisk ? (
            <span>{t.stillActive(fmt.date(currentRisk.evaluatedOn))}</span>
          ) : (
            <span className="text-success">{t.noLongerActive}</span>
          )}
        </p>
        <p className="muted small mono">{link.riskId} · {t.createdAt(fmt.dateTime(link.createdAt))}</p>
      </div>
      {shipment && (
        <Facts
          items={[
            [t.factShipment, <span key="i" className="mono">{shipment.shipment.id}</span>],
            [t.factStatus, <StatusBadge key="s" status={shipment.shipment.status} />],
            [t.factSupplier, shipment.shipment.supplier],
            [t.factSku, <span key="k" className="mono">{shipment.shipment.sku}</span>],
            [t.factQty, fmt.number(shipment.shipment.qty)],
            [t.factPlannedShort, fmt.date(shipment.shipment.plannedArrival)],
            [t.factEta, fmt.date(shipment.shipment.eta)],
            [t.factWarehouse, shipment.shipment.warehouse],
          ]}
        />
      )}
      {link.entityType === 'shipment' && !shipment && (
        <p className="muted small">{t.shipmentNotInData(link.entityKey)}</p>
      )}
    </div>
  );
}
