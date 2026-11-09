import { kvs } from '@forge/kvs';
import type { RiskSnapshot, SnapshotEntry } from '../domain/risk-diff';
import type { CheckRun, LoopSettings } from '../shared/api';
import { CheckBusyError, type CheckStore } from './check-store';
import { LockHeldError, withKvsLock } from './kvs-lock';

const META_KEY = 'snap:meta';
const CHUNK_PREFIX = 'snap:';
const LAST_RUN_KEY = 'loop:last';
const SETTINGS_KEY = 'cfg:loop';
const LOCK_KEY = 'lock:dailycheck';
/** Entries per KVS value: about 60 bytes each keeps a chunk far below the 240 KB value limit. */
export const CHUNK_SIZE = 2000;
/** Covers the scheduled function's timeout (300 s) with margin. */
const LOCK_TTL_MINUTES = 10;

interface SnapshotMeta {
  checkedAt: string;
  today: string;
  chunks: number;
}

export const DEFAULT_LOOP_SETTINGS: LoopSettings = { autoCreate: false, updatedAt: null, updatedBy: null };

/**
 * Snapshot layout: `snap:meta` holds the chunk count, `snap:0..n-1` hold the entries. Chunks are
 * written before the meta, so a reader never sees a meta that points at chunks not written yet.
 */
export class KvsCheckStore implements CheckStore {
  async getSnapshot(): Promise<RiskSnapshot | null> {
    const meta = await kvs.get<SnapshotMeta>(META_KEY);
    if (!meta || !Number.isInteger(meta.chunks) || meta.chunks < 0) return null;
    const chunks = await Promise.all(Array.from({ length: meta.chunks }, (_, i) => kvs.get<SnapshotEntry[]>(`${CHUNK_PREFIX}${i}`)));
    // A missing chunk means an incomplete snapshot: treat it as none (the next run is a baseline).
    if (chunks.some((c) => !Array.isArray(c))) return null;
    return { checkedAt: meta.checkedAt, today: meta.today, entries: (chunks as SnapshotEntry[][]).flat() };
  }

  async saveSnapshot(snapshot: RiskSnapshot): Promise<void> {
    const previous = await kvs.get<SnapshotMeta>(META_KEY);
    const chunks: SnapshotEntry[][] = [];
    for (let i = 0; i < snapshot.entries.length; i += CHUNK_SIZE) chunks.push(snapshot.entries.slice(i, i + CHUNK_SIZE));
    for (let i = 0; i < chunks.length; i++) await kvs.set(`${CHUNK_PREFIX}${i}`, chunks[i]);
    const meta: SnapshotMeta = { checkedAt: snapshot.checkedAt, today: snapshot.today, chunks: chunks.length };
    await kvs.set(META_KEY, meta);
    for (let i = chunks.length; i < (previous?.chunks ?? 0); i++) await kvs.delete(`${CHUNK_PREFIX}${i}`).catch(() => undefined);
  }

  async getLastRun(): Promise<CheckRun | null> {
    return (await kvs.get<CheckRun>(LAST_RUN_KEY)) ?? null;
  }

  async saveLastRun(run: CheckRun): Promise<void> {
    await kvs.set(LAST_RUN_KEY, run);
  }

  async getSettings(): Promise<LoopSettings> {
    const stored = await kvs.get<LoopSettings>(SETTINGS_KEY);
    return stored ? { ...DEFAULT_LOOP_SETTINGS, ...stored, autoCreate: stored.autoCreate === true } : DEFAULT_LOOP_SETTINGS;
  }

  async saveSettings(settings: LoopSettings): Promise<void> {
    await kvs.set(SETTINGS_KEY, settings);
  }

  async withCheckLock<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await withKvsLock(LOCK_KEY, LOCK_TTL_MINUTES, fn);
    } catch (err) {
      throw err instanceof LockHeldError ? new CheckBusyError() : err;
    }
  }
}
