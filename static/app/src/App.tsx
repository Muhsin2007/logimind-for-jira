import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { UiLocale } from './api';
import { LOCALE_NAMES, useI18n } from './i18n';
import { Icon, LogoMark, type IconName } from './icons';
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

const TAB_ICONS: Record<Tab, IconName> = {
  dashboard: 'dashboard',
  shipments: 'truck',
  inventory: 'box',
  whatIf: 'sliders',
  risks: 'alert',
  copilot: 'sparkles',
  import: 'upload',
};

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
  // A preselected shipment applies to one visit only; normal navigation starts fresh.
  const selectTab = useCallback((next: Tab) => {
    setWhatIfShipmentId(null);
    setTab(next);
  }, []);
  const nav = useMemo<NavProps>(
    () => ({ dataVersion, onOpenShipment: setShipmentId, onNavigate: selectTab, onDataChanged, whatIfShipmentId }),
    [dataVersion, onDataChanged, whatIfShipmentId, selectTab],
  );
  const closeDrawer = useCallback(() => setShipmentId(null), []);
  const simulate = useCallback((id: string) => {
    setWhatIfShipmentId(id);
    setShipmentId(null);
    setTab('whatIf');
    // The drawer's opener is gone with the old tab, so focus moves to the What-if tab.
    requestAnimationFrame(() => document.getElementById('tab-whatIf')?.focus());
  }, []);

  // While the drawer is open the page behind it is inert (React 18 has no `inert` prop).
  const page = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (page.current) page.current.inert = shipmentId !== null;
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
    selectTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  const View = VIEWS[tab];
  const { t } = useI18n();

  return (
    <div className="app">
      <div ref={page}>
      <header className="topbar">
        <div className="brand">
          <LogoMark />
          <div className="brand-text">
            {/* Jira already renders the page title; the product name here is the app's identity. */}
            <span className="brand-name">LogiMind</span>
            <span className="brand-sub">{t.appSubtitle}</span>
          </div>
        </div>
        <LanguageSwitch />
      </header>

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
            onClick={() => selectTab(id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            <Icon name={TAB_ICONS[id]} />
            {t.tabs[id]}
          </button>
        ))}
      </div>

      <div id="tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={-1}>
        <div className="page-head">
          <div>
            <h1>{t.tabs[tab]}</h1>
            <p>{t.pageDesc[tab]}</p>
          </div>
        </div>
        <View {...nav} />
      </div>
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
          className="lang-btn"
          aria-pressed={locale === l}
          title={LOCALE_NAMES[l]}
          aria-label={LOCALE_NAMES[l]}
          onClick={() => setLocale(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
