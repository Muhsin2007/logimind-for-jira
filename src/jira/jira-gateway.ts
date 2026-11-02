import type { IssueContent } from '../domain/jira-issue';
import type { IssueStatus } from '../domain/types';

export type JiraErrorCode = 'AUTH' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'RATE_LIMITED' | 'UNKNOWN';

/** A Jira REST failure translated into something a user can act on. */
export class JiraError extends Error {
  constructor(
    readonly code: JiraErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
}

export interface JiraIssueType {
  id: string;
  name: string;
}

/** Port for the Jira REST calls LogiMind makes, always as the current user. */
export interface JiraGateway {
  /** Projects in which the current user can create issues. */
  listCreatableProjects(): Promise<JiraProject[]>;
  /** Non-subtask issue types available for creating issues in the project. */
  listIssueTypes(projectKey: string): Promise<JiraIssueType[]>;
  createIssue(projectKey: string, issueTypeId: string, content: IssueContent): Promise<{ id: string; key: string }>;
  /** Live status for each issue the user can see; missing keys are deleted or not visible. */
  getIssueStatuses(issueKeys: string[]): Promise<Map<string, IssueStatus>>;
  /** 'exists' also covers issues the user cannot see, so they are never duplicated. */
  issueExists(issueKey: string): Promise<'exists' | 'missing'>;
}
