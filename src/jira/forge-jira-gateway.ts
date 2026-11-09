import api, { route } from '@forge/api';
import type { AdfDoc, IssueContent } from '../domain/jira-issue';
import type { LiveIssue, StatusCategory } from '../domain/types';
import { JiraError, type JiraGateway, type JiraIssueType, type JiraProject } from './jira-gateway';

type ForgeResponse = Awaited<ReturnType<ReturnType<typeof api.asUser>['requestJira']>>;

const JSON_HEADERS = { Accept: 'application/json', 'Content-Type': 'application/json' };
const SEARCH_CHUNK = 50;

/** Maps a failed Jira response to a JiraError with a user-facing message. */
async function toJiraError(res: ForgeResponse, action: string): Promise<JiraError> {
  let details = '';
  try {
    const body = (await res.json()) as { errorMessages?: string[]; errors?: Record<string, string> };
    details = [...(body.errorMessages ?? []), ...Object.entries(body.errors ?? {}).map(([f, m]) => `${f}: ${m}`)].join('; ');
  } catch {
    /* non-JSON error body */
  }
  switch (res.status) {
    case 400:
      return new JiraError('VALIDATION', `Jira rejected the request to ${action}${details ? `: ${details}` : '.'}`);
    case 401:
      return new JiraError('AUTH', 'Your Jira session or app authorization has expired. Reload the page and allow access.');
    case 403:
      return new JiraError('FORBIDDEN', `You do not have permission to ${action}.`);
    case 404:
      return new JiraError('NOT_FOUND', `Jira could not find what was needed to ${action}.`);
    case 429:
      return new JiraError('RATE_LIMITED', 'Jira is rate-limiting requests. Wait a moment and try again.');
    default:
      return new JiraError('UNKNOWN', `Jira returned an error (${res.status}) while trying to ${action}.`);
  }
}

const CATEGORIES: StatusCategory[] = ['new', 'indeterminate', 'done'];

/** 'user' = the person using the app (Jira permissions apply to them); 'app' = the app's own user, for scheduled work. */
export type JiraPrincipal = 'user' | 'app';

export class ForgeJiraGateway implements JiraGateway {
  constructor(private readonly principal: JiraPrincipal = 'user') {}

  private client() {
    return this.principal === 'app' ? api.asApp() : api.asUser();
  }

  async listCreatableProjects(): Promise<JiraProject[]> {
    const res = await this.client().requestJira(route`/rest/api/3/project/search?action=create&maxResults=100&orderBy=name`, { headers: JSON_HEADERS });
    if (!res.ok) throw await toJiraError(res, 'list projects');
    const body = (await res.json()) as { values?: { id: string; key: string; name: string }[] };
    return (body.values ?? []).map(({ id, key, name }) => ({ id, key, name }));
  }

  async listIssueTypes(projectKey: string): Promise<JiraIssueType[]> {
    const res = await this.client().requestJira(route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`, { headers: JSON_HEADERS });
    if (!res.ok) throw await toJiraError(res, `list issue types for ${projectKey}`);
    const body = (await res.json()) as { issueTypes?: RawIssueType[]; values?: RawIssueType[] };
    // Standard-level types only: sub-tasks need a parent and epics (level 1) are not risk work items.
    return (body.issueTypes ?? body.values ?? [])
      .filter((t) => !t.subtask && (t.hierarchyLevel ?? 0) === 0)
      .map(({ id, name }) => ({ id, name }));
  }

  async createIssue(projectKey: string, issueTypeId: string, content: IssueContent): Promise<{ id: string; key: string }> {
    const res = await this.client().requestJira(route`/rest/api/3/issue`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        fields: {
          project: { key: projectKey },
          issuetype: { id: issueTypeId },
          summary: content.summary,
          description: content.description,
          labels: content.labels,
        },
      }),
    });
    if (!res.ok) throw await toJiraError(res, `create an issue in ${projectKey}`);
    const body = (await res.json()) as { id: string; key: string };
    return { id: body.id, key: body.key };
  }

  async getIssueStatuses(issueIds: string[]): Promise<Map<string, LiveIssue>> {
    const out = new Map<string, LiveIssue>();
    const ids = issueIds.filter((id) => /^\d{1,18}$/.test(id)); // numeric only: safe to embed in JQL
    for (let i = 0; i < ids.length; i += SEARCH_CHUNK) {
      const chunk = ids.slice(i, i + SEARCH_CHUNK);
      const res = await this.client().requestJira(route`/rest/api/3/search/jql`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ jql: `id in (${chunk.join(',')})`, fields: ['status'], maxResults: SEARCH_CHUNK }),
      });
      if (!res.ok) throw await toJiraError(res, 'read issue statuses');
      const body = (await res.json()) as { issues?: { id: string; key: string; fields?: { status?: RawStatus } }[] };
      for (const issue of body.issues ?? []) {
        const status = issue.fields?.status;
        const category = status?.statusCategory?.key as StatusCategory | undefined;
        out.set(issue.id, {
          issueKey: issue.key,
          statusName: status?.name ?? 'Unknown',
          category: category && CATEGORIES.includes(category) ? category : 'unknown',
        });
      }
    }
    return out;
  }

  async issueExists(issueId: string): Promise<'exists' | 'hidden' | 'missing'> {
    const res = await this.client().requestJira(route`/rest/api/3/issue/${issueId}?fields=status`, { headers: JSON_HEADERS });
    if (res.ok) return 'exists';
    if (res.status === 404) return 'missing';
    if (res.status === 403 || res.status === 401) return 'hidden';
    throw await toJiraError(res, 'check the linked issue');
  }

  async addComment(issueId: string, body: AdfDoc): Promise<void> {
    if (!/^\d{1,18}$/.test(issueId)) throw new JiraError('VALIDATION', 'Invalid issue ID');
    const res = await this.client().requestJira(route`/rest/api/3/issue/${issueId}/comment`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ body }),
    });
    if (!res.ok) throw await toJiraError(res, 'add a comment');
  }
}

interface RawIssueType {
  id: string;
  name: string;
  subtask?: boolean;
  hierarchyLevel?: number;
}

interface RawStatus {
  name?: string;
  statusCategory?: { key?: string };
}
