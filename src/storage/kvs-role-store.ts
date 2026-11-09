import { kvs } from '@forge/kvs';
import { normalizeRoles, RoleError, type RoleState } from '../domain/roles';
import { LockHeldError, withKvsLock } from './kvs-lock';
import type { RoleStore } from './role-store';

/** Owner, managers and the change log in one value, so every change is saved as a whole. */
export const ROLES_KEY = 'roles:state';
const LOCK_KEY = 'lock:roles';
const LOCK_TTL_MINUTES = 1;

export class KvsRoleStore implements RoleStore {
  async read(): Promise<RoleState> {
    return normalizeRoles(await kvs.get(ROLES_KEY));
  }

  async update(change: (state: RoleState) => RoleState): Promise<RoleState> {
    try {
      return await withKvsLock(LOCK_KEY, LOCK_TTL_MINUTES, async () => {
        const next = change(await this.read());
        await kvs.set(ROLES_KEY, next);
        return next;
      });
    } catch (err) {
      if (err instanceof LockHeldError) throw new RoleError('BUSY', 'Roles are being changed by someone else. Try again in a moment.');
      throw err;
    }
  }
}
