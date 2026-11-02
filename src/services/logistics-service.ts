import { addDays, todayUtc } from '../domain/dates';
import { demoInventoryCsv, demoShipmentsCsv } from '../domain/demo-data';
import { importCsv } from '../domain/importer';
import { computeKpis } from '../domain/kpis';
import { evaluateRisks, INBOUND_WINDOW_DAYS, stockPosition } from '../domain/risk-engine';
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
  risks: RiskEvent[];
}

export class LogisticsService {
  constructor(
    private readonly repo: LogisticsRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => Math.random().toString(36).slice(2, 10),
  ) {}

  private async snapshot(): Promise<Snapshot> {
    const today = todayUtc(this.now());
    const [shipments, inventory] = await Promise.all([this.repo.listShipments(), this.repo.listInventory()]);
    return { today, shipments, inventory, risks: evaluateRisks(shipments, inventory, today) };
  }

  async getDashboard(): Promise<DashboardData> {
    const snap = await this.snapshot();
    return {
      today: snap.today,
      hasData: snap.shipments.length + snap.inventory.length > 0,
      kpis: computeKpis(snap.shipments, snap.inventory, snap.risks, snap.today),
      topRisks: snap.risks.slice(0, 5),
      recentImports: (await this.repo.listImportBatches()).slice(0, 5),
    };
  }

  async listShipments(): Promise<{ today: IsoDate; shipments: ShipmentRow[] }> {
    const snap = await this.snapshot();
    const byEntity = groupRisks(snap.risks);
    // Most severe risk first, then shipments without risk; each group by planned arrival.
    const rank = (r: ShipmentRow) => (r.topSeverity ? SEVERITIES.indexOf(r.topSeverity) : SEVERITIES.length);
    const shipments = snap.shipments
      .map((s) => toShipmentRow(s, byEntity.get(s.id) ?? []))
      .sort((a, b) => rank(a) - rank(b) || a.plannedArrival.localeCompare(b.plannedArrival) || a.id.localeCompare(b.id));
    return { today: snap.today, shipments };
  }

  async getShipment(id: string): Promise<ShipmentDetail | null> {
    const snap = await this.snapshot();
    const shipment = snap.shipments.find((s) => s.id === id);
    if (!shipment) return null;
    const item = snap.inventory.find((i) => i.sku === shipment.sku && i.warehouse === shipment.warehouse);
    return {
      shipment,
      risks: snap.risks.filter((r) => r.entityType === 'shipment' && r.entityKey === id),
      inventory: item ? toInventoryRow(item, snap) : null,
    };
  }

  async listInventory(): Promise<{ today: IsoDate; items: InventoryRow[] }> {
    const snap = await this.snapshot();
    const items = snap.inventory
      .map((i) => toInventoryRow(i, snap))
      .sort((a, b) => b.shortfall - a.shortfall || a.sku.localeCompare(b.sku));
    return { today: snap.today, items };
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
  async importCsv(filename: string, content: string): Promise<ImportOutcome> {
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

  async loadDemoData(): Promise<ImportOutcome[]> {
    const today = todayUtc(this.now());
    return [
      await this.importCsv('demo-shipments.csv', demoShipmentsCsv(today)),
      await this.importCsv('demo-inventory.csv', demoInventoryCsv(today)),
    ];
  }

  async clearData(): Promise<{ cleared: true }> {
    await this.repo.clearAll();
    return { cleared: true };
  }
}

function groupRisks(risks: RiskEvent[]): Map<string, RiskEvent[]> {
  const map = new Map<string, RiskEvent[]>();
  for (const r of risks) map.set(r.entityKey, [...(map.get(r.entityKey) ?? []), r]);
  return map;
}

function toShipmentRow(s: Shipment, risks: RiskEvent[]): ShipmentRow {
  const topSeverity = SEVERITIES.find((sev) => risks.some((r) => r.severity === sev)) ?? null;
  return { ...s, riskIds: risks.map((r) => r.id), topSeverity };
}

function toInventoryRow(item: InventoryItem, snap: Snapshot): InventoryRow {
  const position = stockPosition(item, snap.shipments, snap.today, addDays(snap.today, INBOUND_WINDOW_DAYS));
  const risk = snap.risks.find((r) => r.entityType === 'inventory' && r.entityKey === `${item.sku}@${item.warehouse}`) ?? null;
  return { ...item, ...position, risk };
}
