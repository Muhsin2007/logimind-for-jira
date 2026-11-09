import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestJira = vi.hoisted(() => vi.fn());
const appRequestJira = vi.hoisted(() => vi.fn());
vi.mock('@forge/api', () => ({
  default: { asUser: () => ({ requestJira }), asApp: () => ({ requestJira: appRequestJira }) },
  route: (s: TemplateStringsArray, ...v: unknown[]) => String.raw({ raw: s }, ...v),
}));

import { canManageData, ForbiddenError, requireDataManager } from '../../src/auth/access';
import { ForgeJiraGateway } from '../../src/jira/forge-jira-gateway';
import { JiraError } from '../../src/jira/jira-gateway';

const res = (status: number, body: unknown = {}, jsonThrows = false) => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn(async () => {
    if (jsonThrows) throw new Error('not json');
    return body;
  }),
});

const content = { summary: 's', description: { version: 1 as const, type: 'doc' as const, content: [] }, labels: ['logimind'] };

beforeEach(() => vi.resetAllMocks());

describe('ForgeJiraGateway error mapping', () => {
  it.each([
    [401, 'AUTH'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [429, 'RATE_LIMITED'],
    [500, 'UNKNOWN'],
  ])('HTTP %i → %s', async (status, code) => {
    requestJira.mockResolvedValue(res(status));
    const err = await new ForgeJiraGateway().createIssue('SCRUM', '1', content).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JiraError);
    expect((err as JiraError).code).toBe(code);
  });

  it('includes Jira validation details for 400, and survives a non-JSON body', async () => {
    requestJira.mockResolvedValue(res(400, { errorMessages: ['Bad'], errors: { summary: 'required' } }));
    await expect(new ForgeJiraGateway().createIssue('SCRUM', '1', content)).rejects.toThrow('create an issue in SCRUM: Bad; summary: required');
    requestJira.mockResolvedValue(res(400, {}, true));
    await expect(new ForgeJiraGateway().createIssue('SCRUM', '1', content)).rejects.toThrow('create an issue in SCRUM.');
  });

  it('sends the issue fields as the user', async () => {
    requestJira.mockResolvedValue(res(201, { id: '10', key: 'SCRUM-9' }));
    expect(await new ForgeJiraGateway().createIssue('SCRUM', '1', content)).toEqual({ id: '10', key: 'SCRUM-9' });
    const body = JSON.parse(requestJira.mock.calls[0][1].body);
    expect(body.fields).toMatchObject({ project: { key: 'SCRUM' }, issuetype: { id: '1' }, labels: ['logimind'] });
  });
});

describe('ForgeJiraGateway lookups', () => {
  it('only puts numeric issue IDs into JQL, in chunks of 50', async () => {
    requestJira.mockResolvedValue(res(200, { issues: [] }));
    const ids = [...Array.from({ length: 60 }, (_, i) => String(i + 1)), 'abc', '1) OR project = X', '1234567890123456789'];
    await new ForgeJiraGateway().getIssueStatuses(ids);
    const jqls = requestJira.mock.calls.map((c) => JSON.parse(c[1].body).jql as string);
    expect(jqls).toHaveLength(2);
    expect(jqls.join(' ')).not.toMatch(/abc|OR|1234567890123456789/);
    requestJira.mockClear();
    await new ForgeJiraGateway().getIssueStatuses(['nope']);
    expect(requestJira).not.toHaveBeenCalled();
  });

  it('maps status categories defensively', async () => {
    requestJira.mockResolvedValue(res(200, { issues: [{ id: '1', key: 'A-1', fields: { status: { name: 'Готово', statusCategory: { key: 'done' } } } }, { id: '2', key: 'A-2', fields: {} }] }));
    const out = await new ForgeJiraGateway().getIssueStatuses(['1', '2']);
    expect(out.get('1')).toEqual({ issueKey: 'A-1', statusName: 'Готово', category: 'done' });
    expect(out.get('2')).toEqual({ issueKey: 'A-2', statusName: 'Unknown', category: 'unknown' });
  });

  it.each([
    [200, 'exists'],
    [404, 'missing'],
    [403, 'hidden'],
    [401, 'hidden'],
  ])('issueExists: HTTP %i → %s', async (status, state) => {
    requestJira.mockResolvedValue(res(status));
    expect(await new ForgeJiraGateway().issueExists('10')).toBe(state);
  });

  it('lists only standard-level issue types', async () => {
    requestJira.mockResolvedValue(res(200, { issueTypes: [
      { id: '1', name: 'Задача', hierarchyLevel: 0 },
      { id: '2', name: 'Эпик', hierarchyLevel: 1 },
      { id: '3', name: 'Подзадача', subtask: true, hierarchyLevel: -1 },
    ] }));
    expect(await new ForgeJiraGateway().listIssueTypes('SCRUM')).toEqual([{ id: '1', name: 'Задача' }]);
  });
});

describe('ForgeJiraGateway as the app', () => {
  it('adds an ADF comment as the app, never as the user', async () => {
    appRequestJira.mockResolvedValue(res(201));
    const body = { version: 1 as const, type: 'doc' as const, content: [] };
    await new ForgeJiraGateway('app').addComment('100', body);
    expect(requestJira).not.toHaveBeenCalled();
    const [path, init] = appRequestJira.mock.calls[0];
    expect(path).toBe('/rest/api/3/issue/100/comment');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ body });
  });

  it('rejects a non-numeric issue ID and maps a 403 to FORBIDDEN', async () => {
    const gw = new ForgeJiraGateway('app');
    await expect(gw.addComment('../x', { version: 1, type: 'doc', content: [] })).rejects.toMatchObject({ code: 'VALIDATION' });
    appRequestJira.mockResolvedValue(res(403));
    await expect(gw.addComment('100', { version: 1, type: 'doc', content: [] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('creates issues as the app when constructed for the app', async () => {
    appRequestJira.mockResolvedValue(res(201, { id: '7', key: 'SCRUM-7' }));
    await new ForgeJiraGateway('app').createIssue('SCRUM', '1', content);
    expect(appRequestJira).toHaveBeenCalledTimes(1);
    expect(requestJira).not.toHaveBeenCalled();
  });
});

describe('access (Jira ADMINISTER check)', () => {
  it('grants only an explicit havePermission: true', async () => {
    requestJira.mockResolvedValue(res(200, { permissions: { ADMINISTER: { havePermission: true } } }));
    expect(await canManageData()).toBe(true);
    for (const body of [{ permissions: { ADMINISTER: { havePermission: false } } }, {}, { permissions: { ADMINISTER: { havePermission: 'yes' } } }]) {
      requestJira.mockResolvedValue(res(200, body));
      expect(await canManageData()).toBe(false);
    }
  });

  it('denies on a failed permission check and blocks data changes', async () => {
    const failed = res(500);
    requestJira.mockResolvedValue(failed);
    expect(await canManageData()).toBe(false);
    expect(failed.json).not.toHaveBeenCalled();
    await expect(requireDataManager()).rejects.toBeInstanceOf(ForbiddenError);
  });
});
