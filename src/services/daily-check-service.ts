import { briefList, diffRisks, toSnapshotEntries } from '../domain/risk-diff';
import { buildResolvedComment, type AdfDoc } from '../domain/jira-issue';
import type { IsoDate, IssueLink, JiraConfig, RiskEvent } from '../domain/types';
import { JiraError } from '../jira/jira-gateway';
import type { CheckRun, CreateIssueOutcome, DailyBriefing, LoopSettings } from '../shared/api';
import type { CheckStore } from '../storage/check-store';

/** Issues one scheduled check may create; further newly critical risks wait for the next check. */
export const MAX_AUTO_ISSUES = 5;
/** "Resolved in data" comments per scheduled check; the rest follow on the next check. */
export const MAX_RESOLVED_COMMENTS = 10;
/** "Run check now" runs inside a resolver call (about 25 s), so it does less per run. */
export const MANUAL_LIMITS = { issues: 3, comments: 5 } as const;
/** Items per briefing list; the counts carry the totals. */
export const BRIEF_LIMIT = 10;
/** Newly critical risks kept for a retry by the next run when a run could not file them. */
export const MAX_PENDING = 50;
/** Marker removals per run for risks that came back (cheap KVS writes; the rest follow). */
const MAX_MARKER_RESETS = 50;
const COMMENTS_FAILED = 'Comments could not be added to linked issues. The next check tries again.';

interface Limits {
  issues: number;
  comments: number;
}
interface RiskSource {
  listRisks(): Promise<{ today: IsoDate; risks: RiskEvent[]; hasData: boolean }>;
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
 * The daily check: compares open risks with the latest check of an earlier day, optionally files
 * Jira issues for newly critical risks (as the app), and comments once on issues whose risk left
 * the data. It never transitions, edits or closes an issue.
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
    const limits: Limits = trigger === 'manual' ? MANUAL_LIMITS : { issues: MAX_AUTO_ISSUES, comments: MAX_RESOLVED_COMMENTS };
    return this.store.withCheckLock(() => this.runLocked(trigger, limits));
  }

  /** Forgets snapshots and the last run, with "Clear data". */
  clear(): Promise<void> {
    return this.store.withCheckLock(() => this.store.clear());
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

  private async runLocked(trigger: CheckRun['trigger'], limits: Limits): Promise<CheckRun> {
    const checkedAt = this.now().toISOString();
    const [{ today, risks, hasData }, settings, lastRun] = await Promise.all([this.risks.listRisks(), this.store.getSettings(), this.store.getLastRun()]);
    const idle: CheckRun['autoCreate'] = { enabled: settings.autoCreate, created: [], notCreated: 0, error: null, pending: [] };

    if (!hasData) {
      // Nothing imported (or just cleared): no snapshot, so the first check with data is a baseline
      // instead of reporting every risk as new, and no comment claims a risk was resolved.
      const empty: CheckRun = {
        checkedAt, today, trigger, baseline: true, noData: true,
        counts: { open: 0, newRisks: 0, resolved: 0, stillOpen: 0, stillCritical: 0 },
        newRisks: [], resolved: [], stillCritical: [], autoCreate: idle, comments: { added: [], error: null },
      };
      await this.store.saveLastRun(empty);
      return empty;
    }

    // The base is the latest snapshot of an earlier day, so a second check today keeps today's changes.
    const previous = await this.store.getSnapshot(today);
    const diff = diffRisks(previous?.entries ?? null, risks);

    let autoCreate = idle;
    if (settings.autoCreate && !diff.baseline) {
      const retry = new Set(lastRun?.autoCreate.pending ?? []);
      const fresh = new Set(diff.newCritical.map((r) => r.id));
      const carried = risks.filter((r) => r.severity === 'critical' && retry.has(r.id) && !fresh.has(r.id));
      autoCreate = await this.autoCreate([...diff.newCritical, ...carried], risks, limits.issues);
    }
    const comments = await this.commentResolved(new Set(risks.map((r) => r.id)), today, limits.comments);

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

  private async autoCreate(candidates: RiskEvent[], active: RiskEvent[], maxIssues: number): Promise<CheckRun['autoCreate']> {
    const result: CheckRun['autoCreate'] = { enabled: true, created: [], notCreated: 0, error: null, pending: [] };
    if (candidates.length === 0) return result;
    const ordered = briefList(candidates, candidates.length);
    const config = await this.links.getConfig();
    if (!config) {
      result.notCreated = candidates.length;
      result.pending = ordered.slice(0, MAX_PENDING).map((r) => r.id);
      result.error = { code: 'NOT_CONFIGURED', message: 'Choose a Jira project and issue type in Jira settings before issues can be created automatically.' };
      return result;
    }
    const pending: string[] = [];
    let handled = 0;
    let attempts = 0;
    for (const ref of ordered) {
      if (attempts >= maxIssues || result.error) {
        pending.push(ref.id);
        continue;
      }
      attempts++;
      const outcome = await this.creator.createIssueForRisk(ref.id, null, active);
      if (outcome.ok) {
        result.created.push({ riskId: ref.id, issueKey: outcome.link.issueKey });
      } else if (HANDLED.has(outcome.code)) {
        handled++;
      } else {
        pending.push(ref.id);
        result.error = { code: outcome.code, message: autoCreateMessage(outcome.code, config.projectKey, outcome.message) };
        console.warn('LogiMind daily check: auto-create stopped', { code: outcome.code });
      }
    }
    result.notCreated = candidates.length - result.created.length - handled;
    result.pending = pending.slice(0, MAX_PENDING);
    return result;
  }

  private async commentResolved(open: Set<string>, today: IsoDate, maxComments: number): Promise<CheckRun['comments']> {
    const out: CheckRun['comments'] = { added: [], error: null };
    const links = await this.links.listLinks();

    // A risk that is back in the data loses its marker, so its next resolution is noted again.
    for (const link of links.filter((l) => open.has(l.riskId) && l.resolvedNotedAt).slice(0, MAX_MARKER_RESETS)) {
      const { resolvedNotedAt: _noted, ...reopened } = link;
      await this.links.saveLink(reopened).catch(() => console.warn('LogiMind daily check: marker reset failed'));
    }

    const pending = links.filter((l) => !open.has(l.riskId) && !l.resolvedNotedAt);
    for (const link of pending.slice(0, maxComments)) {
      // The marker is written first: a run cut off after the comment never comments twice.
      try {
        await this.links.saveLink({ ...link, resolvedNotedAt: this.now().toISOString() });
      } catch {
        out.error = COMMENTS_FAILED;
        console.warn('LogiMind daily check: commenting stopped', { code: 'STORAGE' });
        break;
      }
      try {
        await this.comments.addComment(link.issueId, buildResolvedComment(link, today));
        out.added.push({ riskId: link.riskId, issueKey: link.issueKey });
      } catch (err) {
        // A deleted issue (or one out of the app's reach) stays marked, so it is not retried daily.
        if (err instanceof JiraError && err.code === 'NOT_FOUND') continue;
        await this.links.saveLink(link).catch(() => undefined);
        const forbidden = err instanceof JiraError && (err.code === 'FORBIDDEN' || err.code === 'AUTH');
        out.error = forbidden
          ? 'The LogiMind app cannot add comments to linked issues. Give the app the Add comments permission in the project.'
          : COMMENTS_FAILED;
        console.warn('LogiMind daily check: commenting stopped', { code: err instanceof JiraError ? err.code : 'UNKNOWN' });
        break;
      }
    }
    return out;
  }
}
