import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { COVER_HORIZON_DAYS } from '../../../../src/domain/cover';
import { daysBetween, todayUtc } from '../../../../src/domain/dates';
import { expectedArrival, isOpen } from '../../../../src/domain/risk-engine';
import { call, useAsync, type CoverProjection, type Shipment } from '../api';
import { CoverValue, ErrorState, Facts, Loading, SeverityBadge, StatusBadge } from '../components';
import { useI18n } from '../i18n';
import { Icon, type IconName } from '../icons';
import { IssueAction, useIssueLinks } from '../issues';

function Section({ title, icon, children }: { title: string; icon: IconName; children: ReactNode }) {
  return (
    <section className="drawer-section" aria-label={title}>
      <h3 className="section-title"><Icon name={icon} size={14} />{title}</h3>
      {children}
    </section>
  );
}

/** Planned → latest ETA → received, with each date's distance from the plan; only dates in the data. */
function Timeline({ shipment }: { shipment: Shipment }) {
  const { t, fmt } = useI18n();
  const slip = shipment.eta ? daysBetween(shipment.plannedArrival, shipment.eta) : null;
  const arrived = shipment.actualArrival ? daysBetween(shipment.plannedArrival, shipment.actualArrival) : null;
  return (
    <ol className="timeline">
      <li className="tl-step tl-done">
        <span className="tl-dot" aria-hidden="true" />
        <span className="tl-label">{t.timelinePlanned}</span>
        <span className="tl-date">{fmt.date(shipment.plannedArrival)}</span>
      </li>
      <li className={`tl-step ${slip !== null && slip > 0 ? 'tl-late' : shipment.eta ? 'tl-current' : ''}`}>
        <span className="tl-dot" aria-hidden="true" />
        <span className="tl-label">{t.timelineEta}</span>
        <span className="tl-date">{shipment.eta ? fmt.date(shipment.eta) : '—'}</span>
        <span className="tl-note">{slip === null ? t.timelineNoEta : t.vsPlan(slip)}</span>
      </li>
      <li className={`tl-step ${arrived === null ? '' : arrived > 0 ? 'tl-late' : 'tl-done'}`}>
        <span className="tl-dot" aria-hidden="true" />
        <span className="tl-label">{t.timelineActual}</span>
        <span className="tl-date">{shipment.actualArrival ? fmt.date(shipment.actualArrival) : '—'}</span>
        <span className="tl-note">{arrived === null ? t.timelineNotYet : t.vsPlan(arrived)}</span>
      </li>
    </ol>
  );
}

export function ShipmentDrawer({ id, onClose, onSimulate }: { id: string; onClose: () => void; onSimulate: (id: string) => void }) {
  const state = useAsync(() => call('getShipment', { id }), [id]);
  const issues = useIssueLinks(0);
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const { t, fmt } = useI18n();

  // Only a shipment that is still expected can be delayed in the what-if view.
  const shipment = state.status === 'ready' ? state.data?.shipment : undefined;
  const upcoming = !!shipment && isOpen(shipment) && daysBetween(todayUtc(), expectedArrival(shipment)) >= 0;

  // Days of cover rows, only when the inventory file gives a daily usage.
  const coverFacts = (cover: CoverProjection): [string, ReactNode][] =>
    cover.dailyUsage === null || cover.dailyUsage <= 0
      ? []
      : [
          [t.factDaysOfCover, <CoverValue key="c" cover={cover} />],
          [t.factBelowSafetyFrom, cover.belowSafetyDate ? fmt.date(cover.belowSafetyDate) : t.beyondHorizonLong(COVER_HORIZON_DAYS)],
        ];

  // Focus the dialog on open and return focus to the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    return () => opener?.focus();
  }, []);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !dialog.current) return;
    // The page behind is `inert`, so only wrap focus at the dialog's edges.
    const focusable = dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input, select, summary, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };

  const data = state.status === 'ready' ? state.data : null;

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={dialog} className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onKeyDown={onKeyDown}>
        <header className="drawer-head">
          <div>
            <div className="drawer-kicker">{t.shipment}</div>
            <h2 id="drawer-title" className="drawer-title">
              <span className="mono">{id}</span>
              {data && <StatusBadge status={data.shipment.status} />}
            </h2>
            {data && (
              <p className="drawer-sub">
                {fmt.number(data.shipment.qty)} × {data.shipment.productName ?? data.shipment.sku} → {data.shipment.warehouse}
              </p>
            )}
          </div>
          <button ref={closeButton} type="button" className="btn btn-subtle btn-icon" onClick={onClose} aria-label={t.closeShipment}>
            <Icon name="close" />
          </button>
        </header>

        <div className="drawer-body">
          {state.status === 'loading' && <Loading variant="inline" />}
          {state.status === 'error' && <ErrorState message={state.message} onRetry={state.reload} />}
          {state.status === 'ready' && state.data === null && <p role="alert">{t.shipmentNotFound(id)}</p>}
          {data && (
            <>
              <Section title={t.secOverview} icon="file">
                <Facts
                  items={[
                    [t.factOrder, data.shipment.orderId],
                    [t.factSku, <span key="k" className="mono">{data.shipment.sku}</span>],
                    [t.factProduct, data.shipment.productName],
                    [t.factQuantity, fmt.number(data.shipment.qty)],
                    [t.factWarehouse, data.shipment.warehouse],
                    [t.factStatus, <StatusBadge key="s" status={data.shipment.status} />],
                  ]}
                />
              </Section>

              <Section title={t.secSupplier} icon="truck">
                <Facts
                  items={[
                    [t.factSupplier, data.shipment.supplier],
                    [t.factCarrier, data.shipment.carrier],
                    [t.factTracking, data.shipment.trackingRef && <span key="tr" className="mono">{data.shipment.trackingRef}</span>],
                  ]}
                />
              </Section>

              <Section title={t.secTimeline} icon="calendar">
                <Timeline shipment={data.shipment} />
              </Section>

              <Section title={t.secImpact} icon="warehouse">
                {data.inventory ? (
                  <Facts
                    items={[
                      [t.factAvailable, fmt.number(data.inventory.available)],
                      [t.factInbound7, fmt.number(data.inventory.inboundSoon)],
                      [t.factProjected, fmt.number(data.inventory.projected)],
                      [t.factSafety, fmt.number(data.inventory.safetyStock)],
                      [t.factStockRisk, data.inventory.risk ? <SeverityBadge key="r" severity={data.inventory.risk.severity} /> : t.none],
                      [t.factDailyUsage, data.inventory.cover.dailyUsage === null ? t.notProjected : fmt.number(data.inventory.cover.dailyUsage)],
                      ...coverFacts(data.inventory.cover),
                    ]}
                  />
                ) : (
                  <p className="muted">{t.noInventoryRecord(data.shipment.sku, data.shipment.warehouse)}</p>
                )}
                {upcoming && (
                  <div className="drawer-actions">
                    <button type="button" className="btn" onClick={() => onSimulate(id)}>
                      <Icon name="sliders" /> {t.simulateDelay}
                    </button>
                  </div>
                )}
              </Section>

              <Section title={`${t.secRisks} (${data.risks.length})`} icon="alert">
                {data.risks.length === 0 ? (
                  <p className="muted">{t.noShipmentRule}</p>
                ) : (
                  <ul className="drawer-risks">
                    {data.risks.map((r) => (
                      <li key={r.id} className="drawer-risk">
                        <div className="drawer-risk-head">
                          <SeverityBadge severity={r.severity} />
                          <strong>{t.riskTitle(r)}</strong>
                        </div>
                        <div className="drawer-risk-meta">
                          {t.riskType[r.type]} · <span className="mono">{r.id}</span> · {t.ruleVersion(r.ruleVersion)}
                        </div>
                        <div className="small">{t.nextText(r)}</div>
                        {issues.data && (
                          <div className="row">
                            <IssueAction risk={r} link={issues.byRisk.get(r.id)} config={issues.data.config} onChanged={issues.state.reload} />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
