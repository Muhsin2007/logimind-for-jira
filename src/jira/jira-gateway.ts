import type { AdfDoc, IssueContent } from '../domain/jira-issue';
import type { LiveIssue } from '../domain/types';

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

/** Port for the Jira REST calls LogiMind makes: as the current user, or as the app in background jobs. */
export interface JiraGateway {
  /** Projects in which the current user can create issues. */
  listCreatableProjects(): Promise<JiraProject[]>;
  /** Non-subtask issue types available for creating issues in the project. */
  listIssueTypes(projectKey: string): Promise<JiraIssueType[]>;
  createIssue(projectKey: string, issueTypeId: string, content: IssueContent): Promise<{ id: string; key: string }>;
  /** Current key and status by issue ID, for issues the user can see; absent IDs are deleted or hidden. */
  getIssueStatuses(issueIds: string[]): Promise<Map<string, LiveIssue>>;
  /** 'hidden' = exists but the user cannot see it; it still blocks a duplicate. */
  issueExists(issueId: string): Promise<'exists' | 'hidden' | 'missing'>;
  /** Adds a comment (ADF). Never changes the issue's status or fields. */
  addComment(issueId: string, body: AdfDoc): Promise<void>;
}
