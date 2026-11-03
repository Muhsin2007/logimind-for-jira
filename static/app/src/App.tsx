import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { UiLocale } from './api';
import { LOCALE_NAMES, useI18n } from './i18n';
import { Copilot } from './views/Copilot';
import { Dashboard } from './views/Dashboard';
import { ImportSettings } from './views/ImportSettings';
import { Inventory } from './views/Inventory';
import { RiskCenter } from './views/RiskCenter';
import { ShipmentDrawer } from './views/ShipmentDrawer';
import { Shipments } from './views/Shipments';
import { WhatIf } from './views/WhatIf';

export type Tab = 'dashboard' | 'shipments' | 'inventory' | 'whatIf' | 'risks' | 'copilot' | 'import';

export interface NavProps {
  /** Increments after any data change so views refetch. */
  dataVersion: number;
  onOpenShipment: (id: string) => void;
  onNavigate: (tab: Tab) => void;
  onDataChanged: () => void;
  /** Shipment to preselect in the what-if view (from the shipment drawer). */
  whatIfShipmentId: string | null;
}

const TABS: Tab[] = ['dashboard', 'shipments', 'inventory', 'whatIf', 'risks', 'copilot', 'import'];

const VIEWS: Record<Tab, (props: NavProps) => JSX.Element> = {
  dashboard: Dashboard,
  shipments: Shipments,
  inventory: Inventory,
  whatIf: WhatIf,
  risks: RiskCenter,
  copilot: Copilot,
  import: ImportSettings,
};

export function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [shipmentId, setShipmentId] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [whatIfShipmentId, setWhatIfShipmentId] = useState<string | null>(null);

  const onDataChanged = useCallback(() => setDataVersion((v) => v + 1), []);
  const nav = useMemo<NavProps>(
    () => ({ dataVersion, onOpenShipment: setShipmentId, onNavigate: setTab, onDataChanged, whatIfShipmentId }),
    [dataVersion, onDataChanged, whatIfShipmentId],
  );
  const closeDrawer = useCallback(() => setShipmentId(null), []);
  const simulate = useCallback((id: string) => {
    setWhatIfShipmentId(id);
    setShipmentId(null);
    setTab('whatIf');
  }, []);

  // While the drawer is open the page behind it is inert (React 18 has no `inert` prop).
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (panel.current) panel.current.inert = shipmentId !== null;
  }, [shipmentId]);

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const target: Record<string, number> = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    if (!(e.key in target)) return;
    e.preventDefault();
    const next = TABS[target[e.key]];
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  const View = VIEWS[tab];
  const { t } = useI18n();

  return (
    <div className="app">
      <div className="app-head">
        {/* Jira already renders the page title, so the app only adds a subtitle. */}
        <p className="muted">{t.appSubtitle}</p>
        <LanguageSwitch />
      </div>

      <div className="tabs" role="tablist" aria-label={t.sections}>
        {TABS.map((id, i) => (
          <button
            key={id}
            id={`tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls="tabpanel"
            tabIndex={tab === id ? 0 : -1}
            className={`tab${tab === id ? ' tab-active' : ''}`}
            onClick={() => setTab(id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {t.tabs[id]}
          </button>
        ))}
      </div>

      <div ref={panel} id="tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        <View {...nav} />
      </div>

      {shipmentId && <ShipmentDrawer id={shipmentId} onClose={closeDrawer} onSimulate={simulate} />}
    </div>
  );
}

/** Compact EN / RU switch; the choice is saved per person in this browser. */
function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label={t.language}>
      {(Object.keys(LOCALE_NAMES) as UiLocale[]).map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          className={`btn btn-subtle lang-btn${locale === l ? ' lang-active' : ''}`}
          aria-pressed={locale === l}
          title={LOCALE_NAMES[l]}
          onClick={() => setLocale(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
