/**
 * LogiMind roles: one owner, managers chosen by the owner, everyone else a viewer.
 * Pure rules; storage and Jira calls live in RoleService and its adapters. Every change
 * takes the acting account and re-checks its rights on the state it is applied to, so a
 * change applied under the store's lock never acts on a stale decision.
 */
export type Role = 'owner' | 'manager' | 'viewer';
export type RoleAction = 'claim' | 'takeover' | 'transfer' | 'add-manager' | 'remove-manager';

export interface RoleLogEntry {
  at: string;
  actor: string;
  action: RoleAction;
  target: string;
}

export interface RoleState {
  owner: { accountId: string; since: string } | null;
  managers: { accountId: string; addedAt: string; addedBy: string }[];
  /** Newest first, at most MAX_LOG entries. */
  log: RoleLogEntry[];
}

export interface Access {
  role: Role;
  ownerAssigned: boolean;
  isJiraAdmin: boolean;
  /** Import, demo data, delete, Jira settings, automation, "Run check now". */
  canManageData: boolean;
  /** Add or remove managers, transfer ownership. */
  canManageRoles: boolean;
  /** Claim a free ownership, or take it over: Jira site admins who are not the owner. */
  canClaimOwnership: boolean;
}

export type RoleErrorCode = 'FORBIDDEN' | 'INVALID' | 'CONFLICT' | 'LIMIT' | 'BUSY';

export class RoleError extends Error {
  constructor(
    readonly code: RoleErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const EMPTY_ROLES: RoleState = { owner: null, managers: [], log: [] };
export const MAX_MANAGERS = 20;
export const MAX_LOG = 50;
/** Atlassian account IDs: letters, digits, colon, hyphen, underscore. */
export const ACCOUNT_ID = /^[A-Za-z0-9:_-]{1,128}$/;
const ACTIONS: RoleAction[] = ['claim', 'takeover', 'transfer', 'add-manager', 'remove-manager'];

export function requireAccountId(value: unknown): string {
  if (typeof value !== 'string' || !ACCOUNT_ID.test(value)) throw new RoleError('INVALID', 'Invalid account ID.');
  return value;
}

export function roleOf(state: RoleState, accountId: string | null): Role {
  if (!accountId) return 'viewer';
  if (state.owner?.accountId === accountId) return 'owner';
  return state.managers.some((m) => m.accountId === accountId) ? 'manager' : 'viewer';
}

/** Until someone owns LogiMind, Jira site admins manage the data, as before roles existed. */
export function accessFor(state: RoleState, accountId: string | null, isJiraAdmin: boolean): Access {
  const role = roleOf(state, accountId);
  const ownerAssigned = state.owner !== null;
  const signedIn = !!accountId;
  return {
    role,
    ownerAssigned,
    isJiraAdmin,
    canManageData: signedIn && (ownerAssigned ? role !== 'viewer' : isJiraAdmin),
    canManageRoles: role === 'owner',
    canClaimOwnership: signedIn && isJiraAdmin && role !== 'owner',
  };
}

function logged(state: RoleState, entry: RoleLogEntry): RoleLogEntry[] {
  return [entry, ...state.log].slice(0, MAX_LOG);
}

function requireOwner(state: RoleState, actor: string | null): string {
  if (!actor || state.owner?.accountId !== actor) throw new RoleError('FORBIDDEN', 'Only the LogiMind owner can change roles.');
  return actor;
}

/**
 * A Jira site admin claims a free ownership, or takes it over. The previous owner keeps no role.
 * `expectedOwner` is the owner the caller saw (null: none); if it changed meanwhile, the claim is
 * refused, so two simultaneous "Become owner" clicks never turn into an unconfirmed takeover.
 */
export function claimOwnership(state: RoleState, actor: string, isJiraAdmin: boolean, now: string, expectedOwner?: string | null): RoleState {
  if (!isJiraAdmin) throw new RoleError('FORBIDDEN', 'Only Jira administrators can take ownership of LogiMind.');
  if (state.owner?.accountId === actor) throw new RoleError('CONFLICT', 'You already own LogiMind.');
  if (expectedOwner !== undefined && (state.owner?.accountId ?? null) !== expectedOwner) throw new RoleError('CONFLICT', 'The owner has changed. Look again before taking over.');
  return {
    owner: { accountId: actor, since: now },
    managers: state.managers.filter((m) => m.accountId !== actor),
    log: logged(state, { at: now, actor, action: state.owner ? 'takeover' : 'claim', target: actor }),
  };
}

export function addManager(state: RoleState, actor: string | null, target: string, now: string): RoleState {
  const owner = requireOwner(state, actor);
  requireAccountId(target);
  if (target === owner) throw new RoleError('CONFLICT', 'The owner already has every right.');
  if (state.managers.some((m) => m.accountId === target)) throw new RoleError('CONFLICT', 'This person is already a manager.');
  if (state.managers.length >= MAX_MANAGERS) throw new RoleError('LIMIT', `LogiMind allows at most ${MAX_MANAGERS} managers.`);
  return {
    ...state,
    managers: [...state.managers, { accountId: target, addedAt: now, addedBy: owner }],
    log: logged(state, { at: now, actor: owner, action: 'add-manager', target }),
  };
}

export function removeManager(state: RoleState, actor: string | null, target: string, now: string): RoleState {
  const owner = requireOwner(state, actor);
  requireAccountId(target);
  if (!state.managers.some((m) => m.accountId === target)) throw new RoleError('CONFLICT', 'This person is not a manager.');
  return {
    ...state,
    managers: state.managers.filter((m) => m.accountId !== target),
    log: logged(state, { at: now, actor: owner, action: 'remove-manager', target }),
  };
}

/** Hands ownership to a current manager; the previous owner stays on as a manager. */
export function transferOwnership(state: RoleState, actor: string | null, target: string, now: string): RoleState {
  const owner = requireOwner(state, actor);
  requireAccountId(target);
  if (!state.managers.some((m) => m.accountId === target)) throw new RoleError('CONFLICT', 'Ownership can only go to a current manager.');
  return {
    owner: { accountId: target, since: now },
    managers: [...state.managers.filter((m) => m.accountId !== target), { accountId: owner, addedAt: now, addedBy: target }],
    log: logged(state, { at: now, actor: owner, action: 'transfer', target }),
  };
}

const isId = (v: unknown): v is string => typeof v === 'string' && ACCOUNT_ID.test(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.length <= 64;

/** Stored state is checked, not trusted: malformed parts are dropped. */
export function normalizeRoles(raw: unknown): RoleState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const o = r.owner as Record<string, unknown> | null | undefined;
  const owner = o && isId(o.accountId) && isText(o.since) ? { accountId: o.accountId, since: o.since } : null;
  const seen = new Set<string>(owner ? [owner.accountId] : []);
  const managers = (Array.isArray(r.managers) ? r.managers : [])
    .map((m) => m as Record<string, unknown>)
    .filter((m) => m && isId(m.accountId) && isText(m.addedAt) && isId(m.addedBy) && !seen.has(m.accountId) && seen.add(m.accountId))
    .slice(0, MAX_MANAGERS)
    .map((m) => ({ accountId: m.accountId as string, addedAt: m.addedAt as string, addedBy: m.addedBy as string }));
  const log = (Array.isArray(r.log) ? r.log : [])
    .map((e) => e as Record<string, unknown>)
    .filter((e) => e && isText(e.at) && isId(e.actor) && isId(e.target) && ACTIONS.includes(e.action as RoleAction))
    .slice(0, MAX_LOG)
    .map((e) => ({ at: e.at as string, actor: e.actor as string, action: e.action as RoleAction, target: e.target as string }));
  return { owner, managers, log };
}
