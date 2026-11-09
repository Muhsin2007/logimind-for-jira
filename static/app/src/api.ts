import { invoke } from '@forge/bridge';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

/** Forge `invoke` often rejects with plain objects rather than `Error` instances. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : 'Unexpected error';
}

/**
 * Runs `load` on mount and whenever `deps` change; `reload` re-runs it on demand.
 * A refetch keeps showing the previous data instead of dropping back to loading.
 */
/** `reload()` resolves once the reloaded data (or its error) is shown, so callers can wait for it. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> & { reload: () => Promise<void> } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  const waiting = useRef<(() => void)[]>([]);
  const reload = useCallback(
    () =>
      new Promise<void>((resolve) => {
        waiting.current.push(resolve);
        setTick((t) => t + 1);
      }),
    [],
  );
  // Callers close only over values listed in `deps`, so the latest `load` is always the right one.
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    setState((s) => (s.status === 'ready' ? s : { status: 'loading' }));
    loadRef.current()
      .then((data) => !cancelled && setState({ status: 'ready', data }))
      .catch((err: unknown) => !cancelled && setState({ status: 'error', message: errorMessage(err) }))
      .finally(() => {
        // A superseded load leaves its waiters to the newer one.
        if (cancelled) return;
        const done = waiting.current;
        waiting.current = [];
        done.forEach((resolve) => resolve());
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return useMemo(() => ({ ...state, reload }), [state, reload]);
}
