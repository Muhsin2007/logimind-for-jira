import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '../../src/auth/access';
import { EMPTY_ROLES, RoleError, type RoleState } from '../../src/domain/roles';
import type { JiraUser, UserDirectory } from '../../src/jira/user-directory';
import { RoleService } from '../../src/services/role-service';
import type { RoleStore } from '../../src/storage/role-store';

const NOW = '2026-11-09T10:00:00.000Z';
const OWNED: RoleState = {
  owner: { accountId: 'own', since: NOW },
  managers: [{ accountId: 'mgr', addedAt: NOW, addedBy: 'own' }],
  log: [{ at: NOW, actor: 'own', action: 'add-manager', target: 'mgr' }],
};
const user = (accountId: string, active = true): JiraUser => ({ accountId, displayName: `Name ${accountId}`, avatarUrl: `https://avatar/${accountId}`, active });
const ref = (accountId: string) => ({ accountId, displayName: `Name ${accountId}`, avatarUrl: `https://avatar/${accountId}` });

let state: RoleState;
let store: { read: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
let users: { isSiteAdmin: ReturnType<typeof vi.fn>; search: ReturnType<typeof vi.fn>; getUsers: ReturnType<typeof vi.fn> };
let service: RoleService;

beforeEach(() => {
  state = OWNED;
  store = {
    read: vi.fn(async () => state),
    // The real store applies the change to the state it reads under its lock.
    update: vi.fn(async (change: (s: RoleState) => RoleState) => (state = change(state))),
  };
  users = {
    isSiteAdmin: vi.fn(async () => false),
    search: vi.fn(async () => [user('a1'), user('a2')]),
    getUsers: vi.fn(async (ids: string[]) => new Map(ids.filter((id) => id !== 'gone').map((id) => [id, user(id, id !== 'off')]))),
  };
  service = new RoleService(store as unknown as RoleStore, users as unknown as UserDirectory, () => NOW);
});

describe('RoleService access checks', () => {
  it('falls back to the Jira-admin check only while no owner is set', async () => {
    state = EMPTY_ROLES;
    users.isSiteAdmin.mockResolvedValue(true);
    await expect(service.requireDataManager('adm')).resolves.toBeUndefined();
    users.isSiteAdmin.mockResolvedValue(false);
    await expect(service.requireDataManager('x')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('uses the stored roles once an owner is set, without asking Jira', async () => {
    await expect(service.requireDataManager('own')).resolves.toBeUndefined();
    await expect(service.requireDataManager('mgr')).resolves.toBeUndefined();
    users.isSiteAdmin.mockResolvedValue(true);
    await expect(service.requireDataManager('adm')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.requireDataManager(null)).rejects.toBeInstanceOf(ForbiddenError);
    expect(users.isSiteAdmin).not.toHaveBeenCalled();
  });

  it('reports the caller access, including whether a Jira admin may take ownership', async () => {
    users.isSiteAdmin.mockResolvedValue(true);
    expect(await service.access('adm')).toMatchObject({ role: 'viewer', canManageData: false, canClaimOwnership: true, ownerAssigned: true });
    expect(await service.access('mgr')).toMatchObject({ role: 'manager', canManageData: true });
  });

  it('treats a failed admin check as "not an admin"', async () => {
    state = EMPTY_ROLES;
    users.isSiteAdmin.mockRejectedValue(new Error('jira down'));
    await expect(service.requireDataManager('adm')).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('RoleService changes', () => {
  it('claims ownership after checking the admin permission, inside the store update', async () => {
    state = EMPTY_ROLES;
    users.isSiteAdmin.mockResolvedValue(true);
    await service.claimOwnership('adm', null);
    expect(state.owner?.accountId).toBe('adm');
    expect(store.update).toHaveBeenCalledTimes(1);
  });

  it('refuses a claim when someone claimed first, and validates the expected owner', async () => {
    users.isSiteAdmin.mockResolvedValue(true);
    await expect(service.claimOwnership('adm', null)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(service.claimOwnership('adm', 'bad id!')).rejects.toMatchObject({ code: 'INVALID' });
    await service.claimOwnership('adm', 'own');
    expect(state.owner?.accountId).toBe('adm');
  });

  it('does not ask Jira about admins for a signed-out caller', async () => {
    expect(await service.access(null)).toMatchObject({ role: 'viewer', canManageData: false });
    expect(users.isSiteAdmin).not.toHaveBeenCalled();
  });

  it('refuses a claim by a non-admin before touching the store', async () => {
    state = EMPTY_ROLES;
    await expect(service.claimOwnership('x', null)).rejects.toBeInstanceOf(ForbiddenError);
    expect(store.update).not.toHaveBeenCalled();
  });

  it('checks the owner again on the state read under the lock (no stale decision)', async () => {
    // Between the caller's read and the update, ownership moved to someone else.
    store.update.mockImplementationOnce(async (change: (s: RoleState) => RoleState) => change({ ...OWNED, owner: { accountId: 'other', since: NOW } }));
    const err = await service.addManager('own', 'a1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RoleError);
    expect((err as RoleError).code).toBe('FORBIDDEN');
  });

  it('adds only people Jira knows and the caller can see', async () => {
    await service.addManager('own', 'a1');
    expect(state.managers.map((m) => m.accountId)).toEqual(['mgr', 'a1']);
    const err = await service.addManager('own', 'gone').catch((e: unknown) => e);
    expect((err as RoleError).code).toBe('INVALID');
  });

  it('refuses deactivated people and app accounts on the server, not only in the search', async () => {
    await expect(service.addManager('own', 'off')).rejects.toMatchObject({ code: 'INVALID' });
    expect(state.managers.map((m) => m.accountId)).toEqual(['mgr']);
  });

  it('refuses removal and hand-over by anyone but the owner', async () => {
    for (const actor of ['mgr', 'x', null]) {
      await expect(service.removeManager(actor, 'mgr')).rejects.toBeInstanceOf(ForbiddenError);
      await expect(service.transferOwnership(actor, 'mgr')).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(store.update).not.toHaveBeenCalled();
  });

  it('refuses role changes by a manager or viewer before calling Jira', async () => {
    for (const actor of ['mgr', 'x', null]) {
      await expect(service.addManager(actor, 'a1')).rejects.toBeInstanceOf(ForbiddenError);
      await expect(service.searchUsers(actor, 'ann')).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(users.getUsers).not.toHaveBeenCalled();
    expect(users.search).not.toHaveBeenCalled();
  });

  it('removes a manager and transfers ownership', async () => {
    await service.transferOwnership('own', 'mgr');
    expect(state.owner?.accountId).toBe('mgr');
    await service.removeManager('mgr', 'own');
    expect(state.managers).toEqual([]);
  });

  it('validates account IDs at the boundary', async () => {
    await expect(service.addManager('own', 'x'.repeat(200))).rejects.toMatchObject({ code: 'INVALID' });
    await expect(service.removeManager('own', '')).rejects.toMatchObject({ code: 'INVALID' });
  });
});

describe('RoleService reads', () => {
  it('searches people for the owner with a trimmed, bounded query', async () => {
    expect(await service.searchUsers('own', '  ann ')).toEqual([ref('a1'), ref('a2')]);
    expect(users.search).toHaveBeenCalledWith('ann');
    await expect(service.searchUsers('own', 'a')).rejects.toMatchObject({ code: 'INVALID' });
    await expect(service.searchUsers('own', 'a'.repeat(51))).rejects.toMatchObject({ code: 'INVALID' });
  });

  it('shows names and avatars from Jira, and a placeholder for people Jira no longer shows', async () => {
    state = { ...OWNED, managers: [...OWNED.managers, { accountId: 'gone', addedAt: NOW, addedBy: 'own' }] };
    const view = await service.getRoles();
    expect(view.owner).toEqual({ ...ref('own'), since: NOW });
    expect(view.managers[1]).toEqual({ accountId: 'gone', displayName: null, avatarUrl: null, addedAt: NOW });
    expect(view.log[0]).toEqual({ at: NOW, action: 'add-manager', actor: ref('own'), target: ref('mgr') });
    // One lookup for all distinct people.
    expect(users.getUsers).toHaveBeenCalledTimes(1);
    expect(new Set(users.getUsers.mock.calls[0][0]).size).toBe(users.getUsers.mock.calls[0][0].length);
  });

  it('still shows the roles when the name lookup fails', async () => {
    users.getUsers.mockRejectedValue(new Error('jira down'));
    const view = await service.getRoles();
    expect(view.owner).toMatchObject({ accountId: 'own', displayName: null });
  });
});
