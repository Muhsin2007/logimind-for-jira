import api, { route } from '@forge/api';

export class ForbiddenError extends Error {
  constructor() {
    super('Only Jira administrators can import, load or delete LogiMind data.');
  }
}

/**
 * Whether the current user may change the site-wide LogiMind dataset. Checked server-side
 * against Jira's global ADMINISTER permission, as the user, so it cannot be spoofed from the UI.
 */
export async function canManageData(): Promise<boolean> {
  const res = await api
    .asUser()
    .requestJira(route`/rest/api/3/mypermissions?permissions=ADMINISTER`, { headers: { Accept: 'application/json' } });
  if (!res.ok) return false;
  const body = (await res.json()) as { permissions?: Record<string, { havePermission?: boolean }> };
  return body.permissions?.ADMINISTER?.havePermission === true;
}

export async function requireDataManager(): Promise<void> {
  if (!(await canManageData())) throw new ForbiddenError();
}
