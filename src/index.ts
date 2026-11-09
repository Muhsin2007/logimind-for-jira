import Resolver from '@forge/resolver';
import { ColumnMapper } from './ai/column-mapper';
import { FollowUpDrafter } from './ai/follow-up-drafter';
import { getInventory, getLinkedJiraIssue, getRiskSummary, getShipment, safely, simulateDelay } from './agent/actions';
import { ForbiddenError } from './auth/access';
import { LlmCopilot } from './copilot/llm-copilot';
import { MAX_QUESTION } from './copilot/rule-based-copilot';
import { ServiceToolbox } from './copilot/tools';
import { MAX_COLUMNS } from './domain/column-mapping';
import { followUpFacts } from './domain/follow-up';
import { RoleError } from './domain/roles';
import { ForgeJiraGateway } from './jira/forge-jira-gateway';
import { ForgeUserDirectory } from './jira/forge-user-directory';
import { ForgeLlm } from './llm/forge-llm';
import type { RoleOutcome } from './shared/api';
import { RoleService } from './services/role-service';
import { KvsRoleStore } from './storage/kvs-role-store';
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
const roles = new RoleService(new KvsRoleStore(), new ForgeUserDirectory());
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
resolver.define('getAccess', ({ context }) => roles.access(accountOf(context)));
resolver.define('getRoles', () => roles.getRoles());

// Roles: the owner manages managers; Jira site admins may claim or take over ownership.
// RoleService checks the caller on the server and again on the state read under the roles lock.
async function roleChange(change: () => Promise<void>): Promise<RoleOutcome> {
  try {
    await change();
    return { ok: true };
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, code: 'FORBIDDEN', message: err.message };
    if (err instanceof RoleError) return { ok: false, code: err.code, message: err.message };
    // Jira or storage failures: logged here, a generic outcome for the caller.
    console.warn('LogiMind role change failed', { error: err instanceof Error ? err.message : String(err) });
    return { ok: false, code: 'UNKNOWN', message: 'Jira or LogiMind storage did not answer. Try again.' };
  }
}
const targetOf = (payload: unknown) => (payload as Record<string, unknown> | null)?.accountId;
resolver.define('claimOwnership', ({ payload, context }) =>
  roleChange(() => roles.claimOwnership(accountOf(context), (payload as Record<string, unknown> | null)?.expectOwner)),
);
resolver.define('addManager', ({ payload, context }) => roleChange(() => roles.addManager(accountOf(context), targetOf(payload))));
resolver.define('removeManager', ({ payload, context }) => roleChange(() => roles.removeManager(accountOf(context), targetOf(payload))));
resolver.define('transferOwnership', ({ payload, context }) => roleChange(() => roles.transferOwnership(accountOf(context), targetOf(payload))));
resolver.define('searchUsers', async ({ payload, context }) => {
  try {
    return { ok: true as const, users: await roles.searchUsers(accountOf(context), (payload as Record<string, unknown> | null)?.query) };
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false as const, code: 'FORBIDDEN' as const, message: err.message };
    if (err instanceof RoleError) return { ok: false as const, code: 'INVALID' as const, message: err.message };
    console.warn('LogiMind people search failed', { error: err instanceof Error ? err.message : String(err) });
    return { ok: false as const, code: 'UNKNOWN' as const, message: 'Jira could not search people right now.' };
  }
});
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

// Issue creation runs as the user, so Jira's own project permissions decide who may create; it is not
// a LogiMind role right (viewers who may create issues in Jira can create one per risk, see D21).
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

// Writes that change site-wide data or settings: the LogiMind owner and managers (Jira admins until an owner is set), checked server-side.
resolver.define('importCsv', async ({ payload, context }) => {
  const filename = requireString(payload, 'filename', 260);
  const content = requireString(payload, 'content', 1_100_000);
  await roles.requireDataManager(accountOf(context));
  return logistics.importCsv(filename, content, accountOf(context));
});
// AI column mapping costs a model call, so it is limited to the people who may import.
resolver.define('proposeColumnMapping', async ({ payload, context }) => {
  const content = requireString(payload, 'content', 1_100_000);
  await roles.requireDataManager(accountOf(context));
  return new ColumnMapper(llm).propose(content);
});
resolver.define('importCsvWithMapping', async ({ payload, context }) => {
  const filename = requireString(payload, 'filename', 260);
  const content = requireString(payload, 'content', 1_100_000);
  const kind = requireString(payload, 'kind', 20);
  if (kind !== 'shipments' && kind !== 'inventory') throw new Error('Invalid request: "kind" must be shipments or inventory');
  const mapping = requireMapping(payload);
  await roles.requireDataManager(accountOf(context));
  return logistics.importCsvWithMapping(filename, content, kind, mapping, accountOf(context));
});
resolver.define('loadDemoData', async ({ context }) => {
  await roles.requireDataManager(accountOf(context));
  return logistics.loadDemoData(accountOf(context));
});
resolver.define('clearData', async ({ context }) => {
  await roles.requireDataManager(accountOf(context));
  const result = await logistics.clearData();
  await issues.clearLinks();
  // The daily check forgets its snapshots too, so the next check is a baseline, not "everything resolved".
  await dailyCheck.clear().catch((err: unknown) => {
    if (!(err instanceof CheckBusyError)) throw err;
    console.warn('LogiMind clear data: daily check running, its state is kept');
  });
  return result;
});
resolver.define('listJiraProjects', async ({ context }) => {
  await roles.requireDataManager(accountOf(context));
  return issues.listProjects();
});
resolver.define('listJiraIssueTypes', async ({ payload, context }) => {
  await roles.requireDataManager(accountOf(context));
  return issues.listIssueTypes(requireString(payload, 'projectKey', 20));
});
resolver.define('saveJiraConfig', async ({ payload, context }) => {
  const projectKey = requireString(payload, 'projectKey', 20);
  const issueTypeId = requireString(payload, 'issueTypeId', 20);
  await roles.requireDataManager(accountOf(context));
  return issues.saveConfig(projectKey, issueTypeId, accountOf(context));
});

// Daily check: the briefing is readable by everyone; running it and the auto-create switch need the data-manager role.
resolver.define('getDailyBriefing', () => dailyCheck.getBriefing());
resolver.define('runDailyCheck', async ({ context }) => {
  await roles.requireDataManager(accountOf(context));
  try {
    return { ok: true as const, run: await dailyCheck.run('manual') };
  } catch (err) {
    if (err instanceof CheckBusyError) return { ok: false as const, code: 'BUSY' as const, message: err.message };
    throw err;
  }
});
resolver.define('getLoopSettings', async ({ context }) => {
  await roles.requireDataManager(accountOf(context));
  const { autoCreate, updatedAt } = await dailyCheck.getSettings();
  return { autoCreate, updatedAt };
});
resolver.define('saveLoopSettings', async ({ payload, context }) => {
  const autoCreate = (payload as Record<string, unknown> | null)?.autoCreate;
  if (typeof autoCreate !== 'boolean') throw new Error('Invalid request: "autoCreate" must be true or false');
  await roles.requireDataManager(accountOf(context));
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
