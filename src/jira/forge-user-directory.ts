import api, { route } from '@forge/api';
import { ACCOUNT_ID } from '../domain/roles';
import { JiraError } from './jira-gateway';
import type { JiraUser, UserDirectory } from './user-directory';

const SEARCH_LIMIT = 10;
const BULK_LIMIT = 50;
const JSON_HEADERS = { headers: { Accept: 'application/json' } };

interface RawUser {
  accountId?: unknown;
  displayName?: unknown;
  accountType?: unknown;
  active?: unknown;
  avatarUrls?: Record<string, unknown>;
}

function toUser(raw: RawUser): JiraUser | null {
  if (typeof raw.accountId !== 'string' || !ACCOUNT_ID.test(raw.accountId)) return null;
  const avatar = raw.avatarUrls?.['48x48'];
  return {
    accountId: raw.accountId,
    displayName: typeof raw.displayName === 'string' && raw.displayName.trim() ? raw.displayName.slice(0, 120) : raw.accountId,
    // Only https avatars from Jira; anything else is dropped rather than rendered.
    avatarUrl: typeof avatar === 'string' && avatar.startsWith('https://') ? avatar : null,
    active: raw.accountType === 'atlassian' && raw.active === true,
  };
}

/** Calls Jira as the current user, so names and e-mail matches follow Jira's own privacy settings. */
export class ForgeUserDirectory implements UserDirectory {
  async isSiteAdmin(): Promise<boolean> {
    try {
      const res = await api.asUser().requestJira(route`/rest/api/3/mypermissions?permissions=ADMINISTER`, JSON_HEADERS);
      if (!res.ok) return false;
      const body = (await res.json()) as { permissions?: Record<string, { havePermission?: unknown }> };
      return body.permissions?.ADMINISTER?.havePermission === true;
    } catch {
      return false;
    }
  }

  async search(query: string): Promise<JiraUser[]> {
    const params = new URLSearchParams({ query, maxResults: String(SEARCH_LIMIT) });
    const res = await api.asUser().requestJira(route`/rest/api/3/user/search?${params}`, JSON_HEADERS);
    if (!res.ok) throw new JiraError(res.status === 403 ? 'FORBIDDEN' : 'UNKNOWN', `Jira could not search people (HTTP ${res.status}).`);
    const body = (await res.json()) as RawUser[];
    return (Array.isArray(body) ? body : [])
      .map(toUser)
      .filter((u): u is JiraUser => u !== null && u.active);
  }

  async getUsers(accountIds: string[]): Promise<Map<string, JiraUser>> {
    const ids = [...new Set(accountIds)].filter((id) => ACCOUNT_ID.test(id));
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += BULK_LIMIT) chunks.push(ids.slice(i, i + BULK_LIMIT));
    // At most 3 chunks (owner, 20 managers, 50 log entries), fetched in parallel.
    const pages = await Promise.all(chunks.map((chunk) => this.bulk(chunk)));
    return new Map(pages.flat().map((u) => [u.accountId, u]));
  }

  private async bulk(ids: string[]): Promise<JiraUser[]> {
    const params = new URLSearchParams({ maxResults: '100' });
    for (const id of ids) params.append('accountId', id);
    const res = await api.asUser().requestJira(route`/rest/api/3/user/bulk?${params}`, JSON_HEADERS);
    if (!res.ok) throw new JiraError(res.status === 403 ? 'FORBIDDEN' : 'UNKNOWN', `Jira could not look up people (HTTP ${res.status}).`);
    const body = (await res.json()) as { values?: unknown } | null;
    return (Array.isArray(body?.values) ? (body.values as RawUser[]) : []).map(toUser).filter((u): u is JiraUser => u !== null);
  }
}
