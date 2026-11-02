/**
 * Resolver contract shared by the Forge backend and the Custom UI (imported as types only).
 * Resolver names are the keys of `ResolverApi`.
 */
import type {
  ImportBatch,
  InventoryItem,
  IsoDate,
  Kpis,
  RiskEvent,
  RowError,
  Severity,
  Shipment,
} from '../domain/types';

export type { ImportBatch, InventoryItem, IsoDate, Kpis, RiskEvent, RowError, Severity, Shipment };

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

export interface ResolverApi {
  getHealth: { payload: void; result: { status: 'ok'; timestamp: string } };
  getDashboard: { payload: void; result: DashboardData };
  listShipments: { payload: void; result: { today: IsoDate; shipments: ShipmentRow[] } };
  getShipment: { payload: { id: string }; result: ShipmentDetail | null };
  listInventory: { payload: void; result: { today: IsoDate; items: InventoryRow[] } };
  listRisks: { payload: void; result: { today: IsoDate; risks: RiskEvent[] } };
  listImports: { payload: void; result: ImportBatch[] };
  importCsv: { payload: ImportRequest; result: ImportOutcome };
  loadDemoData: { payload: void; result: ImportOutcome[] };
  clearData: { payload: void; result: { cleared: true } };
}
