import { randomUUID } from 'node:crypto';
import { kvs } from '@forge/kvs';

export class LockHeldError extends Error {}

/**
 * Runs `fn` while holding a KVS lock. Acquisition is atomic (create-if-absent) and the TTL
 * frees the lock if a function dies. The lock stores a token, so a holder whose lock
 * expired never releases a lock that someone else acquired since.
 */
export async function withKvsLock<T>(key: string, ttlMinutes: number, fn: () => Promise<T>): Promise<T> {
  const token = randomUUID();
  try {
    await kvs.set(key, { token, since: new Date().toISOString() }, { keyPolicy: 'FAIL_IF_EXISTS', ttl: { value: ttlMinutes, unit: 'MINUTES' } });
  } catch (err) {
    // Only an existing lock means "busy"; any other storage failure is reported as is.
    const held = await kvs.get(key).catch(() => undefined);
    if (held) throw new LockHeldError();
    throw err;
  }
  try {
    return await fn();
  } finally {
    const current = await kvs.get<{ token: string }>(key).catch(() => undefined);
    if (current?.token === token) await kvs.delete(key).catch(() => undefined);
  }
}
