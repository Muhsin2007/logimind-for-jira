/** A Jira person as shown to the current user. LogiMind stores only the account ID. */
export interface JiraUser {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
  /** An active human account (not an app, not deactivated): the only kind that can get a role. */
  active: boolean;
}

/** Port for the Jira user calls LogiMind makes, always as the current user. */
export interface UserDirectory {
  /** Jira global ADMINISTER permission of the current user; false when the check fails. */
  isSiteAdmin(): Promise<boolean>;
  /** Active people (no apps) whose name or e-mail matches, as Jira shows them to the current user. */
  search(query: string): Promise<JiraUser[]>;
  /** People by account ID; IDs Jira does not return (deleted or hidden) are absent. */
  getUsers(accountIds: string[]): Promise<Map<string, JiraUser>>;
}
