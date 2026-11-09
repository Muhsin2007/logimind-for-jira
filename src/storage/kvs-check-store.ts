import { kvs } from '@forge/kvs';
import type { RiskSnapshot, SnapshotEntry } from '../domain/risk-diff';
import type { IsoDate } from '../domain/types';
import type { CheckRun, LoopSettings } from '../shared/api';
import { CheckBusyError, type CheckStore } from './check-store';
import { LockHeldError, withKvsLock } from './kvs-lock';

const SLOTS = ['a', 'b'] as const;
type Slot = (typeof SLOTS)[number];
const metaKey = (slot: Slot) => `snap:${slot}:meta`;
const chunkKey = (slot: Slot, i: number) => `snap:${slot}:${i}`;
/** Single-slot layout of the first development build; removed on clear. */
const LEGACY_META_KEY = 'snap:meta';
const LAST_RUN_KEY = 'loop:last';
const SETTINGS_KEY = 'cfg:loop';
const LOCK_KEY = 'lock:dailycheck';
/** Entries per KVS value: about 60 bytes each keeps a chunk far below the 240 KB value limit. */
export const CHUNK_SIZE = 2000;
/** Covers the scheduled function's timeout (300 s) with margin. */
const LOCK_TTL_MINUTES = 10;

interface SnapshotMeta {
  checkedAt: string;
  today: IsoDate;
  chunks: number;
}
/** Each chunk carries its snapshot's checkedAt, so a half-overwritten snapshot is detected. */
interface SnapshotChunk {
  at: string;
  e: SnapshotEntry[];
}

export const DEFAULT_LOOP_SETTINGS: LoopSettings = { autoCreate: false, updatedAt: null, updatedBy: null };

function validMeta(meta: SnapshotMeta | undefined | null): meta is SnapshotMeta {
  return !!meta && typeof meta.today === 'string' && typeof meta.checkedAt === 'string' && Number.isInteger(meta.chunks) && meta.chunks >= 0;
}

/**
 * Two snapshot slots. A save overwrites the slot of the same day, or else the older slot, so the
 * latest snapshot of an earlier day survives any number of checks today. Within a slot, chunks are
 * written before the meta and stamped with checkedAt; a reader that sees a mismatch treats the
 * snapshot as none (the next run is a baseline) instead of diffing against a mix of two runs.
 */
export class KvsCheckStore implements CheckStore {
  private async metas(): Promise<{ slot: Slot; meta: SnapshotMeta | null }[]> {
    const metas = await Promise.all(SLOTS.map((slot) => kvs.get<SnapshotMeta>(metaKey(slot))));
    return SLOTS.map((slot, i) => ({ slot, meta: validMeta(metas[i]) ? metas[i]! : null }));
  }

  async getSnapshot(before: IsoDate): Promise<RiskSnapshot | null> {
    const base = (await this.metas())
      .filter((m): m is { slot: Slot; meta: SnapshotMeta } => m.meta !== null && m.meta.today < before)
      .sort((x, y) => (y.meta.today + y.meta.checkedAt).localeCompare(x.meta.today + x.meta.checkedAt))[0];
    if (!base) return null;
    const { slot, meta } = base;
    const chunks = await Promise.all(Array.from({ length: meta.chunks }, (_, i) => kvs.get<SnapshotChunk>(chunkKey(slot, i))));
    if (chunks.some((c) => !c || c.at !== meta.checkedAt || !Array.isArray(c.e))) return null;
    return { checkedAt: meta.checkedAt, today: meta.today, entries: (chunks as SnapshotChunk[]).flatMap((c) => c.e) };
  }

  async saveSnapshot(snapshot: RiskSnapshot): Promise<void> {
    const metas = await this.metas();
    const target =
      metas.find((m) => m.meta?.today === snapshot.today) ??
      metas.find((m) => m.meta === null) ??
      [...metas].sort((x, y) => (x.meta!.today + x.meta!.checkedAt).localeCompare(y.meta!.today + y.meta!.checkedAt))[0];
    const { slot, meta: previous } = target;
    const chunks: SnapshotEntry[][] = [];
    for (let i = 0; i < snapshot.entries.length; i += CHUNK_SIZE) chunks.push(snapshot.entries.slice(i, i + CHUNK_SIZE));
    for (let i = 0; i < chunks.length; i++) await kvs.set<SnapshotChunk>(chunkKey(slot, i), { at: snapshot.checkedAt, e: chunks[i] });
    await kvs.set<SnapshotMeta>(metaKey(slot), { checkedAt: snapshot.checkedAt, today: snapshot.today, chunks: chunks.length });
    for (let i = chunks.length; i < (previous?.chunks ?? 0); i++) await kvs.delete(chunkKey(slot, i)).catch(() => undefined);
  }

  async clear(): Promise<void> {
    for (const { slot, meta } of await this.metas()) {
      await kvs.delete(metaKey(slot));
      for (let i = 0; i < (meta?.chunks ?? 0); i++) await kvs.delete(chunkKey(slot, i));
    }
    await kvs.delete(LEGACY_META_KEY);
    await kvs.delete(LAST_RUN_KEY);
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
