import type { IssueLink, JiraConfig } from '../domain/types';

/** Persistence port for Jira settings and risk → issue links. */
export interface IssueLinkRepository {
  getConfig(): Promise<JiraConfig | null>;
  saveConfig(config: JiraConfig): Promise<void>;
  getLink(riskId: string): Promise<IssueLink | null>;
  listLinks(): Promise<IssueLink[]>;
  saveLink(link: IssueLink): Promise<void>;
  clearLinks(): Promise<void>;
  /** Serialises issue creation per risk so a double click cannot create two issues. */
  withRiskLock<T>(riskId: string, fn: () => Promise<T>): Promise<T>;
}

export class RiskBusyError extends Error {
  constructor() {
    super('An issue is already being created for this risk.');
  }
}
