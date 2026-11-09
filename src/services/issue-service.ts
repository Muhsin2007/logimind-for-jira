import { createHash } from 'node:crypto';
import { buildIssueContent } from '../domain/jira-issue';
import type { IssueLink, JiraConfig, LiveIssue, RiskEvent } from '../domain/types';
import { JiraError, type JiraGateway, type JiraIssueType, type JiraProject } from '../jira/jira-gateway';
import type { CreateIssueOutcome, IssueContextData, IssueLinksData, IssueLinkView } from '../shared/api';
import { RiskBusyError, type IssueLinkRepository } from '../storage/issue-links';
import type { LogisticsService } from './logistics-service';

/** Jira issue IDs are numeric; issue keys can change when an issue moves, IDs never do. */
export const ISSUE_ID = /^\d{1,18}$/;
const PROJECT_KEY = /^[A-Z][A-Z0-9_]{0,19}$/;
const LINK_SAVE_ATTEMPTS = 3;

type RiskSource = Pick<LogisticsService, 'listRisks' | 'getShipment'>;

/** Stable per-risk label, so an issue can be found by JQL even if its LogiMind link were lost. */
export function riskLabel(riskId: string): string {
  return `logimind-risk-${createHash('sha256').update(riskId).digest('hex').slice(0, 12)}`;
}

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

  /**
   * All links with live Jira key and status, looked up by issue ID as the viewer. A status
   * lookup failure never hides the links. Who created each issue is not sent to viewers.
   */
  async listLinks(): Promise<IssueLinksData> {
    const [config, links] = await Promise.all([this.links.getConfig(), this.links.listLinks()]);
    let live = new Map<string, LiveIssue>();
    let statusError: string | null = null;
    const ids = links.map((l) => l.issueId).filter((id) => ISSUE_ID.test(id));
    if (ids.length > 0) {
      try {
        live = await this.jira.getIssueStatuses(ids);
      } catch (err) {
        statusError = err instanceof Error ? err.message : 'Could not read issue statuses';
      }
    }
    return { config, statusError, links: links.map((l) => toView(l, live.get(l.issueId) ?? null)) };
  }

  /**
   * Creates one Jira issue for a currently active risk, as the current user. A risk whose
   * issue still exists (even one the user cannot see) is never duplicated.
   */
  /** `activeRisks` lets a caller that has just evaluated the risks (the daily check) skip a second evaluation. */
  async createIssueForRisk(riskId: string, createdBy: string | null, activeRisks?: RiskEvent[]): Promise<CreateIssueOutcome> {
    const config = await this.links.getConfig();
    if (!config) {
      return { ok: false, code: 'NOT_CONFIGURED', message: 'A Jira administrator must choose a project for LogiMind issues in Import & Settings.' };
    }
    const risk = (activeRisks ?? (await this.logistics.listRisks()).risks).find((r) => r.id === riskId);
    if (!risk) {
      return { ok: false, code: 'RISK_NOT_FOUND', message: 'This risk is no longer active in the current data, so no issue was created.' };
    }

    try {
      return await this.links.withRiskLock(riskId, async (): Promise<CreateIssueOutcome> => {
        const existing = await this.links.getLink(riskId);
        if (existing) {
          const state = await this.jira.issueExists(existing.issueId);
          if (state === 'exists') {
            return { ok: false, code: 'DUPLICATE', message: `Issue ${existing.issueKey} already tracks this risk.`, link: toView(existing, null) };
          }
          if (state === 'hidden') {
            return { ok: false, code: 'DUPLICATE', message: 'An issue you do not have access to already tracks this risk.' };
          }
        }
        const content = buildIssueContent(risk);
        content.labels.push(riskLabel(risk.id));
        const created = await this.jira.createIssue(config.projectKey, config.issueTypeId, content);
        const link = toLink(risk, created, config.projectKey, this.now().toISOString(), createdBy);
        if (!(await this.saveLinkWithRetry(link))) {
          return {
            ok: false,
            code: 'LINK_FAILED',
            message: `Created ${created.key}, but LogiMind could not record the link. Do not create it again; the issue carries the label ${riskLabel(risk.id)}.`,
          };
        }
        return { ok: true, link: toView(link, null) };
      });
    } catch (err) {
      if (err instanceof RiskBusyError) return { ok: false, code: 'BUSY', message: err.message };
      if (err instanceof JiraError) return { ok: false, code: err.code, message: err.message };
      throw err;
    }
  }

  /** Data for the LogiMind sidebar on a Jira issue, matched by issue ID (stable across moves). */
  async getIssueContext(issueId: string, issueKey: string): Promise<IssueContextData> {
    const link = (await this.links.listLinks()).find((l) => l.issueId === issueId) ?? null;
    if (!link) return { issueKey, link: null, currentRisk: null, shipment: null };
    const [{ risks }, shipment] = await Promise.all([
      this.logistics.listRisks(),
      link.entityType === 'shipment' ? this.logistics.getShipment(link.entityKey) : Promise.resolve(null),
    ]);
    return { issueKey, link: { ...toView(link, null), issueKey }, currentRisk: risks.find((r) => r.id === link.riskId) ?? null, shipment };
  }

  clearLinks(): Promise<void> {
    return this.links.clearLinks();
  }

  private async saveLinkWithRetry(link: IssueLink): Promise<boolean> {
    for (let attempt = 1; attempt <= LINK_SAVE_ATTEMPTS; attempt++) {
      try {
        await this.links.saveLink(link);
        return true;
      } catch {
        /* retried below; reported to the user after the last attempt */
      }
    }
    return false;
  }
}

function toView(link: IssueLink, live: LiveIssue | null): IssueLinkView {
  const { createdBy: _createdBy, ...rest } = link;
  return {
    ...rest,
    issueKey: live?.issueKey ?? link.issueKey,
    status: live ? { statusName: live.statusName, category: live.category } : null,
  };
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
