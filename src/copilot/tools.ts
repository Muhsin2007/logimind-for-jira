import type { ImportBatch, IsoDate, RiskEvent, Severity } from '../domain/types';
import type { InventoryRow, IssueLinkView, ShipmentDetail } from '../shared/api';
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
  getDataFreshness(): Promise<DataFreshness>;
  /** Known identifiers, so a question can be matched to real records only. */
  listKnownIds(): Promise<{ shipmentIds: string[]; skus: string[] }>;
}

const MAX_TOP = 10;

export class ServiceToolbox implements CopilotToolbox {
  constructor(
    private readonly logistics: Pick<LogisticsService, 'listRisks' | 'getShipment' | 'listInventory' | 'listShipments' | 'listImports'>,
    private readonly issues: Pick<IssueService, 'listLinks'>,
  ) {}

  async getRiskSummary(filter: { severity?: Severity; limit?: number } = {}): Promise<RiskSummary> {
    const { today, risks } = await this.logistics.listRisks();
    const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const r of risks) bySeverity[r.severity]++;
    const selected = filter.severity ? risks.filter((r) => r.severity === filter.severity) : risks;
    return { today, total: risks.length, bySeverity, top: selected.slice(0, Math.min(filter.limit ?? MAX_TOP, MAX_TOP)) };
  }

  getShipment(shipmentId: string): Promise<ShipmentDetail | null> {
    return this.logistics.getShipment(shipmentId);
  }

  async getInventory(sku: string, warehouse?: string): Promise<InventoryRow[]> {
    const { items } = await this.logistics.listInventory();
    const wanted = sku.trim().toUpperCase();
    const wh = warehouse?.trim().toLowerCase();
    return items.filter((i) => i.sku.toUpperCase() === wanted && (!wh || i.warehouse.trim().toLowerCase() === wh));
  }

  async getLinkedJiraIssue(riskId: string): Promise<IssueLinkView | null> {
    const { links } = await this.issues.listLinks();
    return links.find((l) => l.riskId === riskId) ?? null;
  }

  async getDataFreshness(): Promise<DataFreshness> {
    const [{ today }, batches] = await Promise.all([this.logistics.listRisks(), this.logistics.listImports()]);
    const latest = (kind: ImportBatch['kind']) => batches.find((b) => b.kind === kind && b.rowsValid > 0)?.importedAt ?? null;
    return { today, shipmentsImportedAt: latest('shipments'), inventoryImportedAt: latest('inventory') };
  }

  async listKnownIds(): Promise<{ shipmentIds: string[]; skus: string[] }> {
    const [{ shipments }, { items }] = await Promise.all([this.logistics.listShipments(), this.logistics.listInventory()]);
    return {
      shipmentIds: shipments.map((s) => s.id),
      skus: [...new Set([...items.map((i) => i.sku), ...shipments.map((s) => s.sku)])],
    };
  }
}
