import { invoke } from '@forge/bridge';
import { useCallback, useEffect, useState } from 'react';
import type { ResolverApi } from '../../../src/shared/api';

export type * from '../../../src/shared/api';

type Args<K extends keyof ResolverApi> = ResolverApi[K]['payload'] extends void ? [] : [ResolverApi[K]['payload']];

/** Typed wrapper around `invoke` using the shared resolver contract. */
export function call<K extends keyof ResolverApi>(name: K, ...args: Args<K>): Promise<ResolverApi[K]['result']> {
  return invoke<ResolverApi[K]['result']>(name, args[0] as Record<string, unknown> | undefined);
}

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T };

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Runs `load` on mount and whenever `deps` change; `reload` re-runs it on demand. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    load()
      .then((data) => !cancelled && setState({ status: 'ready', data }))
      .catch((err: unknown) => !cancelled && setState({ status: 'error', message: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { ...state, reload };
}
