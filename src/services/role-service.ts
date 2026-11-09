import { ForbiddenError } from '../auth/access';
import {
  accessFor,
  addManager,
  claimOwnership,
  removeManager,
  requireAccountId,
  RoleError,
  roleOf,
  transferOwnership,
  type Access,
  type RoleState,
} from '../domain/roles';
import type { JiraUser, UserDirectory } from '../jira/user-directory';
import type { RolesView, UserRef } from '../shared/api';
import type { RoleStore } from '../storage/role-store';

export const MIN_QUERY = 2;
const toRef = (u: JiraUser): UserRef => ({ accountId: u.accountId, displayName: u.displayName, avatarUrl: u.avatarUrl });
export const MAX_QUERY = 50;

/**
 * Who may change LogiMind data and roles. Checks run here, server-side, for every write;
 * the UI only hides what would be refused.
 */
export class RoleService {
  constructor(
    private readonly store: RoleStore,
    private readonly users: UserDirectory,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  private async isAdmin(): Promise<boolean> {
    return this.users.isSiteAdmin().catch(() => false);
  }

  async access(accountId: string | null): Promise<Access> {
    const state = await this.store.read();
    return accessFor(state, accountId, accountId ? await this.isAdmin() : false);
  }

  /** Import, demo data, delete, Jira settings, automation and "Run check now". */
  async requireDataManager(accountId: string | null): Promise<void> {
    const state = await this.store.read();
    // Once an owner exists the stored roles decide alone; until then Jira admins manage the data.
    const isAdmin = state.owner || !accountId ? false : await this.isAdmin();
    if (!accessFor(state, accountId, isAdmin).canManageData) throw new ForbiddenError();
  }

  private async requireOwner(accountId: string | null): Promise<string> {
    const state = await this.store.read();
    if (!accountId || roleOf(state, accountId) !== 'owner') throw new ForbiddenError('Only the LogiMind owner can manage roles.');
    return accountId;
  }

  /** `expectOwner`: the owner the caller saw (null when none); checked again under the lock. */
  async claimOwnership(accountId: string | null, expectOwner: unknown): Promise<void> {
    const expected = expectOwner === null ? null : requireAccountId(expectOwner);
    if (!accountId || !(await this.isAdmin())) throw new ForbiddenError('Only Jira administrators can take ownership of LogiMind.');
    await this.store.update((s) => claimOwnership(s, accountId, true, this.now(), expected));
  }

  async addManager(actor: string | null, target: unknown): Promise<void> {
    const id = requireAccountId(target);
    await this.requireOwner(actor);
    // Only an active human account the owner can see in Jira; apps and deactivated people are refused.
    if (!(await this.users.getUsers([id])).get(id)?.active) throw new RoleError('INVALID', 'Jira does not show this person as an active user you can see.');
    // The owner check is repeated on the state read under the lock.
    await this.store.update((s) => addManager(s, actor, id, this.now()));
  }

  async removeManager(actor: string | null, target: unknown): Promise<void> {
    const id = requireAccountId(target);
    await this.requireOwner(actor);
    await this.store.update((s) => removeManager(s, actor, id, this.now()));
  }

  async transferOwnership(actor: string | null, target: unknown): Promise<void> {
    const id = requireAccountId(target);
    await this.requireOwner(actor);
    await this.store.update((s) => transferOwnership(s, actor, id, this.now()));
  }

  async searchUsers(actor: string | null, query: unknown): Promise<UserRef[]> {
    await this.requireOwner(actor);
    const q = typeof query === 'string' ? query.trim() : '';
    if (q.length < MIN_QUERY || q.length > MAX_QUERY) throw new RoleError('INVALID', `Type ${MIN_QUERY} to ${MAX_QUERY} characters to search.`);
    return (await this.users.search(q)).map(toRef);
  }

  /** Owner, managers and the change log with names and avatars as Jira shows them to the caller. */
  async getRoles(): Promise<RolesView> {
    const state = await this.store.read();
    const people = await this.lookUp(state);
    const ref = (accountId: string): UserRef => {
      const person = people.get(accountId);
      return person ? toRef(person) : { accountId, displayName: null, avatarUrl: null };
    };
    return {
      owner: state.owner ? { ...ref(state.owner.accountId), since: state.owner.since } : null,
      managers: state.managers.map((m) => ({ ...ref(m.accountId), addedAt: m.addedAt })),
      log: state.log.map((e) => ({ at: e.at, action: e.action, actor: ref(e.actor), target: ref(e.target) })),
    };
  }

  private async lookUp(state: RoleState): Promise<Map<string, JiraUser>> {
    const ids = new Set<string>();
    if (state.owner) ids.add(state.owner.accountId);
    for (const m of state.managers) ids.add(m.accountId);
    for (const e of state.log) ids.add(e.actor).add(e.target);
    try {
      return await this.users.getUsers([...ids]);
    } catch (err) {
      console.warn('LogiMind roles: name lookup failed', { error: err instanceof Error ? err.message : String(err) });
      return new Map();
    }
  }
}
