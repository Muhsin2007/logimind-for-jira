import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DailyCheckService, MAX_AUTO_ISSUES, MAX_RESOLVED_COMMENTS } from '../../src/services/daily-check-service';
import { JiraError } from '../../src/jira/jira-gateway';
import { CheckBusyError, type CheckStore } from '../../src/storage/check-store';
import type { RiskSnapshot } from '../../src/domain/risk-diff';
import type { IssueLink, JiraConfig, RiskEvent, Severity } from '../../src/domain/types';
import type { CreateIssueOutcome } from '../../src/shared/api';

const NOW = new Date('2026-11-09T06:00:00Z');
const CONFIG: JiraConfig = { projectKey: 'SCRUM', projectName: 'Team', issueTypeId: '1', issueTypeName: 'Task', updatedAt: '', updatedBy: null };

const risk = (id: string, severity: Severity = 'critical'): RiskEvent => {
  const [type, entityKey] = id.split(/:(.*)/s) as [RiskEvent['type'], string];
  return { id, type, severity, entityType: type === 'LOW_STOCK' ? 'inventory' : 'shipment', entityKey, title: id, evidence: [], ruleVersion: '1.2.0', evaluatedOn: '2026-11-09' };
};
const link = (riskId: string, issueId: string, over: Partial<IssueLink> = {}): IssueLink => ({
  riskId, riskType: 'LATE_SHIPMENT', severity: 'critical', entityType: 'shipment', entityKey: riskId.split(':')[1], riskTitle: riskId,
  issueId, issueKey: `SCRUM-${issueId}`, projectKey: 'SCRUM', createdAt: '2026-11-01T00:00:00Z', createdBy: 'u1', ...over,
});

function setup(opts: { risks?: RiskEvent[]; snapshot?: RiskSnapshot | null; autoCreate?: boolean; links?: IssueLink[]; config?: JiraConfig | null } = {}) {
  const store = {
    getSnapshot: vi.fn().mockResolvedValue(opts.snapshot === undefined ? { checkedAt: 'x', today: '2026-11-08', entries: [] } : opts.snapshot),
    saveSnapshot: vi.fn().mockResolvedValue(undefined),
    getLastRun: vi.fn().mockResolvedValue(null),
    saveLastRun: vi.fn().mockResolvedValue(undefined),
    getSettings: vi.fn().mockResolvedValue({ autoCreate: opts.autoCreate ?? false, updatedAt: null, updatedBy: null }),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    withCheckLock: vi.fn(<T,>(fn: () => Promise<T>) => fn()),
  } satisfies CheckStore;
  const links = {
    getConfig: vi.fn().mockResolvedValue(opts.config === undefined ? CONFIG : opts.config),
    listLinks: vi.fn().mockResolvedValue(opts.links ?? []),
    saveLink: vi.fn().mockResolvedValue(undefined),
  };
  let n = 100;
  const creator = {
    createIssueForRisk: vi.fn(async (riskId: string): Promise<CreateIssueOutcome> => {
      const { createdBy: _c, ...view } = link(riskId, String(++n));
      return { ok: true, link: { ...view, status: null } };
    }),
  };
  const comments = { addComment: vi.fn().mockResolvedValue(undefined) };
  const risks = { listRisks: vi.fn().mockResolvedValue({ today: '2026-11-09', risks: opts.risks ?? [] }) };
  const service = new DailyCheckService(risks, store, links, creator, comments, () => NOW);
  return { store, links, creator, comments, risks, service };
}

describe('DailyCheckService.run', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('records new, resolved and still-critical risks and saves the new snapshot last', async () => {
    const ctx = setup({
      snapshot: { checkedAt: 'x', today: '2026-11-08', entries: [['LATE_SHIPMENT:SHP-1', 'critical'], ['ETA_SLIP:SHP-2', 'low']] },
      risks: [risk('LATE_SHIPMENT:SHP-1'), risk('MISSING_ETA:SHP-3', 'high')],
    });
    const run = await ctx.service.run('manual');
    expect(run).toMatchObject({
      checkedAt: NOW.toISOString(), today: '2026-11-09', trigger: 'manual', baseline: false,
      counts: { open: 2, newRisks: 1, resolved: 1, stillOpen: 1, stillCritical: 1 },
      autoCreate: { enabled: false, created: [], notCreated: 0, error: null },
    });
    expect(run.newRisks.map((r) => r.id)).toEqual(['MISSING_ETA:SHP-3']);
    expect(run.resolved.map((r) => r.id)).toEqual(['ETA_SLIP:SHP-2']);
    expect(ctx.store.saveSnapshot).toHaveBeenCalledWith({ checkedAt: NOW.toISOString(), today: '2026-11-09', entries: [['LATE_SHIPMENT:SHP-1', 'critical'], ['MISSING_ETA:SHP-3', 'high']] });
    expect(ctx.store.saveLastRun).toHaveBeenCalledWith(run);
    expect(ctx.store.saveLastRun.mock.invocationCallOrder[0]).toBeLessThan(ctx.store.saveSnapshot.mock.invocationCallOrder[0]);
    expect(ctx.creator.createIssueForRisk).not.toHaveBeenCalled();
  });

  it('runs under the check lock and reports a concurrent run as busy', async () => {
    const ctx = setup();
    ctx.store.withCheckLock.mockRejectedValue(new CheckBusyError());
    await expect(ctx.service.run('schedule')).rejects.toBeInstanceOf(CheckBusyError);
    expect(ctx.risks.listRisks).not.toHaveBeenCalled();
  });

  it('auto-creates issues only for newly critical risks, at most 5 per run', async () => {
    const fresh = Array.from({ length: 7 }, (_, i) => risk(`LATE_SHIPMENT:SHP-${i + 10}`));
    const ctx = setup({ autoCreate: true, risks: [...fresh, risk('ETA_SLIP:SHP-50', 'high')] });
    const run = await ctx.service.run('schedule');
    expect(MAX_AUTO_ISSUES).toBe(5);
    expect(ctx.creator.createIssueForRisk).toHaveBeenCalledTimes(5);
    expect(ctx.creator.createIssueForRisk).toHaveBeenCalledWith('LATE_SHIPMENT:SHP-10', null, expect.any(Array));
    expect(run.autoCreate.created).toHaveLength(5);
    expect(run.autoCreate.created[0]).toEqual({ riskId: 'LATE_SHIPMENT:SHP-10', issueKey: 'SCRUM-101' });
    expect(run.autoCreate.notCreated).toBe(2);
  });

  it('creates nothing on the baseline run, even with auto-create on', async () => {
    const ctx = setup({ autoCreate: true, snapshot: null, risks: [risk('LATE_SHIPMENT:SHP-1')] });
    const run = await ctx.service.run('manual');
    expect(run.baseline).toBe(true);
    expect(ctx.creator.createIssueForRisk).not.toHaveBeenCalled();
  });

  it('skips duplicates and stops at the first permission error with an app-specific message', async () => {
    const ctx = setup({ autoCreate: true, risks: [risk('LATE_SHIPMENT:SHP-1'), risk('LATE_SHIPMENT:SHP-2'), risk('LATE_SHIPMENT:SHP-3')] });
    ctx.creator.createIssueForRisk
      .mockResolvedValueOnce({ ok: false, code: 'DUPLICATE', message: 'exists' })
      .mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN', message: 'You do not have permission' });
    const run = await ctx.service.run('manual');
    expect(ctx.creator.createIssueForRisk).toHaveBeenCalledTimes(2);
    expect(run.autoCreate.created).toEqual([]);
    expect(run.autoCreate.error?.code).toBe('FORBIDDEN');
    expect(run.autoCreate.error?.message).toMatch(/LogiMind app cannot create issues in SCRUM/);
    expect(run.autoCreate.notCreated).toBe(2);
    expect(ctx.store.saveSnapshot).toHaveBeenCalled();
  });

  it('reports a missing Jira project without calling Jira', async () => {
    const ctx = setup({ autoCreate: true, config: null, risks: [risk('LATE_SHIPMENT:SHP-1')] });
    const run = await ctx.service.run('manual');
    expect(ctx.creator.createIssueForRisk).not.toHaveBeenCalled();
    expect(run.autoCreate.error).toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(run.autoCreate.notCreated).toBe(1);
  });

  it('comments once on the issue of a risk that is gone from the data, and never transitions it', async () => {
    const gone = link('LATE_SHIPMENT:SHP-1', '11');
    const noted = link('LATE_SHIPMENT:SHP-2', '12', { resolvedNotedAt: '2026-11-08T06:00:00Z' });
    const active = link('LATE_SHIPMENT:SHP-3', '13');
    const ctx = setup({ links: [gone, noted, active], risks: [risk('LATE_SHIPMENT:SHP-3')] });
    const run = await ctx.service.run('schedule');
    expect(ctx.comments.addComment).toHaveBeenCalledTimes(1);
    const [issueId, body] = ctx.comments.addComment.mock.calls[0];
    expect(issueId).toBe('11');
    expect(JSON.stringify(body)).toContain('resolved in data');
    expect(ctx.links.saveLink).toHaveBeenCalledWith({ ...gone, resolvedNotedAt: NOW.toISOString() });
    expect(run.comments).toEqual({ added: [{ riskId: gone.riskId, issueKey: 'SCRUM-11' }], error: null });
  });

  it('marks a deleted issue as noted without failing, and stops commenting on a permission error', async () => {
    const links = [link('LATE_SHIPMENT:SHP-1', '11'), link('LATE_SHIPMENT:SHP-2', '12'), link('LATE_SHIPMENT:SHP-3', '13')];
    const ctx = setup({ links });
    ctx.comments.addComment
      .mockRejectedValueOnce(new JiraError('NOT_FOUND', 'gone'))
      .mockRejectedValueOnce(new JiraError('FORBIDDEN', 'You do not have permission to add a comment.'));
    const run = await ctx.service.run('manual');
    expect(ctx.comments.addComment).toHaveBeenCalledTimes(2);
    expect(ctx.links.saveLink).toHaveBeenCalledTimes(1);
    expect(ctx.links.saveLink.mock.calls[0][0].riskId).toBe('LATE_SHIPMENT:SHP-1');
    expect(run.comments.added).toEqual([]);
    expect(run.comments.error).toMatch(/cannot add comments/);
  });

  it('caps comments per run', async () => {
    const links = Array.from({ length: MAX_RESOLVED_COMMENTS + 3 }, (_, i) => link(`LATE_SHIPMENT:SHP-${i}`, String(i + 1)));
    const ctx = setup({ links });
    await ctx.service.run('manual');
    expect(ctx.comments.addComment).toHaveBeenCalledTimes(MAX_RESOLVED_COMMENTS);
  });
});

describe('DailyCheckService settings and briefing', () => {
  it('saves the auto-create switch with who changed it', async () => {
    const ctx = setup();
    const saved = await ctx.service.saveSettings(true, 'admin-1');
    expect(saved).toEqual({ autoCreate: true, updatedAt: NOW.toISOString(), updatedBy: 'admin-1' });
    expect(ctx.store.saveSettings).toHaveBeenCalledWith(saved);
  });

  it('returns the last run and whether auto-create is on, without account IDs', async () => {
    const ctx = setup({ autoCreate: true });
    expect(await ctx.service.getBriefing()).toEqual({ lastRun: null, autoCreate: true });
  });
});
