import { call, useAsync } from '../api';
import { ErrorState, Facts, Loading, SeverityBadge, StatusBadge } from '../components';
import { useI18n } from '../i18n';
import { Icon, LogoMark } from '../icons';

/** Sidebar on a Jira issue: the LogiMind risk and shipment this issue was created from. */
export function IssueContext() {
  const state = useAsync(() => call('getIssueContext'), []);
  const { t, fmt } = useI18n();

  // Every state sits in .sidebar so the panel keeps Jira's own background.
  if (state.status === 'loading') return <div className="sidebar"><Loading variant="inline" /></div>;
  if (state.status === 'error') return <div className="sidebar"><ErrorState message={state.message} onRetry={state.reload} /></div>;
  const { link, currentRisk, shipment } = state.data;
  if (!link) return <div className="sidebar"><p className="muted small">{t.notFromLogiMind}</p></div>;

  return (
    <div className="sidebar">
      <div className="sidebar-card">
        <div className="row">
          <LogoMark size={18} />
          <span className="field-label">{t.sidebarRisk}</span>
        </div>
        <div className="row">
          <SeverityBadge severity={link.severity} />
          <span className="muted small">{t.riskType[link.riskType]}</span>
        </div>
        {/* The stored title is English; a still-active risk is shown in the UI language. */}
        <p className="sidebar-title">{currentRisk ? t.riskTitle(currentRisk) : link.riskTitle}</p>
        {currentRisk ? (
          <p className="small sidebar-state">
            <Icon name="alert" size={14} />
            <span>{t.stillActive(fmt.date(currentRisk.evaluatedOn))}</span>
          </p>
        ) : (
          <p className="small sidebar-state text-success">
            <Icon name="checkCircle" size={14} />
            <span>{t.noLongerActive}</span>
          </p>
        )}
        {currentRisk && <p className="small">{t.nextText(currentRisk)}</p>}
        <p className="footnote mono">{link.riskId} · {t.createdAt(fmt.dateTime(link.createdAt))}</p>
      </div>
      {shipment && (
        <div className="sidebar-card">
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
        </div>
      )}
      {link.entityType === 'shipment' && !shipment && <p className="muted small">{t.shipmentNotInData(link.entityKey)}</p>}
    </div>
  );
}
