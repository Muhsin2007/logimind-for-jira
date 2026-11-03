import Resolver from '@forge/resolver';
import { ColumnMapper } from './ai/column-mapper';
import { getInventory, getLinkedJiraIssue, getRiskSummary, getShipment, safely } from './agent/actions';
import { canManageData, requireDataManager } from './auth/access';
import { LlmCopilot } from './copilot/llm-copilot';
import { MAX_QUESTION } from './copilot/rule-based-copilot';
import { ServiceToolbox } from './copilot/tools';
import { MAX_COLUMNS } from './domain/column-mapping';
import type { ImportKind } from './domain/types';
import { ForgeJiraGateway } from './jira/forge-jira-gateway';
import { ForgeLlm } from './llm/forge-llm';
import { IssueService, ISSUE_ID } from './services/issue-service';
import { LogisticsService } from './services/logistics-service';
import { KvsIssueLinkRepository } from './storage/kvs-issue-links';
import { KvsLogisticsRepository } from './storage/kvs-repository';

const logistics = new LogisticsService(new KvsLogisticsRepository());
const issues = new IssueService(logistics, new KvsIssueLinkRepository(), new ForgeJiraGateway());
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
resolver.define('askCopilot', ({ payload }) =>
  new LlmCopilot(new ServiceToolbox(logistics, issues), llm).ask(requireString(payload, 'question', MAX_QUESTION)),
);

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
  return logistics.importCsvWithMapping(filename, content, kind as ImportKind, mapping, accountOf(context));
});
resolver.define('loadDemoData', async ({ context }) => {
  await requireDataManager();
  return logistics.loadDemoData(accountOf(context));
});
resolver.define('clearData', async () => {
  await requireDataManager();
  const result = await logistics.clearData();
  await issues.clearLinks();
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

export const handler = resolver.getDefinitions();

// Rovo agent actions (read-only). Each request gets its own toolbox: one consistent data read.
const toolbox = () => new ServiceToolbox(logistics, issues);
export const agentRiskSummary = (payload: unknown) => safely(() => getRiskSummary(toolbox(), payload));
export const agentShipment = (payload: unknown) => safely(() => getShipment(toolbox(), payload));
export const agentInventory = (payload: unknown) => safely(() => getInventory(toolbox(), payload));
export const agentLinkedIssue = (payload: unknown) => safely(() => getLinkedJiraIssue(toolbox(), payload));
