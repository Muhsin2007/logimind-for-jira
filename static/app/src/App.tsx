import { useCallback, useState, type KeyboardEvent } from 'react';
import { Dashboard } from './views/Dashboard';
import { ImportSettings } from './views/ImportSettings';
import { Inventory } from './views/Inventory';
import { RiskCenter } from './views/RiskCenter';
import { ShipmentDrawer } from './views/ShipmentDrawer';
import { Shipments } from './views/Shipments';

export type Tab = 'dashboard' | 'shipments' | 'inventory' | 'risks' | 'import';

export interface NavProps {
  /** Increments after any data change so views refetch. */
  dataVersion: number;
  onOpenShipment: (id: string) => void;
  onNavigate: (tab: Tab) => void;
  onDataChanged: () => void;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'shipments', label: 'Shipments' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'risks', label: 'Risk Center' },
  { id: 'import', label: 'Import & Settings' },
];

const VIEWS: Record<Tab, (props: NavProps) => JSX.Element> = {
  dashboard: Dashboard,
  shipments: Shipments,
  inventory: Inventory,
  risks: RiskCenter,
  import: ImportSettings,
};

export function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [shipmentId, setShipmentId] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  const nav: NavProps = {
    dataVersion,
    onOpenShipment: setShipmentId,
    onNavigate: setTab,
    onDataChanged: useCallback(() => setDataVersion((v) => v + 1), []),
  };
  const closeDrawer = useCallback(() => setShipmentId(null), []);

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = TABS[(index + delta + TABS.length) % TABS.length].id;
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  const View = VIEWS[tab];

  return (
    <div className="app">
      {/* Jira already renders the page title, so the app only adds a subtitle. */}
      <p className="muted app-head">Logistics risk, shipments and stock — inside Jira.</p>

      <nav className="tabs" role="tablist" aria-label="LogiMind sections">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="tabpanel"
            tabIndex={tab === t.id ? 0 : -1}
            className={`tab${tab === t.id ? ' tab-active' : ''}`}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main id="tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        <View {...nav} />
      </main>

      {shipmentId && <ShipmentDrawer id={shipmentId} onClose={closeDrawer} />}
    </div>
  );
}
