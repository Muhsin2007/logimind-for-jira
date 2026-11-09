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
  it('splits a large snapshot into chunks and reads it back as the base for a later day only', async () => {
    const s = new KvsCheckStore();
    await s.saveSnapshot({ checkedAt: 'a', today: '2026-11-08', entries: entries(CHUNK_SIZE * 2 + 1) });
    expect((await s.getSnapshot('2026-11-09'))?.entries).toHaveLength(CHUNK_SIZE * 2 + 1);
    // Not a base for its own day: a second check that day compares with the day before.
    expect(await s.getSnapshot('2026-11-08')).toBeNull();
  });

  it('keeps the previous day as the base when a day is checked twice', async () => {
    const s = new KvsCheckStore();
    await s.saveSnapshot({ checkedAt: 'a', today: '2026-11-08', entries: entries(3) });
    await s.saveSnapshot({ checkedAt: 'b', today: '2026-11-09', entries: entries(1) });
    await s.saveSnapshot({ checkedAt: 'c', today: '2026-11-09', entries: entries(2) });
    expect(await s.getSnapshot('2026-11-09')).toEqual({ checkedAt: 'a', today: '2026-11-08', entries: entries(3) });
    expect(await s.getSnapshot('2026-11-10')).toEqual({ checkedAt: 'c', today: '2026-11-09', entries: entries(2) });
    await s.saveSnapshot({ checkedAt: 'd', today: '2026-11-10', entries: entries(1) });
    expect((await s.getSnapshot('2026-11-10'))?.checkedAt).toBe('c');
    expect((await s.getSnapshot('2026-11-11'))?.checkedAt).toBe('d');
  });

  it('drops chunks a smaller snapshot no longer uses', async () => {
    const s = new KvsCheckStore();
    await s.saveSnapshot({ checkedAt: 'a', today: '2026-11-08', entries: entries(CHUNK_SIZE * 2 + 1) });
    const before = [...store.keys()].filter((k) => k.startsWith('snap:')).length;
    await s.saveSnapshot({ checkedAt: 'b', today: '2026-11-08', entries: entries(1) });
    expect([...store.keys()].filter((k) => k.startsWith('snap:')).length).toBe(before - 2);
    expect(await s.getSnapshot('2026-11-09')).toEqual({ checkedAt: 'b', today: '2026-11-08', entries: entries(1) });
  });

  it('treats a missing, incomplete or half-overwritten snapshot as none', async () => {
    const s = new KvsCheckStore();
    expect(await s.getSnapshot('2026-11-09')).toBeNull();
    await s.saveSnapshot({ checkedAt: 'a', today: '2026-11-08', entries: entries(CHUNK_SIZE + 1) });
    const chunkKey = [...store.keys()].find((k) => /^snap:[ab]:1$/.test(k))!;
    store.set(chunkKey, { at: 'other run', e: entries(1) });
    expect(await s.getSnapshot('2026-11-09')).toBeNull();
    store.delete(chunkKey);
    expect(await s.getSnapshot('2026-11-09')).toBeNull();
  });

  it('keeps an empty snapshot distinct from no snapshot', async () => {
    const s = new KvsCheckStore();
    await s.saveSnapshot({ checkedAt: 'a', today: '2026-11-08', entries: [] });
    expect(await s.getSnapshot('2026-11-09')).toEqual({ checkedAt: 'a', today: '2026-11-08', entries: [] });
  });

  it('clears snapshots and the last run, but keeps the settings', async () => {
    const s = new KvsCheckStore();
    await s.saveSnapshot({ checkedAt: 'a', today: '2026-11-08', entries: entries(2) });
    await s.saveSnapshot({ checkedAt: 'b', today: '2026-11-09', entries: entries(2) });
    await s.saveLastRun({ checkedAt: 'b' } as never);
    await s.saveSettings({ autoCreate: true, updatedAt: null, updatedBy: null });
    await s.clear();
    expect([...store.keys()]).toEqual(['cfg:loop']);
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
