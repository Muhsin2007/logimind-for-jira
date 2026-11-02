/**
 * Resolver contract shared by the Forge backend and the Custom UI (imported as types only).
 * Resolver names are the keys of `ResolverApi`.
 */
import type {
  ImportBatch,
  InventoryItem,
  IssueLink,
  IssueStatus,
  IsoDate,
  JiraConfig,
  Kpis,
  RiskEvent,
  RowError,
  Severity,
  Shipment,
} from '../domain/types';

export type { ImportBatch, InventoryItem, IssueLink, IssueStatus, IsoDate, JiraConfig, Kpis, RiskEvent, RowError, Severity, Shipment };

export interface DashboardData {
  today: IsoDate;
  hasData: boolean;
  kpis: Kpis;
  topRisks: RiskEvent[];
  recentImports: ImportBatch[];
}

export interface ShipmentRow extends Shipment {
  riskIds: string[];
  topSeverity: Severity | null;
}

export interface InventoryRow extends InventoryItem {
  available: number;
  inboundSoon: number;
  projected: number;
  shortfall: number;
  inboundShipmentIds: string[];
  risk: RiskEvent | null;
}

export interface ShipmentDetail {
  shipment: Shipment;
  risks: RiskEvent[];
  /** Stock position for the shipment's SKU at its destination warehouse, if tracked. */
  inventory: InventoryRow | null;
}

export interface ImportRequest {
  filename: string;
  content: string;
}

export type ImportOutcome =
  | { ok: true; batch: ImportBatch; replaced: boolean }
  | { ok: false; errors: RowError[] };

export interface IssueLinkView extends IssueLink {
  /** Live Jira status; null when the issue was deleted or the viewer cannot see it. */
  status: IssueStatus | null;
}

export interface IssueLinksData {
  config: JiraConfig | null;
  links: IssueLinkView[];
  /** Set when live statuses could not be read; links are still listed. */
  statusError: string | null;
}

export type CreateIssueOutcome =
  | { ok: true; link: IssueLinkView }
  | {
      ok: false;
      code: 'NOT_CONFIGURED' | 'RISK_NOT_FOUND' | 'DUPLICATE' | 'BUSY' | 'AUTH' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'RATE_LIMITED' | 'UNKNOWN';
      message: string;
      link?: IssueLinkView;
    };

export interface IssueContextData {
  issueKey: string;
  link: IssueLink | null;
  /** The risk as evaluated now; null when the condition no longer holds (resolved in the data). */
  currentRisk: RiskEvent | null;
  shipment: ShipmentDetail | null;
}

export interface ResolverApi {
  getHealth: { payload: void; result: { status: 'ok'; timestamp: string } };
  getAccess: { payload: void; result: { canManageData: boolean } };
  getDashboard: { payload: void; result: DashboardData };
  listShipments: { payload: void; result: { today: IsoDate; shipments: ShipmentRow[] } };
  getShipment: { payload: { id: string }; result: ShipmentDetail | null };
  listInventory: { payload: void; result: { today: IsoDate; items: InventoryRow[] } };
  listRisks: { payload: void; result: { today: IsoDate; risks: RiskEvent[] } };
  listImports: { payload: void; result: ImportBatch[] };
  importCsv: { payload: ImportRequest; result: ImportOutcome };
  loadDemoData: { payload: void; result: ImportOutcome[] };
  clearData: { payload: void; result: { cleared: true } };
  listIssueLinks: { payload: void; result: IssueLinksData };
  createIssueForRisk: { payload: { riskId: string }; result: CreateIssueOutcome };
  listJiraProjects: { payload: void; result: { id: string; key: string; name: string }[] };
  listJiraIssueTypes: { payload: { projectKey: string }; result: { id: string; name: string }[] };
  saveJiraConfig: { payload: { projectKey: string; issueTypeId: string }; result: JiraConfig };
  getIssueContext: { payload: void; result: IssueContextData };
}
