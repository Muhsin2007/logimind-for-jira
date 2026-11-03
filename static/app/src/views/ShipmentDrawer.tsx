import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { COVER_HORIZON_DAYS } from '../../../../src/domain/cover';
import { daysBetween, todayUtc } from '../../../../src/domain/dates';
import { expectedArrival, isOpen } from '../../../../src/domain/risk-engine';
import { call, useAsync, type CoverProjection } from '../api';
import { CoverValue, ErrorState, Facts, Loading, SeverityBadge, StatusBadge } from '../components';
import { useI18n } from '../i18n';
import { IssueAction, useIssueLinks } from '../issues';

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
    const focusable = dialog.current.querySelectorAll<HTMLElement>('button, [href], input, select, [tabindex]:not([tabindex="-1"])');
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

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={dialog} className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onKeyDown={onKeyDown}>
        <header className="drawer-head">
          <h2 id="drawer-title">{t.shipment} <span className="mono">{id}</span></h2>
          <button ref={closeButton} type="button" className="btn btn-subtle" onClick={onClose} aria-label={t.closeShipment}>✕</button>
        </header>

        {state.status === 'loading' && <Loading />}
        {state.status === 'error' && <ErrorState message={state.message} onRetry={state.reload} />}
        {state.status === 'ready' && state.data === null && (
          <p role="alert">{t.shipmentNotFound(id)}</p>
        )}
        {state.status === 'ready' && state.data && (
          <div className="stack">
            <Facts
              items={[
                [t.factStatus, <StatusBadge key="s" status={state.data.shipment.status} />],
                [t.factSupplier, state.data.shipment.supplier],
                [t.factOrder, state.data.shipment.orderId],
                [t.factSku, <span key="k" className="mono">{state.data.shipment.sku}</span>],
                [t.factProduct, state.data.shipment.productName],
                [t.factQuantity, fmt.number(state.data.shipment.qty)],
                [t.factWarehouse, state.data.shipment.warehouse],
                [t.factPlanned, fmt.date(state.data.shipment.plannedArrival)],
                [t.factEta, fmt.date(state.data.shipment.eta)],
                [t.factActual, fmt.date(state.data.shipment.actualArrival)],
                [t.factCarrier, state.data.shipment.carrier],
                [t.factTracking, state.data.shipment.trackingRef],
              ]}
            />

            <section aria-label={t.risksLabel}>
              <h3 className="h4">{t.risksCount(state.data.risks.length)}</h3>
              {state.data.risks.length === 0 ? (
                <p className="muted">{t.noShipmentRule}</p>
              ) : (
                <ul className="risk-list">
                  {state.data.risks.map((r) => (
                    <li key={r.id} className="risk-item">
                      <SeverityBadge severity={r.severity} /> <strong>{t.riskTitle(r)}</strong>
                      <div className="muted small">{t.riskType[r.type]} · <span className="mono">{r.id}</span> · {t.ruleVersion(r.ruleVersion)}</div>
                      {issues.data && (
                        <div className="row">
                          <IssueAction risk={r} link={issues.byRisk.get(r.id)} config={issues.data.config} onChanged={issues.state.reload} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label={t.stockAtDestination}>
              <h3 className="h4">{t.stockAtDestination}</h3>
              {state.data.inventory ? (
                <Facts
                  items={[
                    [t.factAvailable, fmt.number(state.data.inventory.available)],
                    [t.factInbound7, fmt.number(state.data.inventory.inboundSoon)],
                    [t.factProjected, fmt.number(state.data.inventory.projected)],
                    [t.factSafety, fmt.number(state.data.inventory.safetyStock)],
                    [t.factStockRisk, state.data.inventory.risk ? <SeverityBadge key="r" severity={state.data.inventory.risk.severity} /> : t.none],
                    [t.factDailyUsage, state.data.inventory.cover.dailyUsage === null ? t.notProjected : fmt.number(state.data.inventory.cover.dailyUsage)],
                    ...coverFacts(state.data.inventory.cover),
                  ]}
                />
              ) : (
                <p className="muted">{t.noInventoryRecord(state.data.shipment.sku, state.data.shipment.warehouse)}</p>
              )}
              {upcoming && (
                <div className="row">
                  <button type="button" className="btn" onClick={() => onSimulate(id)}>{t.simulateDelay}</button>
                </div>
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
