import { kvs, WhereConditions } from '@forge/kvs';
import type { ImportBatch, InventoryItem, Shipment } from '../domain/types';
import { LockHeldError, withKvsLock } from './kvs-lock';
import { WriteInProgressError, type LogisticsRepository } from './repository';

const PREFIX = {
  shipment: 'shp:',
  inventory: 'inv:',
  batch: 'batch:',
} as const;
const LOCK_KEY = 'lock:write';

/** Forge KVS batch operations accept a limited number of items per call. */
const BATCH_SIZE = 20;
/** Batches sent concurrently; keeps large imports inside the resolver timeout. */
const CONCURRENCY = 4;
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
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/** Runs `task` over fixed-size chunks with bounded concurrency. */
async function inChunks<T>(items: T[], task: (chunk: T[]) => Promise<void>): Promise<void> {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) chunks.push(items.slice(i, i + BATCH_SIZE));
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    await Promise.all(chunks.slice(i, i + CONCURRENCY).map(task));
  }
}

function setMany<T>(items: { key: string; value: T }[]): Promise<void> {
  return inChunks(items, async (chunk) => {
    const result = await kvs.batchSet(chunk);
    if (result.failedKeys.length > 0) throw new Error(`Storage write failed for ${result.failedKeys.length} record(s)`);
  });
}

function deleteMany(keys: string[]): Promise<void> {
  return inChunks(keys, async (chunk) => {
    const result = await kvs.batchDelete(chunk.map((key) => ({ key })));
    if (result.failedKeys.length > 0) throw new Error(`Storage delete failed for ${result.failedKeys.length} record(s)`);
  });
}

/**
 * Writes the new records, then removes stale keys, so readers never see an empty dataset.
 * If writing fails, keys that did not exist before are removed again (best effort), so a
 * failed import never leaves old and new rows mixed with extra records.
 */
async function replace<T>(prefix: string, records: T[], keyOf: (r: T) => string): Promise<void> {
  const before = new Set((await listByPrefix<unknown>(prefix)).map((e) => e.key));
  const items = records.map((value) => ({ key: keyOf(value), value }));
  try {
    await setMany(items);
  } catch (err) {
    await deleteMany(items.map((i) => i.key).filter((k) => !before.has(k))).catch(() => undefined);
    throw err;
  }
  const keep = new Set(items.map((i) => i.key));
  await deleteMany([...before].filter((k) => !keep.has(k)));
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
    // Fixed-width timestamp digits make lexicographic key order chronological.
    await kvs.set(`${PREFIX.batch}${batch.importedAt.replace(/[^0-9]/g, '')}.${batch.id}`, batch);
    const all = await listByPrefix<ImportBatch>(PREFIX.batch);
    await deleteMany(all.slice(0, Math.max(0, all.length - BATCHES_KEPT)).map((b) => b.key));
  }

  async listImportBatches(): Promise<ImportBatch[]> {
    return (await listByPrefix<ImportBatch>(PREFIX.batch)).map((r) => r.value).reverse();
  }

  async clearAll(): Promise<void> {
    for (const prefix of Object.values(PREFIX)) {
      await deleteMany((await listByPrefix<unknown>(prefix)).map((e) => e.key));
    }
  }

  async withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await withKvsLock(LOCK_KEY, 2, fn);
    } catch (err) {
      throw err instanceof LockHeldError ? new WriteInProgressError() : err;
    }
  }
}
