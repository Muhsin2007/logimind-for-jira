import type { RiskSnapshot } from '../domain/risk-diff';
import type { CheckRun, LoopSettings } from '../shared/api';

/** Another daily check is running (a scheduled duplicate, or "Run check now" at the same time). */
export class CheckBusyError extends Error {
  constructor() {
    super('A daily check is already running. Try again in a few minutes.');
  }
}

/** Storage port for the daily check: the last snapshot of open risks, the last run, and its settings. */
export interface CheckStore {
  getSnapshot(): Promise<RiskSnapshot | null>;
  saveSnapshot(snapshot: RiskSnapshot): Promise<void>;
  getLastRun(): Promise<CheckRun | null>;
  saveLastRun(run: CheckRun): Promise<void>;
  getSettings(): Promise<LoopSettings>;
  saveSettings(settings: LoopSettings): Promise<void>;
  /** Runs `fn` while no other check runs; throws CheckBusyError otherwise. */
  withCheckLock<T>(fn: () => Promise<T>): Promise<T>;
}
