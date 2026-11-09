import { beforeEach, describe, expect, it, vi } from 'vitest';

// The resolver boundary is where the role checks live: capture every handler index.ts defines.
const defs = vi.hoisted(() => new Map<string, (req: { payload?: unknown; context?: unknown }) => unknown>());
vi.mock('@forge/resolver', () => ({
  default: class {
    define(name: string, fn: (req: { payload?: unknown; context?: unknown }) => unknown) {
      defs.set(name, fn);
    }
    getDefinitions() {
      return {};
    }
  },
}));
vi.mock('@forge/kvs', () => ({ kvs: {} }));
vi.mock('@forge/api', () => ({ default: {}, route: () => '' }));
vi.mock('@forge/llm', () => ({ chat: vi.fn() }));
// London school: every collaborator is a mock; only the wiring in index.ts is real.
vi.mock('../src/services/role-service');
vi.mock('../src/services/logistics-service');
vi.mock('../src/services/issue-service');
vi.mock('../src/services/daily-check-service');
vi.mock('../src/ai/column-mapper');
vi.mock('../src/ai/follow-up-drafter');
vi.mock('../src/copilot/llm-copilot');
vi.mock('../src/jira/forge-jira-gateway');
vi.mock('../src/jira/forge-user-directory');
vi.mock('../src/llm/forge-llm');
vi.mock('../src/storage/kvs-role-store');
vi.mock('../src/storage/kvs-check-store');
vi.mock('../src/storage/kvs-issue-links');
vi.mock('../src/storage/kvs-repository');

import { ForbiddenError } from '../src/auth/access';
import { RoleError } from '../src/domain/roles';
import { JiraError } from '../src/jira/jira-gateway';
import { ColumnMapper } from '../src/ai/column-mapper';
import { DailyCheckService } from '../src/services/daily-check-service';
import { IssueService } from '../src/services/issue-service';
import { LogisticsService } from '../src/services/logistics-service';
import { RoleService } from '../src/services/role-service';
import '../src/index';

const context = { accountId: 'acc' };
const role = vi.mocked(RoleService.prototype);
const call = (name: string, payload: unknown = {}) => {
  const fn = defs.get(name);
  if (!fn) throw new Error(`no resolver ${name}`);
  return Promise.resolve(fn({ payload, context }));
};

/** Every resolver that changes site-wide data or settings, with a valid payload. */
const DATA_WRITES: [string, unknown][] = [
  ['importCsv', { filename: 'a.csv', content: 'x' }],
  ['proposeColumnMapping', { content: 'x' }],
  ['importCsvWithMapping', { filename: 'a.csv', content: 'x', kind: 'shipments', mapping: [] }],
  ['loadDemoData', {}],
  ['clearData', {}],
  ['listJiraProjects', {}],
  ['listJiraIssueTypes', { projectKey: 'K' }],
  ['saveJiraConfig', { projectKey: 'K', issueTypeId: '1' }],
  ['runDailyCheck', {}],
  ['getLoopSettings', {}],
  ['saveLoopSettings', { autoCreate: true }],
];
const ROLE_CHANGES = ['claimOwnership', 'addManager', 'removeManager', 'transferOwnership', 'searchUsers'];
/** Open to everyone who can open LogiMind; issue creation follows Jira's own permissions (asUser). */
const OPEN = [
  'getHealth', 'getAccess', 'getRoles', 'getDashboard', 'listShipments', 'getShipment', 'listInventory', 'listRisks',
  'listImports', 'listIssueLinks', 'askCopilot', 'createIssueForRisk', 'getIssueContext', 'getDailyBriefing', 'draftFollowUp',
];

const serviceMocks = () =>
  [LogisticsService, IssueService, DailyCheckService, ColumnMapper].flatMap((cls) =>
    Object.getOwnPropertyNames(cls.prototype)
      .filter((k) => k !== 'constructor')
      .map((k) => (cls.prototype as unknown as Record<string, ReturnType<typeof vi.fn>>)[k])
      .filter((f) => typeof f === 'function' && 'mock' in f),
  );

beforeEach(() => vi.clearAllMocks());

describe('resolver boundary', () => {
  it('classifies every resolver, so a new one cannot skip the role decision unnoticed', () => {
    expect([...defs.keys()].sort()).toEqual([...DATA_WRITES.map(([n]) => n), ...ROLE_CHANGES, ...OPEN].sort());
  });

  it('finds the service mocks it checks', () => {
    expect(serviceMocks().length).toBeGreaterThan(10);
  });

  it.each(DATA_WRITES)('%s checks the caller before doing anything', async (name, payload) => {
    role.requireDataManager.mockRejectedValue(new ForbiddenError());
    await expect(call(name, payload)).rejects.toBeInstanceOf(ForbiddenError);
    expect(role.requireDataManager).toHaveBeenCalledWith('acc');
    for (const fn of serviceMocks()) expect(fn).not.toHaveBeenCalled();
  });

  it('maps role refusals and unexpected failures to an outcome, never a raw error', async () => {
    role.addManager.mockRejectedValueOnce(new ForbiddenError('no'));
    expect(await call('addManager', { accountId: 'x' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    role.addManager.mockRejectedValueOnce(new RoleError('LIMIT', 'full'));
    expect(await call('addManager', { accountId: 'x' })).toMatchObject({ ok: false, code: 'LIMIT' });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    role.addManager.mockRejectedValueOnce(new JiraError('FORBIDDEN', 'Jira says no'));
    expect(await call('addManager', { accountId: 'x' })).toMatchObject({ ok: false, code: 'UNKNOWN' });
    role.addManager.mockResolvedValueOnce(undefined);
    expect(await call('addManager', { accountId: 'x' })).toEqual({ ok: true });
    expect(role.addManager).toHaveBeenLastCalledWith('acc', 'x');
  });

  it('passes the owner the caller saw to the claim, so two claims do not silently become a takeover', async () => {
    role.claimOwnership.mockResolvedValue(undefined);
    await call('claimOwnership', { expectOwner: null });
    expect(role.claimOwnership).toHaveBeenLastCalledWith('acc', null);
    await call('claimOwnership', { expectOwner: 'own' });
    expect(role.claimOwnership).toHaveBeenLastCalledWith('acc', 'own');
  });

  it('maps search failures without leaking the error', async () => {
    role.searchUsers.mockRejectedValueOnce(new ForbiddenError('no'));
    expect(await call('searchUsers', { query: 'ann' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    role.searchUsers.mockRejectedValueOnce(new Error('secret detail'));
    const out = await call('searchUsers', { query: 'ann' });
    expect(out).toMatchObject({ ok: false, code: 'UNKNOWN' });
    expect(JSON.stringify(out)).not.toContain('secret detail');
  });
});
