import Resolver from '@forge/resolver';
import { ColumnMapper } from './ai/column-mapper';
import { FollowUpDrafter } from './ai/follow-up-drafter';
import { getInventory, getLinkedJiraIssue, getRiskSummary, getShipment, safely, simulateDelay } from './agent/actions';
import { canManageData, requireDataManager } from './auth/access';
import { LlmCopilot } from './copilot/llm-copilot';
import { MAX_QUESTION } from './copilot/rule-based-copilot';
import { ServiceToolbox } from './copilot/tools';
import { MAX_COLUMNS } from './domain/column-mapping';
import { followUpFacts } from './domain/follow-up';
import { ForgeJiraGateway } from './jira/forge-jira-gateway';
import { ForgeLlm } from './llm/forge-llm';
import { DailyCheckService } from './services/daily-check-service';
import { IssueService, ISSUE_ID } from './services/issue-service';
import { LogisticsService } from './services/logistics-service';
import { CheckBusyError } from './storage/check-store';
import { KvsCheckStore } from './storage/kvs-check-store';
import { KvsIssueLinkRepository } from './storage/kvs-issue-links';
import { KvsLogisticsRepository } from './storage/kvs-repository';

const logistics = new LogisticsService(new KvsLogisticsRepository());
const issueLinks = new KvsIssueLinkRepository();
const issues = new IssueService(logistics, issueLinks, new ForgeJiraGateway());
// Background work (the daily check) has no user, so it calls Jira as the app: the app's user needs
// Browse projects, Create issues and Add comments in the configured project.
const appJira = new ForgeJiraGateway('app');
const dailyCheck = new DailyCheckService(logistics, new KvsCheckStore(), issueLinks, new IssueService(logistics, issueLinks, appJira), appJira);
const llm = new ForgeLlm();
const resolver = new Resolver();

function requireString(payload: unknown, field: string, maxLength: number): string {
  const value = (payload as Record<string, unknown> | null)?.[field];
  if (typeof value !== 'string') throw new Error(`Invalid request: "${field}" must be a string`);
  if (value.length > maxLength) throw new Error(`Invalid request: "${field}" is too long`);
  return value;
}

function requireMapping(payload: unknown): (string | null)[] {
  const value = (payload as Record<string, unknown> | null)?.mapping;
  if (!Array.isArray(value) || value.length > MAX_COLUMNS) throw new Error('Invalid request: "mapping" must be a list of columns');
  return value.map((f) => {
    if (f === null) return null;
    if (typeof f !== 'string' || f.length > 40) throw new Error('Invalid request: each mapping entry must be a field name or null');
    return f;
  });
}

type Context = { accountId?: string; extension?: { issue?: { id?: string | number; key?: string } } };
const accountOf = (context: Context | undefined) => context?.accountId ?? null;

// Reads: any user who can open the page.
resolver.define('getHealth', () => ({ status: 'ok' as const, timestamp: new Date().toISOString() }));
resolver.define('getAccess', async () => ({ canManageData: await canManageData() }));
resolver.define('getDashboard', () => logistics.getDashboard());
resolver.define('listShipments', () => logistics.listShipments());
resolver.define('getShipment', ({ payload }) => logistics.getShipment(requireString(payload, 'id', 64)));
resolver.define('listInventory', () => logistics.listInventory());
resolver.define('listRisks', () => logistics.listRisks());
resolver.define('listImports', () => logistics.listImports());
resolver.define('listIssueLinks', () => issues.listLinks());
// The Forge LLM answers through the read-only toolbox; unverifiable answers or an unavailable
// model fall back to the rule-based copilot. A fresh toolbox per request reads the data once.
// The locale only selects the answer language; anything but a known locale means English.
resolver.define('askCopilot', ({ payload, context }) => {
  const locale = (payload as Record<string, unknown> | null)?.locale === 'ru' ? 'ru' : 'en';
  return new LlmCopilot(new ServiceToolbox(logistics, issues), llm, { accountId: accountOf(context) }).ask(requireString(payload, 'question', MAX_QUESTION), locale);
});

// Issue creation runs as the user, so Jira's own project permissions decide who may create.
resolver.define('createIssueForRisk', ({ payload, context }) =>
  issues.createIssueForRisk(requireString(payload, 'riskId', 200), accountOf(context)),
);

// The issue sidebar trusts only the issue from Forge's server-side context, never the payload.
resolver.define('getIssueContext', ({ context }) => {
  const issue = (context as Context | undefined)?.extension?.issue;
  const id = issue?.id === undefined ? '' : String(issue.id);
  if (!ISSUE_ID.test(id)) throw new Error('This view is only available on a Jira issue');
  return issues.getIssueContext(id, String(issue?.key ?? ''));
});

// Writes that change site-wide data or settings: Jira administrators only, checked server-side.
resolver.define('importCsv', async ({ payload, context }) => {
  const filename = requireString(payload, 'filename', 260);
  const content = requireString(payload, 'content', 1_100_000);
  await requireDataManager();
  return logistics.importCsv(filename, content, accountOf(context));
});
// AI column mapping costs a model call, so it is limited to the people who may import.
resolver.define('proposeColumnMapping', async ({ payload }) => {
  const content = requireString(payload, 'content', 1_100_000);
  await requireDataManager();
  return new ColumnMapper(llm).propose(content);
});
resolver.define('importCsvWithMapping', async ({ payload, context }) => {
  const filename = requireString(payload, 'filename', 260);
  const content = requireString(payload, 'content', 1_100_000);
  const kind = requireString(payload, 'kind', 20);
  if (kind !== 'shipments' && kind !== 'inventory') throw new Error('Invalid request: "kind" must be shipments or inventory');
  const mapping = requireMapping(payload);
  await requireDataManager();
  return logistics.importCsvWithMapping(filename, content, kind, mapping, accountOf(context));
});
resolver.define('loadDemoData', async ({ context }) => {
  await requireDataManager();
  return logistics.loadDemoData(accountOf(context));
});
resolver.define('clearData', async () => {
  await requireDataManager();
  const result = await logistics.clearData();
  await issues.clearLinks();
  // The daily check forgets its snapshots too, so the next check is a baseline, not "everything resolved".
  await dailyCheck.clear().catch((err: unknown) => {
    if (!(err instanceof CheckBusyError)) throw err;
    console.warn('LogiMind clear data: daily check running, its state is kept');
  });
  return result;
});
resolver.define('listJiraProjects', async () => {
  await requireDataManager();
  return issues.listProjects();
});
resolver.define('listJiraIssueTypes', async ({ payload }) => {
  await requireDataManager();
  return issues.listIssueTypes(requireString(payload, 'projectKey', 20));
});
resolver.define('saveJiraConfig', async ({ payload, context }) => {
  const projectKey = requireString(payload, 'projectKey', 20);
  const issueTypeId = requireString(payload, 'issueTypeId', 20);
  await requireDataManager();
  return issues.saveConfig(projectKey, issueTypeId, accountOf(context));
});

// Daily check: the briefing is readable by everyone; running it and the auto-create switch are admin-only.
resolver.define('getDailyBriefing', () => dailyCheck.getBriefing());
resolver.define('runDailyCheck', async () => {
  await requireDataManager();
  try {
    return { ok: true as const, run: await dailyCheck.run('manual') };
  } catch (err) {
    if (err instanceof CheckBusyError) return { ok: false as const, code: 'BUSY' as const, message: err.message };
    throw err;
  }
});
resolver.define('getLoopSettings', async () => {
  await requireDataManager();
  const { autoCreate, updatedAt } = await dailyCheck.getSettings();
  return { autoCreate, updatedAt };
});
resolver.define('saveLoopSettings', async ({ payload, context }) => {
  const autoCreate = (payload as Record<string, unknown> | null)?.autoCreate;
  if (typeof autoCreate !== 'boolean') throw new Error('Invalid request: "autoCreate" must be true or false');
  await requireDataManager();
  const saved = await dailyCheck.saveSettings(autoCreate, accountOf(context));
  return { autoCreate: saved.autoCreate, updatedAt: saved.updatedAt };
});

// Supplier follow-up: a draft to copy, never sent. Only shipments with an open risk get one.
resolver.define('draftFollowUp', async ({ payload, context }) => {
  const locale = (payload as Record<string, unknown> | null)?.locale === 'ru' ? 'ru' : 'en';
  const detail = await logistics.getShipment(requireString(payload, 'shipmentId', 64));
  const risks = detail?.risks.filter((r) => r.entityType === 'shipment') ?? [];
  if (!detail || risks.length === 0) return null;
  const facts = followUpFacts(detail.shipment, risks, risks[0].evaluatedOn);
  return new FollowUpDrafter(llm, { accountId: accountOf(context) }).draft(facts, locale);
});

export const handler = resolver.getDefinitions();

/** Scheduled trigger (daily). Forge ignores the return value and does not retry, so failures are logged. */
export async function runDailyCheck(): Promise<void> {
  try {
    const run = await dailyCheck.run('schedule');
    console.log('LogiMind daily check done', { baseline: run.baseline, ...run.counts, created: run.autoCreate.created.length, comments: run.comments.added.length });
  } catch (err) {
    if (err instanceof CheckBusyError) console.log('LogiMind daily check skipped: another check is running');
    else console.error('LogiMind daily check failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

// Rovo agent actions (read-only). Each request gets its own toolbox: one consistent data read.
const toolbox = () => new ServiceToolbox(logistics, issues);
export const agentRiskSummary = (payload: unknown) => safely(() => getRiskSummary(toolbox(), payload));
export const agentShipment = (payload: unknown) => safely(() => getShipment(toolbox(), payload));
export const agentInventory = (payload: unknown) => safely(() => getInventory(toolbox(), payload));
export const agentLinkedIssue = (payload: unknown) => safely(() => getLinkedJiraIssue(toolbox(), payload));
export const agentSimulateDelay = (payload: unknown) => safely(() => simulateDelay(toolbox(), payload));
