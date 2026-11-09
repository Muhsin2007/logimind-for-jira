import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, unknown>());
const kvs = vi.hoisted(() => ({
  get: vi.fn(async (k: string) => store.get(k)),
  set: vi.fn(async (k: string, v: unknown, opts?: { keyPolicy?: string }) => {
    if (opts?.keyPolicy === 'FAIL_IF_EXISTS' && store.has(k)) throw new Error('exists');
    store.set(k, v);
  }),
  delete: vi.fn(async (k: string) => void store.delete(k)),
}));
vi.mock('@forge/kvs', () => ({ kvs }));

import { CheckBusyError } from '../../src/storage/check-store';
import { CHUNK_SIZE, KvsCheckStore } from '../../src/storage/kvs-check-store';
import type { SnapshotEntry } from '../../src/domain/risk-diff';

const entries = (n: number): SnapshotEntry[] => Array.from({ length: n }, (_, i) => [`LATE_SHIPMENT:SHP-${i}`, 'high']);

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe('KvsCheckStore', () => {
  it('splits a large snapshot into chunks, reads it back, and drops chunks no longer used', async () => {
    const s = new KvsCheckStore();
    await s.saveSnapshot({ checkedAt: 'a', today: '2026-11-08', entries: entries(CHUNK_SIZE * 2 + 1) });
    expect(store.get('snap:meta')).toEqual({ checkedAt: 'a', today: '2026-11-08', chunks: 3 });
    expect((await s.getSnapshot())?.entries).toHaveLength(CHUNK_SIZE * 2 + 1);

    await s.saveSnapshot({ checkedAt: 'b', today: '2026-11-09', entries: entries(1) });
    expect(store.has('snap:1')).toBe(false);
    expect(store.has('snap:2')).toBe(false);
    expect(await s.getSnapshot()).toEqual({ checkedAt: 'b', today: '2026-11-09', entries: entries(1) });
  });

  it('treats a missing or incomplete snapshot as none', async () => {
    const s = new KvsCheckStore();
    expect(await s.getSnapshot()).toBeNull();
    store.set('snap:meta', { checkedAt: 'a', today: '2026-11-08', chunks: 2 });
    store.set('snap:0', entries(1));
    expect(await s.getSnapshot()).toBeNull();
  });

  it('keeps an empty snapshot distinct from no snapshot', async () => {
    const s = new KvsCheckStore();
    await s.saveSnapshot({ checkedAt: 'a', today: '2026-11-08', entries: [] });
    expect(await s.getSnapshot()).toEqual({ checkedAt: 'a', today: '2026-11-08', entries: [] });
  });

  it('defaults auto-create to off and only accepts a literal true', async () => {
    const s = new KvsCheckStore();
    expect((await s.getSettings()).autoCreate).toBe(false);
    store.set('cfg:loop', { autoCreate: 'yes', updatedAt: null, updatedBy: null });
    expect((await s.getSettings()).autoCreate).toBe(false);
  });

  it('reports a second concurrent check as busy', async () => {
    const s = new KvsCheckStore();
    let release!: () => void;
    const first = s.withCheckLock(() => new Promise<void>((r) => (release = r)));
    await vi.waitFor(() => expect(store.has('lock:dailycheck')).toBe(true));
    await expect(s.withCheckLock(async () => 1)).rejects.toBeInstanceOf(CheckBusyError);
    release();
    await first;
    expect(store.has('lock:dailycheck')).toBe(false);
  });
});
