import { randomUUID } from 'node:crypto';
import { todayUtc } from '../domain/dates';
import { demoInventoryCsv, demoShipmentsCsv } from '../domain/demo-data';
import { importCsv } from '../domain/importer';
import { computeKpis } from '../domain/kpis';
import { buildInboundIndex, evaluateRisks, inventoryEntityKey, stockPosition, type InboundIndex } from '../domain/risk-engine';
import { SEVERITIES, type ImportBatch, type InventoryItem, type IsoDate, type RiskEvent, type Shipment } from '../domain/types';
import type { DashboardData, ImportOutcome, InventoryRow, ShipmentDetail, ShipmentRow } from '../shared/api';
import type { LogisticsRepository } from '../storage/repository';

/** Upload limit for a single CSV (characters). Keeps resolver payloads well under Forge limits. */
export const MAX_CSV_CHARS = 1_000_000;
const MAX_FILENAME = 120;

interface Snapshot {
  today: IsoDate;
  shipments: Shipment[];
  inventory: InventoryItem[];
  index: InboundIndex;
  risks: RiskEvent[];
  risksByEntity: Map<string, RiskEvent[]>;
}

export class LogisticsService {
  constructor(
    private readonly repo: LogisticsRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = randomUUID,
  ) {}

  /** Loads the dataset once and evaluates the rules once per request. */
  private async snapshot(): Promise<Snapshot> {
    const today = todayUtc(this.now());
    const [shipments, inventory] = await Promise.all([this.repo.listShipments(), this.repo.listInventory()]);
    const index = buildInboundIndex(shipments, today);
    const risks = evaluateRisks(shipments, inventory, today, index);
    const risksByEntity = new Map<string, RiskEvent[]>();
    for (const r of risks) {
      const key = `${r.entityType}:${r.entityKey}`;
      const list = risksByEntity.get(key);
      if (list) list.push(r);
      else risksByEntity.set(key, [r]);
    }
    return { today, shipments, inventory, index, risks, risksByEntity };
  }

  async getDashboard(): Promise<DashboardData> {
    const [snap, imports] = await Promise.all([this.snapshot(), this.repo.listImportBatches()]);
    return {
      today: snap.today,
      hasData: snap.shipments.length + snap.inventory.length > 0,
      kpis: computeKpis(snap.shipments, snap.inventory, snap.risks, snap.today, snap.index),
      topRisks: snap.risks.slice(0, 5),
      recentImports: imports.slice(0, 5),
    };
  }

  async listShipments(): Promise<{ today: IsoDate; shipments: ShipmentRow[] }> {
    const snap = await this.snapshot();
    // Most severe risk first, then shipments without risk; each group by planned arrival.
    const rank = (r: ShipmentRow) => (r.topSeverity ? SEVERITIES.indexOf(r.topSeverity) : SEVERITIES.length);
    const shipments = snap.shipments
      .map((s) => toShipmentRow(s, snap.risksByEntity.get(`shipment:${s.id}`) ?? []))
      .sort((a, b) => rank(a) - rank(b) || a.plannedArrival.localeCompare(b.plannedArrival) || a.id.localeCompare(b.id));
    return { today: snap.today, shipments };
  }

  async getShipment(id: string): Promise<ShipmentDetail | null> {
    const snap = await this.snapshot();
    const shipment = snap.shipments.find((s) => s.id === id);
    if (!shipment) return null;
    const item = snap.inventory.find(
      (i) => i.sku.toUpperCase() === shipment.sku.toUpperCase() && i.warehouse.trim().toLowerCase() === shipment.warehouse.trim().toLowerCase(),
    );
    return {
      shipment,
      risks: snap.risksByEntity.get(`shipment:${id}`) ?? [],
      inventory: item ? toInventoryRow(item, snap) : null,
    };
  }

  async listInventory(): Promise<{ today: IsoDate; items: InventoryRow[] }> {
    const snap = await this.snapshot();
    const items = snap.inventory
      .map((i) => toInventoryRow(i, snap))
      .sort((a, b) => b.shortfall - a.shortfall || a.available - b.available || a.sku.localeCompare(b.sku));
    return { today: snap.today, items };
  }

  /** Shipments, stock positions and risks from a single snapshot (one storage read). */
  async overview(): Promise<{ today: IsoDate; shipments: ShipmentRow[]; items: InventoryRow[]; risks: RiskEvent[] }> {
    const snap = await this.snapshot();
    return {
      today: snap.today,
      shipments: snap.shipments.map((s) => toShipmentRow(s, snap.risksByEntity.get(`shipment:${s.id}`) ?? [])),
      items: snap.inventory.map((i) => toInventoryRow(i, snap)),
      risks: snap.risks,
    };
  }

  async listRisks(): Promise<{ today: IsoDate; risks: RiskEvent[] }> {
    const snap = await this.snapshot();
    return { today: snap.today, risks: snap.risks };
  }

  listImports(): Promise<ImportBatch[]> {
    return this.repo.listImportBatches();
  }

  /**
   * Validates and imports a CSV. Rows with errors are rejected and reported; if no row is
   * valid the existing dataset is left untouched.
   */
  importCsv(filename: string, content: string, importedBy: string | null): Promise<ImportOutcome> {
    return this.repo.withWriteLock(() => this.importUnlocked(filename, content, importedBy));
  }

  loadDemoData(importedBy: string | null): Promise<ImportOutcome[]> {
    const today = todayUtc(this.now());
    return this.repo.withWriteLock(async () => [
      await this.importUnlocked('demo-shipments.csv', demoShipmentsCsv(today), importedBy),
      await this.importUnlocked('demo-inventory.csv', demoInventoryCsv(today), importedBy),
    ]);
  }

  async clearData(): Promise<{ cleared: true }> {
    await this.repo.withWriteLock(() => this.repo.clearAll());
    return { cleared: true };
  }

  private async importUnlocked(filename: string, content: string, importedBy: string | null): Promise<ImportOutcome> {
    if (content.length > MAX_CSV_CHARS) {
      return { ok: false, errors: [{ line: 0, field: null, message: `File is too large (limit ${MAX_CSV_CHARS / 1_000_000} MB)` }] };
    }
    const result = importCsv(content);
    if (!result.ok) return result;

    const batch: ImportBatch = {
      id: this.newId(),
      kind: result.kind,
      filename: filename.slice(0, MAX_FILENAME),
      importedAt: this.now().toISOString(),
      importedBy,
      rowsTotal: result.rowsTotal,
      rowsValid: result.records.length,
      rowsRejected: result.rowsTotal - result.records.length,
      errors: result.errors,
    };
    const replaced = result.records.length > 0;
    if (replaced) {
      if (result.kind === 'shipments') await this.repo.replaceShipments(result.records);
      else await this.repo.replaceInventory(result.records);
    }
    await this.repo.saveImportBatch(batch);
    return { ok: true, batch, replaced };
  }
}

function toShipmentRow(s: Shipment, risks: RiskEvent[]): ShipmentRow {
  const topSeverity = SEVERITIES.find((sev) => risks.some((r) => r.severity === sev)) ?? null;
  return { ...s, riskIds: risks.map((r) => r.id), topSeverity };
}

function toInventoryRow(item: InventoryItem, snap: Snapshot): InventoryRow {
  const risk = snap.risksByEntity.get(`inventory:${inventoryEntityKey(item)}`)?.[0] ?? null;
  return { ...item, ...stockPosition(item, snap.index), risk };
}
