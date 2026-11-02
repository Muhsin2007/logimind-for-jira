import { buildIssueContent } from '../domain/jira-issue';
import type { IssueLink, JiraConfig, RiskEvent } from '../domain/types';
import { JiraError, type JiraGateway, type JiraIssueType, type JiraProject } from '../jira/jira-gateway';
import type { CreateIssueOutcome, IssueContextData, IssueLinksData, IssueLinkView } from '../shared/api';
import { RiskBusyError, type IssueLinkRepository } from '../storage/issue-links';
import type { LogisticsService } from './logistics-service';

/** Jira issue keys look like ABC-123. */
export const ISSUE_KEY = /^[A-Z][A-Z0-9_]{0,19}-\d{1,9}$/;
const PROJECT_KEY = /^[A-Z][A-Z0-9_]{0,19}$/;

type RiskSource = Pick<LogisticsService, 'listRisks' | 'getShipment'>;

export class IssueService {
  constructor(
    private readonly logistics: RiskSource,
    private readonly links: IssueLinkRepository,
    private readonly jira: JiraGateway,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getConfig(): Promise<JiraConfig | null> {
    return this.links.getConfig();
  }

  listProjects(): Promise<JiraProject[]> {
    return this.jira.listCreatableProjects();
  }

  listIssueTypes(projectKey: string): Promise<JiraIssueType[]> {
    if (!PROJECT_KEY.test(projectKey)) throw new Error('Invalid project key');
    return this.jira.listIssueTypes(projectKey);
  }

  /** Saves the target project and issue type after confirming both exist for this user. */
  async saveConfig(projectKey: string, issueTypeId: string, updatedBy: string | null): Promise<JiraConfig> {
    const project = (await this.jira.listCreatableProjects()).find((p) => p.key === projectKey);
    if (!project) throw new Error(`You cannot create issues in project ${projectKey}`);
    const issueType = (await this.jira.listIssueTypes(projectKey)).find((t) => t.id === issueTypeId);
    if (!issueType) throw new Error(`Issue type ${issueTypeId} is not available in ${projectKey}`);
    const config: JiraConfig = {
      projectKey: project.key,
      projectName: project.name,
      issueTypeId: issueType.id,
      issueTypeName: issueType.name,
      updatedAt: this.now().toISOString(),
      updatedBy,
    };
    await this.links.saveConfig(config);
    return config;
  }

  /** All links with live Jira status. A status lookup failure never hides the links themselves. */
  async listLinks(): Promise<IssueLinksData> {
    const [config, links] = await Promise.all([this.links.getConfig(), this.links.listLinks()]);
    let statuses = new Map<string, IssueLinkView['status']>();
    let statusError: string | null = null;
    const keys = links.map((l) => l.issueKey).filter((k) => ISSUE_KEY.test(k));
    if (keys.length > 0) {
      try {
        statuses = await this.jira.getIssueStatuses(keys);
      } catch (err) {
        statusError = err instanceof Error ? err.message : 'Could not read issue statuses';
      }
    }
    return {
      config,
      statusError,
      links: links.map((l) => ({ ...l, status: statuses.get(l.issueKey) ?? null })),
    };
  }

  /**
   * Creates one Jira issue for a currently active risk, as the current user. A risk that
   * already has an issue (that still exists or that the user cannot see) is never duplicated.
   */
  async createIssueForRisk(riskId: string, createdBy: string | null): Promise<CreateIssueOutcome> {
    const config = await this.links.getConfig();
    if (!config) {
      return { ok: false, code: 'NOT_CONFIGURED', message: 'A Jira administrator must choose a project for LogiMind issues in Import & Settings.' };
    }
    const risk = (await this.logistics.listRisks()).risks.find((r) => r.id === riskId);
    if (!risk) {
      return { ok: false, code: 'RISK_NOT_FOUND', message: 'This risk is no longer active in the current data, so no issue was created.' };
    }

    try {
      return await this.links.withRiskLock(riskId, async () => {
        const existing = await this.links.getLink(riskId);
        if (existing && (await this.jira.issueExists(existing.issueKey)) === 'exists') {
          return { ok: false, code: 'DUPLICATE', message: `Issue ${existing.issueKey} already tracks this risk.`, link: { ...existing, status: null } };
        }
        const created = await this.jira.createIssue(config.projectKey, config.issueTypeId, buildIssueContent(risk));
        const link = toLink(risk, created, config.projectKey, this.now().toISOString(), createdBy);
        await this.links.saveLink(link);
        return { ok: true, link: { ...link, status: null } };
      });
    } catch (err) {
      if (err instanceof RiskBusyError) return { ok: false, code: 'BUSY', message: err.message };
      if (err instanceof JiraError) return { ok: false, code: err.code, message: err.message };
      throw err;
    }
  }

  /** Data for the LogiMind panel on a Jira issue: the linked risk and its shipment, if any. */
  async getIssueContext(issueKey: string): Promise<IssueContextData> {
    const link = (await this.links.listLinks()).find((l) => l.issueKey === issueKey) ?? null;
    if (!link) return { issueKey, link: null, currentRisk: null, shipment: null };
    const [{ risks }, shipment] = await Promise.all([
      this.logistics.listRisks(),
      link.entityType === 'shipment' ? this.logistics.getShipment(link.entityKey) : Promise.resolve(null),
    ]);
    return { issueKey, link, currentRisk: risks.find((r) => r.id === link.riskId) ?? null, shipment };
  }

  clearLinks(): Promise<void> {
    return this.links.clearLinks();
  }
}

function toLink(risk: RiskEvent, issue: { id: string; key: string }, projectKey: string, createdAt: string, createdBy: string | null): IssueLink {
  return {
    riskId: risk.id,
    riskType: risk.type,
    severity: risk.severity,
    entityType: risk.entityType,
    entityKey: risk.entityKey,
    riskTitle: risk.title,
    issueId: issue.id,
    issueKey: issue.key,
    projectKey,
    createdAt,
    createdBy,
  };
}
