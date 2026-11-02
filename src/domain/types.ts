/** ISO calendar date, `YYYY-MM-DD`. */
export type IsoDate = string;

export const SHIPMENT_STATUSES = [
  'planned',
  'confirmed',
  'in_transit',
  'customs',
  'delivered',
  'cancelled',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export interface Shipment {
  id: string;
  orderId: string | null;
  supplier: string;
  sku: string;
  productName: string | null;
  qty: number;
  plannedArrival: IsoDate;
  eta: IsoDate | null;
  actualArrival: IsoDate | null;
  status: ShipmentStatus;
  warehouse: string;
  carrier: string | null;
  trackingRef: string | null;
}

export interface InventoryItem {
  sku: string;
  productName: string | null;
  warehouse: string;
  onHand: number;
  reserved: number;
  inboundQty: number;
  safetyStock: number;
  unitCost: number | null;
  updatedAt: IsoDate | null;
}

export const RISK_TYPES = ['LATE_SHIPMENT', 'ETA_SLIP', 'MISSING_ETA', 'LOW_STOCK'] as const;
export type RiskType = (typeof RISK_TYPES)[number];

export const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface RiskEvidence {
  label: string;
  value: string | number | null;
}

export interface RiskEvent {
  /** Deterministic: `${type}:${entityKey}` so the same condition always maps to the same ID. */
  id: string;
  type: RiskType;
  severity: Severity;
  entityType: 'shipment' | 'inventory';
  /** Shipment ID, or `SKU@warehouse` for inventory. */
  entityKey: string;
  title: string;
  evidence: RiskEvidence[];
  ruleVersion: string;
  evaluatedOn: IsoDate;
}

export type ImportKind = 'shipments' | 'inventory';

export interface RowError {
  /** 1-based line number in the source file (header is line 1). */
  line: number;
  field: string | null;
  message: string;
}

export interface ImportBatch {
  id: string;
  kind: ImportKind;
  filename: string;
  importedAt: string;
  /** Atlassian account ID of the importing user, for audit. */
  importedBy: string | null;
  rowsTotal: number;
  rowsValid: number;
  rowsRejected: number;
  errors: RowError[];
}

/** Where "Create Jira issue" puts new issues; chosen by a Jira administrator. */
export interface JiraConfig {
  projectKey: string;
  projectName: string;
  issueTypeId: string;
  issueTypeName: string;
  updatedAt: string;
  updatedBy: string | null;
}

/** A Jira issue created from a LogiMind risk. One per risk ID. */
export interface IssueLink {
  riskId: string;
  riskType: RiskType;
  severity: Severity;
  entityType: RiskEvent['entityType'];
  entityKey: string;
  riskTitle: string;
  issueId: string;
  issueKey: string;
  projectKey: string;
  createdAt: string;
  createdBy: string | null;
}

export type StatusCategory = 'new' | 'indeterminate' | 'done' | 'unknown';

export interface IssueStatus {
  statusName: string;
  category: StatusCategory;
}

export interface Kpis {
  shipmentsTotal: number;
  shipmentsOpen: number;
  shipmentsInTransit: number;
  shipmentsDelivered: number;
  shipmentsLate: number;
  /** Share of delivered shipments that arrived on or before plannedArrival; null if none delivered. */
  onTimeRate: number | null;
  skusTracked: number;
  skusBelowSafety: number;
  /** Sum of unitCost × shortfall below safety stock, for items with a known unit cost. */
  valueAtRisk: number;
  risksBySeverity: Record<Severity, number>;
}
