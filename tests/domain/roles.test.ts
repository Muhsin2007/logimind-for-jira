import { describe, expect, it } from 'vitest';
import {
  accessFor,
  addManager,
  claimOwnership,
  EMPTY_ROLES,
  MAX_LOG,
  MAX_MANAGERS,
  normalizeRoles,
  removeManager,
  RoleError,
  roleOf,
  transferOwnership,
  type RoleState,
} from '../../src/domain/roles';

const NOW = '2026-11-09T10:00:00.000Z';
const owned = (over: Partial<RoleState> = {}): RoleState => ({
  owner: { accountId: 'own', since: NOW },
  managers: [{ accountId: 'mgr', addedAt: NOW, addedBy: 'own' }],
  log: [],
  ...over,
});
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return err instanceof RoleError ? err.code : 'OTHER';
  }
  return 'NONE';
};

describe('roles: access', () => {
  it('keeps the Jira-admin rule while no owner is set', () => {
    expect(accessFor(EMPTY_ROLES, 'a', true)).toEqual({ role: 'viewer', ownerAssigned: false, isJiraAdmin: true, canManageData: true, canManageRoles: false, canClaimOwnership: true });
    expect(accessFor(EMPTY_ROLES, 'a', false)).toMatchObject({ canManageData: false, canClaimOwnership: false });
  });

  it('gives owner, manager and viewer their rights once an owner is set', () => {
    expect(accessFor(owned(), 'own', true)).toMatchObject({ role: 'owner', canManageData: true, canManageRoles: true, canClaimOwnership: false });
    expect(accessFor(owned(), 'mgr', false)).toMatchObject({ role: 'manager', canManageData: true, canManageRoles: false, canClaimOwnership: false });
    // A Jira admin who is not owner or manager reads only, but may take ownership.
    expect(accessFor(owned(), 'adm', true)).toMatchObject({ role: 'viewer', canManageData: false, canManageRoles: false, canClaimOwnership: true });
    expect(accessFor(owned(), 'x', false)).toMatchObject({ role: 'viewer', canManageData: false, canClaimOwnership: false });
  });

  it('never grants anything without an account', () => {
    expect(accessFor(owned(), null, true)).toMatchObject({ canManageData: false, canManageRoles: false, canClaimOwnership: false });
    expect(accessFor(EMPTY_ROLES, null, true)).toMatchObject({ canManageData: false, canClaimOwnership: false });
    expect(roleOf(owned(), null)).toBe('viewer');
  });
});

describe('roles: changes', () => {
  it('lets a Jira admin claim a free ownership and logs it', () => {
    const s = claimOwnership(EMPTY_ROLES, 'adm', true, NOW);
    expect(s.owner).toEqual({ accountId: 'adm', since: NOW });
    expect(s.log[0]).toEqual({ at: NOW, actor: 'adm', action: 'claim', target: 'adm' });
  });

  it('lets another Jira admin take ownership over; the old owner keeps no role', () => {
    const s = claimOwnership(owned({ managers: [{ accountId: 'adm', addedAt: NOW, addedBy: 'own' }] }), 'adm', true, NOW);
    expect(s.owner?.accountId).toBe('adm');
    expect(s.managers).toEqual([]);
    expect(s.log[0]).toMatchObject({ action: 'takeover', actor: 'adm', target: 'adm' });
    expect(roleOf(s, 'own')).toBe('viewer');
  });

  it('refuses a claim by a non-admin or by the current owner', () => {
    expect(code(() => claimOwnership(EMPTY_ROLES, 'x', false, NOW))).toBe('FORBIDDEN');
    expect(code(() => claimOwnership(owned(), 'own', true, NOW))).toBe('CONFLICT');
  });

  it('refuses a claim when the owner is no longer the one the caller saw (no silent takeover)', () => {
    expect(code(() => claimOwnership(owned(), 'adm', true, NOW, null))).toBe('CONFLICT');
    expect(code(() => claimOwnership(EMPTY_ROLES, 'adm', true, NOW, 'own'))).toBe('CONFLICT');
    expect(claimOwnership(owned(), 'adm', true, NOW, 'own').owner?.accountId).toBe('adm');
  });

  it('treats an empty account ID as signed out', () => {
    expect(accessFor(EMPTY_ROLES, '', true)).toMatchObject({ canManageData: false, canClaimOwnership: false });
  });

  it('lets only the owner add and remove managers', () => {
    const added = addManager(owned(), 'own', 'new', NOW);
    expect(added.managers.map((m) => m.accountId)).toEqual(['mgr', 'new']);
    expect(added.log[0]).toEqual({ at: NOW, actor: 'own', action: 'add-manager', target: 'new' });
    const removed = removeManager(added, 'own', 'mgr', NOW);
    expect(removed.managers.map((m) => m.accountId)).toEqual(['new']);
    expect(removed.log[0].action).toBe('remove-manager');
    expect(code(() => addManager(owned(), 'mgr', 'new', NOW))).toBe('FORBIDDEN');
    expect(code(() => removeManager(owned(), 'mgr', 'mgr', NOW))).toBe('FORBIDDEN');
    expect(code(() => addManager(EMPTY_ROLES, 'adm', 'new', NOW))).toBe('FORBIDDEN');
  });

  it('rejects duplicates, the owner as manager, unknown managers, bad IDs and too many managers', () => {
    expect(code(() => addManager(owned(), 'own', 'mgr', NOW))).toBe('CONFLICT');
    expect(code(() => addManager(owned(), 'own', 'own', NOW))).toBe('CONFLICT');
    expect(code(() => removeManager(owned(), 'own', 'nobody', NOW))).toBe('CONFLICT');
    expect(code(() => addManager(owned(), 'own', 'bad id!', NOW))).toBe('INVALID');
    const full = owned({ managers: Array.from({ length: MAX_MANAGERS }, (_, i) => ({ accountId: `m${i}`, addedAt: NOW, addedBy: 'own' })) });
    expect(code(() => addManager(full, 'own', 'one-more', NOW))).toBe('LIMIT');
  });

  it('transfers ownership to a manager; the old owner becomes a manager', () => {
    const s = transferOwnership(owned(), 'own', 'mgr', NOW);
    expect(s.owner).toEqual({ accountId: 'mgr', since: NOW });
    expect(s.managers.map((m) => m.accountId)).toEqual(['own']);
    expect(s.log[0]).toMatchObject({ action: 'transfer', actor: 'own', target: 'mgr' });
    expect(code(() => transferOwnership(owned(), 'mgr', 'mgr', NOW))).toBe('FORBIDDEN');
    expect(code(() => transferOwnership(owned(), 'own', 'stranger', NOW))).toBe('CONFLICT');
  });

  it('keeps only the newest log entries, newest first', () => {
    let s = owned();
    for (let i = 0; i < MAX_LOG + 5; i++) s = addManager(removeManager(s, 'own', 'mgr', `t${i}`), 'own', 'mgr', `t${i}`);
    expect(s.log).toHaveLength(MAX_LOG);
    expect(s.log[0]).toMatchObject({ at: `t${MAX_LOG + 4}`, action: 'add-manager' });
  });
});

describe('roles: stored state', () => {
  it('drops malformed parts instead of trusting them', () => {
    expect(normalizeRoles(undefined)).toEqual(EMPTY_ROLES);
    expect(normalizeRoles({ owner: { accountId: 5 }, managers: 'x', log: null })).toEqual(EMPTY_ROLES);
    const s = normalizeRoles({
      owner: { accountId: 'own', since: NOW },
      managers: [{ accountId: 'mgr', addedAt: NOW, addedBy: 'own' }, { accountId: 'bad id!' }, { accountId: 'own', addedAt: NOW, addedBy: 'own' }],
      log: [{ at: NOW, actor: 'own', action: 'add-manager', target: 'mgr' }, { at: NOW, actor: 'own', action: 'hack', target: 'mgr' }],
    });
    // The owner is never also listed as a manager.
    expect(s.managers.map((m) => m.accountId)).toEqual(['mgr']);
    expect(s.log).toHaveLength(1);
  });
});
