import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DailyCheckService, MANUAL_LIMITS, MAX_AUTO_ISSUES, MAX_RESOLVED_COMMENTS } from '../../src/services/daily-check-service';
import { JiraError } from '../../src/jira/jira-gateway';
import { CheckBusyError, type CheckStore } from '../../src/storage/check-store';
import type { RiskSnapshot } from '../../src/domain/risk-diff';
import type { IssueLink, JiraConfig, RiskEvent, Severity } from '../../src/domain/types';
import type { CheckRun, CreateIssueOutcome } from '../../src/shared/api';

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

function setup(opts: { risks?: RiskEvent[]; snapshot?: RiskSnapshot | null; autoCreate?: boolean; links?: IssueLink[]; config?: JiraConfig | null; lastRun?: CheckRun | null; hasData?: boolean } = {}) {
  const store = {
    getSnapshot: vi.fn().mockResolvedValue(opts.snapshot === undefined ? { checkedAt: 'x', today: '2026-11-08', entries: [] } : opts.snapshot),
    saveSnapshot: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    getLastRun: vi.fn().mockResolvedValue(opts.lastRun ?? null),
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
  const risks = { listRisks: vi.fn().mockResolvedValue({ today: '2026-11-09', risks: opts.risks ?? [], hasData: opts.hasData ?? true }) };
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
    // The marker is written before the comment, so a run killed in between never comments twice.
    expect(ctx.links.saveLink.mock.invocationCallOrder[0]).toBeLessThan(ctx.comments.addComment.mock.invocationCallOrder[0]);
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
    // SHP-1: marked and kept (deleted issue). SHP-2: marked, then rolled back after the refusal.
    expect(ctx.links.saveLink.mock.calls.map((c) => [c[0].riskId, c[0].resolvedNotedAt ?? null])).toEqual([
      ['LATE_SHIPMENT:SHP-1', NOW.toISOString()],
      ['LATE_SHIPMENT:SHP-2', NOW.toISOString()],
      ['LATE_SHIPMENT:SHP-2', null],
    ]);
    expect(run.comments.added).toEqual([]);
    expect(run.comments.error).toMatch(/cannot add comments/);
  });

  it('caps comments per run', async () => {
    const links = Array.from({ length: MAX_RESOLVED_COMMENTS + 3 }, (_, i) => link(`LATE_SHIPMENT:SHP-${i}`, String(i + 1)));
    const ctx = setup({ links });
    await ctx.service.run('schedule');
    expect(ctx.comments.addComment).toHaveBeenCalledTimes(MAX_RESOLVED_COMMENTS);
    const manual = setup({ links });
    await manual.service.run('manual');
    expect(manual.comments.addComment).toHaveBeenCalledTimes(MANUAL_LIMITS.comments);
  });
});

describe('DailyCheckService.run review cases', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('compares with the snapshot from before today, so a second check the same day keeps the changes', async () => {
    const ctx = setup({ risks: [risk('LATE_SHIPMENT:SHP-1')] });
    await ctx.service.run('manual');
    expect(ctx.store.getSnapshot).toHaveBeenCalledWith('2026-11-09');
  });

  it('retries newly critical risks a previous run could not file, if still critical', async () => {
    const lastRun = { autoCreate: { enabled: true, created: [], notCreated: 2, error: null, pending: ['LATE_SHIPMENT:SHP-7', 'LATE_SHIPMENT:SHP-8'] } } as unknown as CheckRun;
    const ctx = setup({
      autoCreate: true, lastRun,
      snapshot: { checkedAt: 'x', today: '2026-11-08', entries: [['LATE_SHIPMENT:SHP-7', 'critical'], ['LATE_SHIPMENT:SHP-8', 'critical']] },
      risks: [risk('LATE_SHIPMENT:SHP-7'), risk('LATE_SHIPMENT:SHP-8', 'high')],
    });
    const run = await ctx.service.run('schedule');
    expect(ctx.creator.createIssueForRisk.mock.calls.map((c) => c[0])).toEqual(['LATE_SHIPMENT:SHP-7']);
    expect(run.autoCreate.pending).toEqual([]);
  });

  it('keeps risks left over by an error as pending for the next run', async () => {
    const fresh = Array.from({ length: 4 }, (_, i) => risk(`LATE_SHIPMENT:SHP-${i + 10}`));
    const ctx = setup({ autoCreate: true, risks: fresh });
    ctx.creator.createIssueForRisk
      .mockResolvedValueOnce({ ok: false, code: 'DUPLICATE', message: 'exists' })
      .mockResolvedValueOnce({ ok: false, code: 'RATE_LIMITED', message: 'slow down' });
    const run = await ctx.service.run('schedule');
    expect(run.autoCreate.pending).toEqual(['LATE_SHIPMENT:SHP-11', 'LATE_SHIPMENT:SHP-12', 'LATE_SHIPMENT:SHP-13']);
    expect(run.autoCreate.notCreated).toBe(3);
  });

  it('uses smaller limits for "Run check now", which must finish within a resolver call', async () => {
    const fresh = Array.from({ length: 7 }, (_, i) => risk(`LATE_SHIPMENT:SHP-${i + 10}`));
    const ctx = setup({ autoCreate: true, risks: fresh });
    const run = await ctx.service.run('manual');
    expect(ctx.creator.createIssueForRisk).toHaveBeenCalledTimes(MANUAL_LIMITS.issues);
    expect(run.autoCreate.pending).toHaveLength(7 - MANUAL_LIMITS.issues);
  });

  it('does nothing and keeps no snapshot while no data is imported', async () => {
    const ctx = setup({ autoCreate: true, hasData: false, links: [link('LATE_SHIPMENT:SHP-1', '11')] });
    const run = await ctx.service.run('schedule');
    expect(run).toMatchObject({ noData: true, baseline: true, counts: { open: 0 } });
    expect(ctx.comments.addComment).not.toHaveBeenCalled();
    expect(ctx.creator.createIssueForRisk).not.toHaveBeenCalled();
    expect(ctx.store.saveSnapshot).not.toHaveBeenCalled();
    expect(ctx.store.saveLastRun).toHaveBeenCalledWith(run);
  });

  it('does not comment when the marker cannot be saved first, and shows no raw error text', async () => {
    const ctx = setup({ links: [link('LATE_SHIPMENT:SHP-1', '11')] });
    ctx.links.saveLink.mockRejectedValueOnce(new Error('kvs internal 123'));
    const run = await ctx.service.run('schedule');
    expect(ctx.comments.addComment).not.toHaveBeenCalled();
    expect(run.comments.error).toBeTruthy();
    expect(run.comments.error).not.toContain('kvs internal 123');
  });

  it('clears the "resolved" marker when the risk is open again, so a later resolution is noted again', async () => {
    const back = link('LATE_SHIPMENT:SHP-1', '11', { resolvedNotedAt: '2026-11-01T00:00:00Z' });
    const ctx = setup({ links: [back], risks: [risk('LATE_SHIPMENT:SHP-1')] });
    await ctx.service.run('schedule');
    const { resolvedNotedAt: _r, ...open } = back;
    expect(ctx.links.saveLink).toHaveBeenCalledWith(open);
    expect(ctx.comments.addComment).not.toHaveBeenCalled();
  });

  it('clears the check state together with the data', async () => {
    const ctx = setup();
    await ctx.service.clear();
    expect(ctx.store.withCheckLock).toHaveBeenCalled();
    expect(ctx.store.clear).toHaveBeenCalled();
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
