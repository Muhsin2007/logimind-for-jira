import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IssueService, riskLabel } from '../../src/services/issue-service';
import { JiraError, type JiraGateway } from '../../src/jira/jira-gateway';
import { RiskBusyError, type IssueLinkRepository } from '../../src/storage/issue-links';
import type { IssueLink, JiraConfig, RiskEvent } from '../../src/domain/types';

const NOW = new Date('2026-11-02T10:00:00Z');
const CONFIG: JiraConfig = {
  projectKey: 'SCRUM', projectName: 'My Software Team', issueTypeId: '10001', issueTypeName: 'Task',
  updatedAt: NOW.toISOString(), updatedBy: 'admin',
};
const RISK: RiskEvent = {
  id: 'LATE_SHIPMENT:SHP-1004', type: 'LATE_SHIPMENT', severity: 'critical', entityType: 'shipment', entityKey: 'SHP-1004',
  title: 'Shipment SHP-1004 is 9 days past planned arrival', evidence: [{ label: 'Days late', value: 9 }],
  ruleVersion: '1.2.0', evaluatedOn: '2026-11-02',
};
const EXISTING: IssueLink = {
  riskId: RISK.id, riskType: RISK.type, severity: RISK.severity, entityType: 'shipment', entityKey: 'SHP-1004',
  riskTitle: RISK.title, issueId: '100', issueKey: 'SCRUM-7', projectKey: 'SCRUM', createdAt: NOW.toISOString(), createdBy: 'u1',
};

function setup(opts: { config?: JiraConfig | null; risks?: RiskEvent[]; existing?: IssueLink | null } = {}) {
  const links = {
    getConfig: vi.fn().mockResolvedValue(opts.config === undefined ? CONFIG : opts.config),
    saveConfig: vi.fn().mockResolvedValue(undefined),
    getLink: vi.fn().mockResolvedValue(opts.existing ?? null),
    listLinks: vi.fn().mockResolvedValue(opts.existing ? [opts.existing] : []),
    saveLink: vi.fn().mockResolvedValue(undefined),
    clearLinks: vi.fn().mockResolvedValue(undefined),
    withRiskLock: vi.fn(<T,>(_id: string, fn: () => Promise<T>) => fn()),
  } satisfies IssueLinkRepository;
  const jira = {
    listCreatableProjects: vi.fn().mockResolvedValue([{ id: '1', key: 'SCRUM', name: 'My Software Team' }]),
    listIssueTypes: vi.fn().mockResolvedValue([{ id: '10001', name: 'Task' }]),
    createIssue: vi.fn().mockResolvedValue({ id: '200', key: 'SCRUM-8' }),
    // The issue was moved since the link was saved: ID 100 is now OPS-3.
    getIssueStatuses: vi.fn().mockResolvedValue(new Map([['100', { issueKey: 'OPS-3', statusName: 'In Progress', category: 'indeterminate' }]])),
    issueExists: vi.fn().mockResolvedValue('exists'),
    addComment: vi.fn().mockResolvedValue(undefined),
  } satisfies JiraGateway;
  const logistics = {
    listRisks: vi.fn().mockResolvedValue({ today: '2026-11-02', risks: opts.risks ?? [RISK] }),
    getShipment: vi.fn().mockResolvedValue(null),
  };
  return { links, jira, logistics, service: new IssueService(logistics, links, jira, () => NOW) };
}

describe('IssueService.createIssueForRisk', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('creates the issue from the risk template and stores the link', async () => {
    const out = await ctx.service.createIssueForRisk(RISK.id, 'u1');
    expect(out).toMatchObject({ ok: true, link: { issueKey: 'SCRUM-8', riskId: RISK.id, entityKey: 'SHP-1004' } });
    expect(ctx.links.withRiskLock).toHaveBeenCalledWith(RISK.id, expect.any(Function));
    const [project, type, content] = ctx.jira.createIssue.mock.calls[0];
    expect([project, type]).toEqual(['SCRUM', '10001']);
    expect(content.summary).toBe('[Critical] Shipment SHP-1004 is 9 days past planned arrival');
    expect(content.labels).toEqual(['logimind', 'logimind-late-shipment', riskLabel(RISK.id)]);
    expect(riskLabel(RISK.id)).toMatch(/^logimind-risk-[0-9a-f]{12}$/);
    expect(ctx.links.saveLink).toHaveBeenCalledWith(expect.objectContaining({ issueKey: 'SCRUM-8', issueId: '200' }));
    expect(out.ok && 'createdBy' in out.link).toBe(false);
  });

  it('retries the link save and reports the created key instead of inviting a duplicate', async () => {
    ctx.links.saveLink.mockRejectedValueOnce(new Error('kvs down'));
    expect(await ctx.service.createIssueForRisk(RISK.id, null)).toMatchObject({ ok: true });
    ctx.links.saveLink.mockReset().mockRejectedValue(new Error('kvs down'));
    const out = await ctx.service.createIssueForRisk(RISK.id, null);
    expect(out).toMatchObject({ ok: false, code: 'LINK_FAILED', message: expect.stringContaining('Created SCRUM-8') });
    expect(ctx.links.saveLink).toHaveBeenCalledTimes(3);
  });

  it('blocks a duplicate of an issue the user cannot see without revealing its key', async () => {
    ctx = setup({ existing: EXISTING });
    ctx.jira.issueExists.mockResolvedValue('hidden');
    const out = await ctx.service.createIssueForRisk(RISK.id, null);
    expect(out).toEqual({ ok: false, code: 'DUPLICATE', message: 'An issue you do not have access to already tracks this risk.' });
    expect(ctx.jira.createIssue).not.toHaveBeenCalled();
  });

  it('refuses a duplicate while the linked issue still exists', async () => {
    ctx = setup({ existing: EXISTING });
    const out = await ctx.service.createIssueForRisk(RISK.id, 'u1');
    expect(out).toMatchObject({ ok: false, code: 'DUPLICATE', link: { issueKey: 'SCRUM-7' } });
    expect(ctx.jira.createIssue).not.toHaveBeenCalled();
  });

  it('re-creates when the linked issue was deleted in Jira', async () => {
    ctx = setup({ existing: EXISTING });
    ctx.jira.issueExists.mockResolvedValue('missing');
    expect(await ctx.service.createIssueForRisk(RISK.id, 'u1')).toMatchObject({ ok: true, link: { issueKey: 'SCRUM-8' } });
  });

  it('requires a configured project and an active risk', async () => {
    expect(await setup({ config: null }).service.createIssueForRisk(RISK.id, null)).toMatchObject({ ok: false, code: 'NOT_CONFIGURED' });
    const noRisk = setup({ risks: [] });
    expect(await noRisk.service.createIssueForRisk(RISK.id, null)).toMatchObject({ ok: false, code: 'RISK_NOT_FOUND' });
    expect(noRisk.jira.createIssue).not.toHaveBeenCalled();
  });

  it('maps Jira permission and validation errors without saving a link', async () => {
    ctx.jira.createIssue.mockRejectedValue(new JiraError('FORBIDDEN', 'You do not have permission to create an issue in SCRUM.'));
    expect(await ctx.service.createIssueForRisk(RISK.id, null)).toEqual({
      ok: false, code: 'FORBIDDEN', message: 'You do not have permission to create an issue in SCRUM.',
    });
    expect(ctx.links.saveLink).not.toHaveBeenCalled();
  });

  it('reports a concurrent creation for the same risk as BUSY', async () => {
    ctx.links.withRiskLock.mockRejectedValue(new RiskBusyError());
    expect(await ctx.service.createIssueForRisk(RISK.id, null)).toMatchObject({ ok: false, code: 'BUSY' });
  });
});

describe('IssueService links and settings', () => {
  it('lists links with live status and survives a status lookup failure', async () => {
    const ctx = setup({ existing: EXISTING });
    const first = (await ctx.service.listLinks()).links[0];
    expect(first).toMatchObject({ issueKey: 'OPS-3', status: { statusName: 'In Progress', category: 'indeterminate' } });
    expect('createdBy' in first).toBe(false);
    expect(ctx.jira.getIssueStatuses).toHaveBeenCalledWith(['100']);
    ctx.jira.getIssueStatuses.mockRejectedValue(new JiraError('RATE_LIMITED', 'slow down'));
    const out = await ctx.service.listLinks();
    expect(out).toMatchObject({ statusError: 'slow down', links: [{ issueKey: 'SCRUM-7', status: null }] });
  });

  it('only saves a project and issue type the user can actually use', async () => {
    const ctx = setup();
    await expect(ctx.service.saveConfig('OTHER', '10001', 'admin')).rejects.toThrow(/cannot create issues/);
    await expect(ctx.service.saveConfig('SCRUM', '999', 'admin')).rejects.toThrow(/not available/);
    expect(await ctx.service.saveConfig('SCRUM', '10001', 'admin')).toMatchObject({ projectName: 'My Software Team', issueTypeName: 'Task' });
    expect(() => ctx.service.listIssueTypes('bad key')).toThrow(/Invalid project key/);
  });

  it('returns issue context only for linked issues', async () => {
    const ctx = setup({ existing: EXISTING });
    expect(await ctx.service.getIssueContext('999', 'SCRUM-1')).toEqual({ issueKey: 'SCRUM-1', link: null, currentRisk: null, shipment: null });
    // Matched by ID even after the issue moved to another project.
    const linked = await ctx.service.getIssueContext('100', 'OPS-3');
    expect(linked).toMatchObject({ link: { riskId: RISK.id, issueKey: 'OPS-3' }, currentRisk: { id: RISK.id } });
    expect(ctx.logistics.getShipment).toHaveBeenCalledWith('SHP-1004');
  });
});
