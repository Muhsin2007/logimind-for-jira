import { locationKey } from '../domain/risk-engine';
import type { ImportBatch, IsoDate, RiskEvent, Severity } from '../domain/types';
import type { InventoryRow, IssueLinksData, IssueLinkView, ShipmentDetail, ShipmentRow } from '../shared/api';
import type { IssueService } from '../services/issue-service';
import type { LogisticsService } from '../services/logistics-service';

export interface RiskSummary {
  today: IsoDate;
  total: number;
  bySeverity: Record<Severity, number>;
  /** Highest-priority risks first, capped. */
  top: RiskEvent[];
}

export interface DataFreshness {
  today: IsoDate;
  shipmentsImportedAt: string | null;
  inventoryImportedAt: string | null;
  /** Whether data exists even if its import time was pruned from history. */
  hasShipments: boolean;
  hasInventory: boolean;
}

/**
 * The read-only tools the copilot (and, in Phase 5, the Rovo agent) may use. Every result
 * comes from stored, validated data; nothing here can create, change or delete anything.
 */
export interface CopilotToolbox {
  getRiskSummary(filter?: { severity?: Severity; limit?: number }): Promise<RiskSummary>;
  getShipment(shipmentId: string): Promise<ShipmentDetail | null>;
  getInventory(sku: string, warehouse?: string): Promise<InventoryRow[]>;
  getLinkedJiraIssue(riskId: string): Promise<IssueLinkView | null>;
  /** Set when Jira links or statuses could not be read, so answers can say so. */
  getLinkLookupError(): Promise<string | null>;
  getDataFreshness(): Promise<DataFreshness>;
  /** Known identifiers, so a question can be matched to real records only. */
  listKnownIds(): Promise<{ shipmentIds: string[]; skus: string[] }>;
}

export const MAX_TOP = 10;

type Overview = Awaited<ReturnType<LogisticsService['overview']>>;

/**
 * Request-scoped toolbox: data is read once (one storage snapshot, one link lookup) and
 * every tool call in the same request answers from that consistent view.
 */
export class ServiceToolbox implements CopilotToolbox {
  private data?: Promise<Overview>;
  private links?: Promise<IssueLinksData | { error: string }>;
  private imports?: Promise<ImportBatch[]>;

  constructor(
    private readonly logistics: Pick<LogisticsService, 'overview' | 'listImports'>,
    private readonly issues: Pick<IssueService, 'listLinks'>,
  ) {}

  private overview(): Promise<Overview> {
    return (this.data ??= this.logistics.overview());
  }

  private linkData(): Promise<IssueLinksData | { error: string }> {
    return (this.links ??= this.issues.listLinks().catch((err: unknown) => ({ error: err instanceof Error ? err.message : 'Jira links unavailable' })));
  }

  async getRiskSummary(filter: { severity?: Severity; limit?: number } = {}): Promise<RiskSummary> {
    const { today, risks } = await this.overview();
    const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const r of risks) bySeverity[r.severity]++;
    const selected = filter.severity ? risks.filter((r) => r.severity === filter.severity) : risks;
    const limit = Math.min(Math.max(Math.trunc(filter.limit ?? MAX_TOP), 1), MAX_TOP);
    return { today, total: risks.length, bySeverity, top: selected.slice(0, limit) };
  }

  async getShipment(shipmentId: string): Promise<ShipmentDetail | null> {
    const { shipments, items, risks } = await this.overview();
    const wanted = shipmentId.trim().toUpperCase();
    const row = shipments.find((s) => s.id.toUpperCase() === wanted);
    if (!row) return null;
    const { riskIds: _riskIds, topSeverity: _top, ...shipment } = row;
    const loc = locationKey(shipment.sku, shipment.warehouse);
    return {
      shipment,
      risks: risks.filter((r) => r.entityType === 'shipment' && r.entityKey === shipment.id),
      inventory: items.find((i) => locationKey(i.sku, i.warehouse) === loc) ?? null,
    };
  }

  async getInventory(sku: string, warehouse?: string): Promise<InventoryRow[]> {
    const { items } = await this.overview();
    const wanted = sku.trim().toUpperCase();
    const wh = warehouse?.trim().toLowerCase();
    return items.filter((i) => i.sku.toUpperCase() === wanted && (!wh || i.warehouse.trim().toLowerCase() === wh));
  }

  async getLinkedJiraIssue(riskId: string): Promise<IssueLinkView | null> {
    const data = await this.linkData();
    return 'error' in data ? null : (data.links.find((l) => l.riskId === riskId) ?? null);
  }

  async getLinkLookupError(): Promise<string | null> {
    const data = await this.linkData();
    return 'error' in data ? data.error : data.statusError;
  }

  async getDataFreshness(): Promise<DataFreshness> {
    const [{ today, shipments, items }, batches] = await Promise.all([this.overview(), (this.imports ??= this.logistics.listImports())]);
    const latest = (kind: ImportBatch['kind']) => batches.find((b) => b.kind === kind && b.rowsValid > 0)?.importedAt ?? null;
    return {
      today,
      shipmentsImportedAt: latest('shipments'),
      inventoryImportedAt: latest('inventory'),
      hasShipments: shipments.length > 0,
      hasInventory: items.length > 0,
    };
  }

  async listKnownIds(): Promise<{ shipmentIds: string[]; skus: string[] }> {
    const { shipments, items } = await this.overview();
    return {
      shipmentIds: shipments.map((s: ShipmentRow) => s.id),
      skus: [...new Set([...items.map((i) => i.sku), ...shipments.map((s) => s.sku)])],
    };
  }
}
