/**
 * Resolver contract shared by the Forge backend and the Custom UI (imported as types only).
 * Resolver names are the keys of `ResolverApi`.
 */
import type { FieldSpec } from '../domain/column-mapping';
import type { CoverProjection } from '../domain/cover';
import type { RiskRef } from '../domain/risk-diff';
import type { Access, Role, RoleAction, RoleErrorCode } from '../domain/roles';
import type {
  ImportBatch,
  ImportKind,
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

export type { RiskRef };
export type { CoverProjection, FieldSpec, ImportBatch, ImportKind, InventoryItem, IssueLink, IssueStatus, IsoDate, JiraConfig, Kpis, RiskEvent, RowError, Severity, Shipment };

/** UI language chosen by the person; English is the default. */
export type UiLocale = 'en' | 'ru';

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
  /** Days of cover and projected stock-out from daily usage and all open inbound shipments. */
  cover: CoverProjection;
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

/** One column of an uploaded file with the LogiMind field it is mapped to (null = ignored). */
export interface MappedColumn {
  index: number;
  header: string;
  /** First values of the column, cleaned and capped, so the person can check the mapping. */
  samples: string[];
  field: string | null;
}

export type MappingProposal =
  | {
      ok: true;
      kind: ImportKind;
      /** 'ai' = proposed by the Forge LLM; 'name' = matched by column name only. */
      source: 'ai' | 'name';
      /** Set when AI mapping was wanted but could not be used. */
      notice: string | null;
      rowCount: number;
      columns: MappedColumn[];
      missingRequired: string[];
      schema: Record<ImportKind, FieldSpec[]>;
    }
  | { ok: false; message: string };

export interface MappedImportRequest extends ImportRequest {
  kind: ImportKind;
  /** One target field (or null to ignore) per column, in file order. */
  mapping: (string | null)[];
}

/** A link as shown to viewers: current key, live status, and no creator account ID. */
export interface IssueLinkView extends Omit<IssueLink, 'createdBy'> {
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
      code: 'NOT_CONFIGURED' | 'RISK_NOT_FOUND' | 'DUPLICATE' | 'BUSY' | 'LINK_FAILED' | 'AUTH' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'RATE_LIMITED' | 'UNKNOWN';
      message: string;
      link?: IssueLinkView;
    };

export interface IssueContextData {
  issueKey: string;
  link: IssueLinkView | null;
  /** The risk as evaluated now; null when the condition no longer holds (resolved in the data). */
  currentRisk: RiskEvent | null;
  shipment: ShipmentDetail | null;
}

/** A statement in a copilot answer, with the record IDs that support it. */
export interface CitedStatement {
  text: string;
  ids: string[];
}

export interface CopilotRecommendation extends CitedStatement {
  priority: 'high' | 'medium' | 'low';
  /** Which data the recommendation is derived from. */
  evidence: string;
  confidence: 'high' | 'medium' | 'low';
}

export type CopilotIntent = 'risk_summary' | 'shipment' | 'inventory' | 'help';

export interface CopilotAnswer {
  /** 'rules' = deterministic answers from the data; 'llm' = written by the Forge LLM from read-only tool results, every cited ID checked. */
  mode: 'rules' | 'llm';
  /** Set when an AI answer was attempted but the rule-based answer is shown instead. */
  fallbackReason?: string;
  intent: CopilotIntent;
  question: string;
  facts: CitedStatement[];
  recommendations: CopilotRecommendation[];
  unknowns: string[];
  dataAsOf: { today: IsoDate; shipmentsImportedAt: string | null; inventoryImportedAt: string | null };
}

/** Result of one daily check (scheduled or "Run check now"); stored as the latest run. */
export interface CheckRun {
  checkedAt: string;
  today: IsoDate;
  trigger: 'schedule' | 'manual';
  /** First check: open risks were recorded, nothing is reported as new or resolved. */
  baseline: boolean;
  counts: { open: number; newRisks: number; resolved: number; stillOpen: number; stillCritical: number };
  /** Capped lists for the briefing; counts hold the full numbers. */
  newRisks: RiskRef[];
  resolved: RiskRef[];
  stillCritical: RiskRef[];
  autoCreate: {
    enabled: boolean;
    created: { riskId: string; issueKey: string }[];
    /** Newly critical risks left without an issue (cap reached, error, or no project set). */
    notCreated: number;
    error: { code: string; message: string } | null;
    /** Risk IDs the next run retries (left over by the cap or an error); capped. */
    pending?: string[];
  };
  comments: { added: { riskId: string; issueKey: string }[]; error: string | null };
  /** No data was imported: nothing was compared, filed or commented. */
  noData?: boolean;
}

export interface LoopSettings {
  /** Create Jira issues for newly critical risks during the daily check. Off by default. */
  autoCreate: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface DailyBriefing {
  lastRun: CheckRun | null;
  autoCreate: boolean;
}

export interface FollowUpDraft {
  /** 'llm' = drafted by the Forge LLM and checked against the facts; 'template' = fixed text. */
  mode: 'llm' | 'template';
  shipmentId: string;
  subject: string;
  body: string;
  fallbackReason?: string;
}

/** A person as Jira shows them to the viewer; null name = deleted or not visible ("unavailable user"). */
export interface UserRef {
  accountId: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface RolesView {
  owner: (UserRef & { since: string }) | null;
  managers: (UserRef & { addedAt: string })[];
  /** Newest first, at most 50 entries. */
  log: { at: string; action: RoleAction; actor: UserRef; target: UserRef }[];
}

export type { Access, Role, RoleAction };

/** Result of a role change; failures carry a code the UI turns into a message. */
/** The client reloads the roles after every outcome. UNKNOWN: Jira or storage failed; details are only logged. */
export type RoleOutcome = { ok: true } | { ok: false; code: RoleErrorCode | 'UNKNOWN'; message: string };

export interface ResolverApi {
  getHealth: { payload: void; result: { status: 'ok'; timestamp: string } };
  getAccess: { payload: void; result: Access };
  getRoles: { payload: void; result: RolesView };
  claimOwnership: { payload: { expectOwner: string | null }; result: RoleOutcome };
  addManager: { payload: { accountId: string }; result: RoleOutcome };
  removeManager: { payload: { accountId: string }; result: RoleOutcome };
  transferOwnership: { payload: { accountId: string }; result: RoleOutcome };
  searchUsers: { payload: { query: string }; result: { ok: true; users: UserRef[] } | { ok: false; code: 'FORBIDDEN' | 'INVALID' | 'UNKNOWN'; message: string } };
  getDashboard: { payload: void; result: DashboardData };
  listShipments: { payload: void; result: { today: IsoDate; shipments: ShipmentRow[] } };
  getShipment: { payload: { id: string }; result: ShipmentDetail | null };
  listInventory: { payload: void; result: { today: IsoDate; items: InventoryRow[] } };
  listRisks: { payload: void; result: { today: IsoDate; risks: RiskEvent[] } };
  listImports: { payload: void; result: ImportBatch[] };
  importCsv: { payload: ImportRequest; result: ImportOutcome };
  proposeColumnMapping: { payload: ImportRequest; result: MappingProposal };
  importCsvWithMapping: { payload: MappedImportRequest; result: ImportOutcome };
  loadDemoData: { payload: void; result: ImportOutcome[] };
  clearData: { payload: void; result: { cleared: true } };
  listIssueLinks: { payload: void; result: IssueLinksData };
  createIssueForRisk: { payload: { riskId: string }; result: CreateIssueOutcome };
  listJiraProjects: { payload: void; result: { id: string; key: string; name: string }[] };
  listJiraIssueTypes: { payload: { projectKey: string }; result: { id: string; name: string }[] };
  saveJiraConfig: { payload: { projectKey: string; issueTypeId: string }; result: JiraConfig };
  getIssueContext: { payload: void; result: IssueContextData };
  askCopilot: { payload: { question: string; locale?: UiLocale }; result: CopilotAnswer };
  getDailyBriefing: { payload: void; result: DailyBriefing };
  runDailyCheck: { payload: void; result: { ok: true; run: CheckRun } | { ok: false; code: 'BUSY'; message: string } };
  getLoopSettings: { payload: void; result: Omit<LoopSettings, 'updatedBy'> };
  saveLoopSettings: { payload: { autoCreate: boolean }; result: Omit<LoopSettings, 'updatedBy'> };
  draftFollowUp: { payload: { shipmentId: string; locale?: UiLocale }; result: FollowUpDraft | null };
}
