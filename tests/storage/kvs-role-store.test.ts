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

import { EMPTY_ROLES, RoleError, type RoleState } from '../../src/domain/roles';
import { KvsRoleStore, ROLES_KEY } from '../../src/storage/kvs-role-store';

const NOW = '2026-11-09T10:00:00.000Z';
const OWNED: RoleState = { owner: { accountId: 'own', since: NOW }, managers: [], log: [] };

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe('KvsRoleStore', () => {
  it('reads an empty state when nothing is stored, and normalises what is', async () => {
    expect(await new KvsRoleStore().read()).toEqual(EMPTY_ROLES);
    store.set(ROLES_KEY, { owner: { accountId: 'own', since: NOW }, managers: 'junk' });
    expect(await new KvsRoleStore().read()).toEqual(OWNED);
  });

  it('applies a change to the state read under the lock and releases the lock', async () => {
    store.set(ROLES_KEY, OWNED);
    const saved = await new KvsRoleStore().update((s) => ({ ...s, managers: [{ accountId: 'm', addedAt: NOW, addedBy: 'own' }] }));
    expect(saved.managers).toHaveLength(1);
    expect(store.get(ROLES_KEY)).toEqual(saved);
    expect([...store.keys()]).toEqual([ROLES_KEY]);
  });

  it('writes nothing when the change is refused', async () => {
    store.set(ROLES_KEY, OWNED);
    await expect(new KvsRoleStore().update(() => { throw new RoleError('FORBIDDEN', 'no'); })).rejects.toBeInstanceOf(RoleError);
    expect(store.get(ROLES_KEY)).toEqual(OWNED);
    expect(kvs.set).toHaveBeenCalledTimes(1); // only the lock
  });

  it('reports a concurrent change as BUSY instead of overwriting it', async () => {
    store.set('lock:roles', { token: 'other' });
    const err = await new KvsRoleStore().update((s) => s).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RoleError);
    expect((err as RoleError).code).toBe('BUSY');
    expect(store.get('lock:roles')).toEqual({ token: 'other' });
  });

  it('reports other storage failures as they are, not as BUSY, and releases the lock', async () => {
    kvs.set.mockImplementationOnce(async () => { throw new Error('kvs down'); });
    await expect(new KvsRoleStore().update((s) => s)).rejects.toThrow('kvs down');
    store.set(ROLES_KEY, OWNED);
    kvs.set.mockImplementation(async (k: string, v: unknown, opts?: { keyPolicy?: string }) => {
      if (k === ROLES_KEY) throw new Error('write failed');
      if (opts?.keyPolicy === 'FAIL_IF_EXISTS' && store.has(k)) throw new Error('exists');
      store.set(k, v);
    });
    await expect(new KvsRoleStore().update((s) => s)).rejects.toThrow('write failed');
    expect(store.has('lock:roles')).toBe(false);
  });
});
