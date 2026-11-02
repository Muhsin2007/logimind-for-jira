import Resolver from '@forge/resolver';
import { canManageData, requireDataManager } from './auth/access';
import { LogisticsService } from './services/logistics-service';
import { KvsLogisticsRepository } from './storage/kvs-repository';

const service = new LogisticsService(new KvsLogisticsRepository());
const resolver = new Resolver();

function requireString(payload: unknown, field: string, maxLength: number): string {
  const value = (payload as Record<string, unknown> | null)?.[field];
  if (typeof value !== 'string') throw new Error(`Invalid request: "${field}" must be a string`);
  if (value.length > maxLength) throw new Error(`Invalid request: "${field}" is too long`);
  return value;
}

const accountOf = (context: { accountId?: string } | undefined) => context?.accountId ?? null;

// Reads: any user who can open the page.
resolver.define('getHealth', () => ({ status: 'ok' as const, timestamp: new Date().toISOString() }));
resolver.define('getAccess', async () => ({ canManageData: await canManageData() }));
resolver.define('getDashboard', () => service.getDashboard());
resolver.define('listShipments', () => service.listShipments());
resolver.define('getShipment', ({ payload }) => service.getShipment(requireString(payload, 'id', 64)));
resolver.define('listInventory', () => service.listInventory());
resolver.define('listRisks', () => service.listRisks());
resolver.define('listImports', () => service.listImports());

// Writes replace or delete site-wide data: Jira administrators only, checked server-side.
resolver.define('importCsv', async ({ payload, context }) => {
  const filename = requireString(payload, 'filename', 260);
  const content = requireString(payload, 'content', 1_100_000);
  await requireDataManager();
  return service.importCsv(filename, content, accountOf(context));
});
resolver.define('loadDemoData', async ({ context }) => {
  await requireDataManager();
  return service.loadDemoData(accountOf(context));
});
resolver.define('clearData', async () => {
  await requireDataManager();
  return service.clearData();
});

export const handler = resolver.getDefinitions();
