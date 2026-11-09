import { briefList, diffRisks, toSnapshotEntries } from '../domain/risk-diff';
import { buildResolvedComment, type AdfDoc } from '../domain/jira-issue';
import type { IsoDate, IssueLink, JiraConfig, RiskEvent } from '../domain/types';
import { JiraError } from '../jira/jira-gateway';
import type { CheckRun, CreateIssueOutcome, DailyBriefing, LoopSettings } from '../shared/api';
import type { CheckStore } from '../storage/check-store';

/** Issues one check may create; further newly critical risks are reported as not created. */
export const MAX_AUTO_ISSUES = 5;
/** "Resolved in data" comments per check; the rest follow on the next check. */
export const MAX_RESOLVED_COMMENTS = 10;
/** Items per briefing list; the counts carry the totals. */
export const BRIEF_LIMIT = 10;

interface RiskSource {
  listRisks(): Promise<{ today: IsoDate; risks: RiskEvent[] }>;
}
interface LinkSource {
  getConfig(): Promise<JiraConfig | null>;
  listLinks(): Promise<IssueLink[]>;
  saveLink(link: IssueLink): Promise<void>;
}
interface IssueCreator {
  createIssueForRisk(riskId: string, createdBy: string | null, activeRisks?: RiskEvent[]): Promise<CreateIssueOutcome>;
}
interface Commenter {
  addComment(issueId: string, body: AdfDoc): Promise<void>;
}

/** Outcomes that mean "nothing to file": already filed, being filed right now, or no longer a risk. */
const HANDLED = new Set(['DUPLICATE', 'BUSY', 'RISK_NOT_FOUND']);

function autoCreateMessage(code: string, projectKey: string, message: string): string {
  if (code === 'FORBIDDEN' || code === 'AUTH') {
    return `The LogiMind app cannot create issues in ${projectKey}. Give the app's user ("LogiMind for Jira") the Browse projects and Create issues permissions in that project, or turn auto-create off.`;
  }
  if (code === 'NOT_FOUND' || code === 'VALIDATION') {
    return `The project or issue type chosen in Jira settings cannot be used by the app (${message}). Check the Jira settings.`;
  }
  return message;
}

/**
 * The daily check: compares open risks with the previous check, optionally files Jira issues for
 * newly critical risks (as the app), and comments once on issues whose risk left the data.
 * It never transitions, edits or closes an issue.
 */
export class DailyCheckService {
  constructor(
    private readonly risks: RiskSource,
    private readonly store: CheckStore,
    private readonly links: LinkSource,
    private readonly creator: IssueCreator,
    private readonly comments: Commenter,
    private readonly now: () => Date = () => new Date(),
  ) {}

  run(trigger: CheckRun['trigger']): Promise<CheckRun> {
    return this.store.withCheckLock(() => this.runLocked(trigger));
  }

  async getBriefing(): Promise<DailyBriefing> {
    const [lastRun, settings] = await Promise.all([this.store.getLastRun(), this.store.getSettings()]);
    return { lastRun, autoCreate: settings.autoCreate };
  }

  getSettings(): Promise<LoopSettings> {
    return this.store.getSettings();
  }

  async saveSettings(autoCreate: boolean, updatedBy: string | null): Promise<LoopSettings> {
    const settings: LoopSettings = { autoCreate, updatedAt: this.now().toISOString(), updatedBy };
    await this.store.saveSettings(settings);
    return settings;
  }

  private async runLocked(trigger: CheckRun['trigger']): Promise<CheckRun> {
    const checkedAt = this.now().toISOString();
    const [{ today, risks }, previous, settings] = await Promise.all([this.risks.listRisks(), this.store.getSnapshot(), this.store.getSettings()]);
    const diff = diffRisks(previous?.entries ?? null, risks);

    const autoCreate: CheckRun['autoCreate'] =
      settings.autoCreate && !diff.baseline
        ? await this.autoCreate(diff.newCritical, risks)
        : { enabled: settings.autoCreate, created: [], notCreated: 0, error: null };
    const comments = await this.commentResolved(new Set(risks.map((r) => r.id)), today);

    const run: CheckRun = {
      checkedAt,
      today,
      trigger,
      baseline: diff.baseline,
      counts: {
        open: risks.length,
        newRisks: diff.newRisks.length,
        resolved: diff.resolved.length,
        stillOpen: diff.stillOpen.length,
        stillCritical: diff.stillCritical.length,
      },
      newRisks: briefList(diff.newRisks, BRIEF_LIMIT),
      resolved: briefList(diff.resolved, BRIEF_LIMIT),
      stillCritical: briefList(diff.stillCritical, BRIEF_LIMIT),
      autoCreate,
      comments,
    };
    // The run is saved before the snapshot: if the snapshot write fails, the next check diffs
    // against the older snapshot again, so no change silently disappears from the briefing.
    await this.store.saveLastRun(run);
    await this.store.saveSnapshot({ checkedAt, today, entries: toSnapshotEntries(risks) });
    return run;
  }

  private async autoCreate(candidates: RiskEvent[], active: RiskEvent[]): Promise<CheckRun['autoCreate']> {
    const result: CheckRun['autoCreate'] = { enabled: true, created: [], notCreated: 0, error: null };
    if (candidates.length === 0) return result;
    const config = await this.links.getConfig();
    if (!config) {
      result.notCreated = candidates.length;
      result.error = { code: 'NOT_CONFIGURED', message: 'Choose a Jira project and issue type in Jira settings before issues can be created automatically.' };
      return result;
    }
    let handled = 0;
    let attempts = 0;
    for (const ref of briefList(candidates, candidates.length)) {
      if (attempts >= MAX_AUTO_ISSUES || result.error) break;
      attempts++;
      const outcome = await this.creator.createIssueForRisk(ref.id, null, active);
      if (outcome.ok) {
        result.created.push({ riskId: ref.id, issueKey: outcome.link.issueKey });
      } else if (HANDLED.has(outcome.code)) {
        handled++;
      } else {
        result.error = { code: outcome.code, message: autoCreateMessage(outcome.code, config.projectKey, outcome.message) };
        console.warn('LogiMind daily check: auto-create stopped', { code: outcome.code });
      }
    }
    result.notCreated = candidates.length - result.created.length - handled;
    return result;
  }

  private async commentResolved(open: Set<string>, today: IsoDate): Promise<CheckRun['comments']> {
    const out: CheckRun['comments'] = { added: [], error: null };
    const pending = (await this.links.listLinks()).filter((l) => !open.has(l.riskId) && !l.resolvedNotedAt);
    for (const link of pending.slice(0, MAX_RESOLVED_COMMENTS)) {
      try {
        await this.comments.addComment(link.issueId, buildResolvedComment(link, today));
        await this.links.saveLink({ ...link, resolvedNotedAt: this.now().toISOString() });
        out.added.push({ riskId: link.riskId, issueKey: link.issueKey });
      } catch (err) {
        if (err instanceof JiraError && err.code === 'NOT_FOUND') {
          // The issue was deleted or is out of the app's reach: mark it so it is not retried daily.
          await this.links.saveLink({ ...link, resolvedNotedAt: this.now().toISOString() });
          continue;
        }
        const forbidden = err instanceof JiraError && (err.code === 'FORBIDDEN' || err.code === 'AUTH');
        out.error = forbidden
          ? 'The LogiMind app cannot add comments to linked issues. Give the app the Add comments permission in the project.'
          : `Comments could not be added: ${err instanceof Error ? err.message : 'unknown error'}`;
        console.warn('LogiMind daily check: commenting stopped', { code: err instanceof JiraError ? err.code : 'UNKNOWN' });
        break;
      }
    }
    return out;
  }
}
