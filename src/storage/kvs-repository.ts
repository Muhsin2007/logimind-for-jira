import { kvs, WhereConditions } from '@forge/kvs';
import type { ImportBatch, InventoryItem, Shipment } from '../domain/types';
import type { LogisticsRepository } from './repository';

const PREFIX = {
  shipment: 'shp:',
  inventory: 'inv:',
  batch: 'batch:',
} as const;

/** Forge KVS batch operations accept a limited number of items per call. */
const BATCH_SIZE = 20;
const PAGE_SIZE = 100;
const BATCHES_KEPT = 10;

/** KVS keys allow a restricted character set, so user-supplied parts are base64url-encoded. */
const encode = (part: string) => Buffer.from(part, 'utf8').toString('base64url');

export const shipmentKey = (s: Pick<Shipment, 'id'>) => `${PREFIX.shipment}${encode(s.id)}`;
export const inventoryKey = (i: Pick<InventoryItem, 'sku' | 'warehouse'>) =>
  `${PREFIX.inventory}${encode(i.sku)}.${encode(i.warehouse)}`;

async function listByPrefix<T>(prefix: string): Promise<{ key: string; value: T }[]> {
  const out: { key: string; value: T }[] = [];
  let cursor: string | undefined;
  do {
    let query = kvs.query().where('key', WhereConditions.beginsWith(prefix)).limit(PAGE_SIZE);
    if (cursor) query = query.cursor(cursor);
    const page = await query.getMany<T>();
    out.push(...page.results);
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

async function setMany<T>(items: { key: string; value: T }[]): Promise<void> {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const result = await kvs.batchSet(items.slice(i, i + BATCH_SIZE));
    if (result.failedKeys.length > 0) {
      throw new Error(`Storage write failed for ${result.failedKeys.length} record(s)`);
    }
  }
}

async function deleteMany(keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const result = await kvs.batchDelete(keys.slice(i, i + BATCH_SIZE).map((key) => ({ key })));
    if (result.failedKeys.length > 0) {
      throw new Error(`Storage delete failed for ${result.failedKeys.length} record(s)`);
    }
  }
}

/** Writes the new records first, then removes stale keys, so readers never see an empty dataset mid-import. */
async function replace<T>(prefix: string, records: T[], keyOf: (r: T) => string): Promise<void> {
  const items = records.map((value) => ({ key: keyOf(value), value }));
  await setMany(items);
  const keep = new Set(items.map((i) => i.key));
  const existing = await listByPrefix<unknown>(prefix);
  await deleteMany(existing.map((e) => e.key).filter((k) => !keep.has(k)));
}

export class KvsLogisticsRepository implements LogisticsRepository {
  async listShipments(): Promise<Shipment[]> {
    return (await listByPrefix<Shipment>(PREFIX.shipment)).map((r) => r.value);
  }

  async listInventory(): Promise<InventoryItem[]> {
    return (await listByPrefix<InventoryItem>(PREFIX.inventory)).map((r) => r.value);
  }

  replaceShipments(records: Shipment[]): Promise<void> {
    return replace(PREFIX.shipment, records, shipmentKey);
  }

  replaceInventory(records: InventoryItem[]): Promise<void> {
    return replace(PREFIX.inventory, records, inventoryKey);
  }

  async saveImportBatch(batch: ImportBatch): Promise<void> {
    // Keys sort lexicographically, and ISO timestamps sort chronologically.
    await kvs.set(`${PREFIX.batch}${batch.importedAt.replace(/[^0-9]/g, '')}.${batch.id}`, batch);
    const all = await listByPrefix<ImportBatch>(PREFIX.batch);
    const stale = all.slice(0, Math.max(0, all.length - BATCHES_KEPT)).map((b) => b.key);
    await deleteMany(stale);
  }

  async listImportBatches(): Promise<ImportBatch[]> {
    return (await listByPrefix<ImportBatch>(PREFIX.batch)).map((r) => r.value).reverse();
  }

  async clearAll(): Promise<void> {
    for (const prefix of Object.values(PREFIX)) {
      await deleteMany((await listByPrefix<unknown>(prefix)).map((e) => e.key));
    }
  }
}
