import Resolver from '@forge/resolver';
import { canManageData, requireDataManager } from './auth/access';
import { ForgeJiraGateway } from './jira/forge-jira-gateway';
import { IssueService, ISSUE_KEY } from './services/issue-service';
import { LogisticsService } from './services/logistics-service';
import { KvsIssueLinkRepository } from './storage/kvs-issue-links';
import { KvsLogisticsRepository } from './storage/kvs-repository';

const logistics = new LogisticsService(new KvsLogisticsRepository());
const issues = new IssueService(logistics, new KvsIssueLinkRepository(), new ForgeJiraGateway());
const resolver = new Resolver();

function requireString(payload: unknown, field: string, maxLength: number): string {
  const value = (payload as Record<string, unknown> | null)?.[field];
  if (typeof value !== 'string') throw new Error(`Invalid request: "${field}" must be a string`);
  if (value.length > maxLength) throw new Error(`Invalid request: "${field}" is too long`);
  return value;
}

type Context = { accountId?: string; extension?: { issue?: { key?: string } } };
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

// Issue creation runs as the user, so Jira's own project permissions decide who may create.
resolver.define('createIssueForRisk', ({ payload, context }) =>
  issues.createIssueForRisk(requireString(payload, 'riskId', 200), accountOf(context)),
);

// The issue sidebar trusts only the issue key from Forge's server-side context, never the payload.
resolver.define('getIssueContext', ({ context }) => {
  const key = (context as Context | undefined)?.extension?.issue?.key;
  if (!key || !ISSUE_KEY.test(key)) throw new Error('This view is only available on a Jira issue');
  return issues.getIssueContext(key);
});

// Writes that change site-wide data or settings: Jira administrators only, checked server-side.
resolver.define('importCsv', async ({ payload, context }) => {
  const filename = requireString(payload, 'filename', 260);
  const content = requireString(payload, 'content', 1_100_000);
  await requireDataManager();
  return logistics.importCsv(filename, content, accountOf(context));
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
