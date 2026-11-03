import { beforeEach, describe, expect, it, vi } from 'vitest';

const kvs = vi.hoisted(() => ({
  set: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
  batchSet: vi.fn(),
  batchDelete: vi.fn(),
  query: vi.fn(),
}));
vi.mock('@forge/kvs', () => ({ kvs, WhereConditions: { beginsWith: (p: string) => p } }));

import { LockHeldError, withKvsLock } from '../../src/storage/kvs-lock';
import { KvsLogisticsRepository, shipmentKey } from '../../src/storage/kvs-repository';
import { WriteInProgressError } from '../../src/storage/repository';
import type { Shipment } from '../../src/domain/types';

/** A chainable KVS query whose pages are served in order. */
function pages(...results: { key: string; value: unknown }[][]) {
  let call = 0;
  const q = {
    where: () => q,
    limit: () => q,
    cursor: () => q,
    getMany: vi.fn(async () => {
      const page = results[call] ?? [];
      call++;
      return { results: page, nextCursor: call < results.length ? `c${call}` : undefined };
    }),
  };
  return q;
}

const ship = (id: string): Shipment => ({
  id, orderId: null, supplier: 'A', sku: 'S', productName: null, qty: 1, plannedArrival: '2026-11-04', eta: null,
  actualArrival: null, status: 'planned', warehouse: 'W', carrier: null, trackingRef: null,
});

beforeEach(() => {
  vi.resetAllMocks();
  kvs.delete.mockResolvedValue(undefined);
  kvs.batchSet.mockResolvedValue({ successfulKeys: [], failedKeys: [] });
  kvs.batchDelete.mockResolvedValue({ successfulKeys: [], failedKeys: [] });
  kvs.query.mockReturnValue(pages([]));
});

describe('withKvsLock', () => {
  it('acquires atomically with a TTL, runs the work and releases its own lock', async () => {
    kvs.set.mockResolvedValue(undefined);
    kvs.get.mockImplementation(async () => ({ token: kvs.set.mock.calls[0][1].token }));
    expect(await withKvsLock('lock:x', 2, async () => 'done')).toBe('done');
    expect(kvs.set).toHaveBeenCalledWith('lock:x', expect.objectContaining({ token: expect.any(String) }), {
      keyPolicy: 'FAIL_IF_EXISTS',
      ttl: { value: 2, unit: 'MINUTES' },
    });
    expect(kvs.delete).toHaveBeenCalledWith('lock:x');
  });

  it('reports a held lock as LockHeldError without running the work', async () => {
    kvs.set.mockRejectedValue(new Error('exists'));
    kvs.get.mockResolvedValue({ token: 'someone-else' });
    const work = vi.fn();
    await expect(withKvsLock('lock:x', 2, work)).rejects.toBeInstanceOf(LockHeldError);
    expect(work).not.toHaveBeenCalled();
  });

  it('rethrows other storage errors instead of calling them "busy"', async () => {
    kvs.set.mockRejectedValue(new Error('kvs unavailable'));
    kvs.get.mockResolvedValue(undefined);
    await expect(withKvsLock('lock:x', 2, async () => 1)).rejects.toThrow('kvs unavailable');
  });

  it('never deletes a lock that another holder acquired after expiry, even when the work fails', async () => {
    kvs.set.mockResolvedValue(undefined);
    kvs.get.mockResolvedValue({ token: 'newer-holder' });
    await expect(withKvsLock('lock:x', 2, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(kvs.delete).not.toHaveBeenCalled();
  });
});

describe('KvsLogisticsRepository', () => {
  it('rolls back only newly added keys when a batch write fails', async () => {
    const existingB = shipmentKey(ship('B'));
    kvs.query.mockReturnValue(pages([{ key: shipmentKey(ship('A')), value: {} }, { key: existingB, value: {} }]));
    kvs.batchSet.mockResolvedValue({ successfulKeys: [], failedKeys: [{ key: 'x' }] });
    await expect(new KvsLogisticsRepository().replaceShipments([ship('B'), ship('C')])).rejects.toThrow('Storage write failed for 1 record(s)');
    expect(kvs.batchDelete).toHaveBeenCalledTimes(1);
    expect(kvs.batchDelete).toHaveBeenCalledWith([{ key: shipmentKey(ship('C')) }]);
  });

  it('removes stale keys only after every new record is written', async () => {
    const order: string[] = [];
    kvs.query.mockReturnValue(pages([{ key: shipmentKey(ship('A')), value: {} }]));
    kvs.batchSet.mockImplementation(async () => { order.push('set'); return { successfulKeys: [], failedKeys: [] }; });
    kvs.batchDelete.mockImplementation(async (items: { key: string }[]) => { order.push(`delete:${items.map((i) => i.key).join()}`); return { successfulKeys: [], failedKeys: [] }; });
    await new KvsLogisticsRepository().replaceShipments([ship('B')]);
    expect(order).toEqual(['set', `delete:${shipmentKey(ship('A'))}`]);
  });

  it('writes in chunks of 20 and reads every page', async () => {
    await new KvsLogisticsRepository().replaceShipments(Array.from({ length: 45 }, (_, i) => ship(`S${i}`)));
    expect(kvs.batchSet.mock.calls.map((c) => c[0].length)).toEqual([20, 20, 5]);
    kvs.query.mockReturnValue(pages([{ key: 'shp:1', value: ship('X') }], [{ key: 'shp:2', value: ship('Y') }]));
    expect((await new KvsLogisticsRepository().listShipments()).map((s) => s.id)).toEqual(['X', 'Y']);
  });

  it('maps a held write lock to WriteInProgressError', async () => {
    kvs.set.mockRejectedValue(new Error('exists'));
    kvs.get.mockResolvedValue({ token: 'other' });
    await expect(new KvsLogisticsRepository().withWriteLock(async () => 1)).rejects.toBeInstanceOf(WriteInProgressError);
  });
});
