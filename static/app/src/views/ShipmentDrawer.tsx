import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { call, useAsync } from '../api';
import { ErrorState, Facts, Loading, SeverityBadge, StatusBadge } from '../components';
import { fmtDate, fmtNumber, RISK_TYPE_LABEL } from '../format';

export function ShipmentDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const state = useAsync(() => call('getShipment', { id }), [id]);
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);

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
          <h2 id="drawer-title">Shipment <span className="mono">{id}</span></h2>
          <button ref={closeButton} type="button" className="btn btn-subtle" onClick={onClose} aria-label="Close shipment details">✕</button>
        </header>

        {state.status === 'loading' && <Loading />}
        {state.status === 'error' && <ErrorState message={state.message} onRetry={state.reload} />}
        {state.status === 'ready' && state.data === null && (
          <p role="alert">Shipment <span className="mono">{id}</span> was not found in the current dataset.</p>
        )}
        {state.status === 'ready' && state.data && (
          <div className="stack">
            <Facts
              items={[
                ['Status', <StatusBadge key="s" status={state.data.shipment.status} />],
                ['Supplier', state.data.shipment.supplier],
                ['Order', state.data.shipment.orderId],
                ['SKU', <span key="k" className="mono">{state.data.shipment.sku}</span>],
                ['Product', state.data.shipment.productName],
                ['Quantity', fmtNumber(state.data.shipment.qty)],
                ['Warehouse', state.data.shipment.warehouse],
                ['Planned arrival', fmtDate(state.data.shipment.plannedArrival)],
                ['ETA', fmtDate(state.data.shipment.eta)],
                ['Actual arrival', fmtDate(state.data.shipment.actualArrival)],
                ['Carrier', state.data.shipment.carrier],
                ['Tracking ref', state.data.shipment.trackingRef],
              ]}
            />

            <section aria-label="Risks">
              <h3 className="h4">Risks ({state.data.risks.length})</h3>
              {state.data.risks.length === 0 ? (
                <p className="muted">No rule is triggered for this shipment.</p>
              ) : (
                <ul className="risk-list">
                  {state.data.risks.map((r) => (
                    <li key={r.id} className="risk-item">
                      <SeverityBadge severity={r.severity} /> <strong>{r.title}</strong>
                      <div className="muted small">{RISK_TYPE_LABEL[r.type]} · <span className="mono">{r.id}</span> · rule v{r.ruleVersion}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label="Destination stock">
              <h3 className="h4">Stock at destination</h3>
              {state.data.inventory ? (
                <Facts
                  items={[
                    ['Available', fmtNumber(state.data.inventory.available)],
                    ['Inbound ≤ 7 days', fmtNumber(state.data.inventory.inboundSoon)],
                    ['Projected', fmtNumber(state.data.inventory.projected)],
                    ['Safety stock', fmtNumber(state.data.inventory.safetyStock)],
                    ['Stock risk', state.data.inventory.risk ? <SeverityBadge key="r" severity={state.data.inventory.risk.severity} /> : 'None'],
                  ]}
                />
              ) : (
                <p className="muted">
                  No inventory record for <span className="mono">{state.data.shipment.sku}</span> at {state.data.shipment.warehouse}.
                </p>
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
