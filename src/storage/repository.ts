import type { ImportBatch, InventoryItem, Shipment } from '../domain/types';

/** Persistence port for the logistics dataset. The Forge KVS adapter implements it; tests mock it. */
export interface LogisticsRepository {
  listShipments(): Promise<Shipment[]>;
  listInventory(): Promise<InventoryItem[]>;
  /** Replaces the whole shipment dataset with `records`. */
  replaceShipments(records: Shipment[]): Promise<void>;
  /** Replaces the whole inventory dataset with `records`. */
  replaceInventory(records: InventoryItem[]): Promise<void>;
  saveImportBatch(batch: ImportBatch): Promise<void>;
  /** Most recent first. */
  listImportBatches(): Promise<ImportBatch[]>;
  clearAll(): Promise<void>;
}
