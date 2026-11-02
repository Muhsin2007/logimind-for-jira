import type { ImportBatch, InventoryItem, Shipment } from '../domain/types';

/** Persistence port for the logistics dataset. The Forge KVS adapter implements it; tests mock it. */
export interface LogisticsRepository {
  listShipments(): Promise<Shipment[]>;
  listInventory(): Promise<InventoryItem[]>;
  /** Replaces the whole shipment dataset with `records`; on failure, rolls back keys it added. */
  replaceShipments(records: Shipment[]): Promise<void>;
  /** Replaces the whole inventory dataset with `records`; on failure, rolls back keys it added. */
  replaceInventory(records: InventoryItem[]): Promise<void>;
  saveImportBatch(batch: ImportBatch): Promise<void>;
  /** Most recent first. */
  listImportBatches(): Promise<ImportBatch[]>;
  clearAll(): Promise<void>;
  /** Runs `fn` while holding a site-wide write lock; rejects if another write is in progress. */
  withWriteLock<T>(fn: () => Promise<T>): Promise<T>;
}

export class WriteInProgressError extends Error {
  constructor() {
    super('Another import or delete is already in progress. Try again in a minute.');
  }
}
