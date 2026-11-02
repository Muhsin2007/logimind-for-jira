import Resolver from '@forge/resolver';
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

resolver.define('getHealth', () => ({ status: 'ok' as const, timestamp: new Date().toISOString() }));
resolver.define('getDashboard', () => service.getDashboard());
resolver.define('listShipments', () => service.listShipments());
resolver.define('getShipment', ({ payload }) => service.getShipment(requireString(payload, 'id', 64)));
resolver.define('listInventory', () => service.listInventory());
resolver.define('listRisks', () => service.listRisks());
resolver.define('listImports', () => service.listImports());
resolver.define('importCsv', ({ payload }) =>
  service.importCsv(requireString(payload, 'filename', 260), requireString(payload, 'content', 1_100_000)),
);
resolver.define('loadDemoData', () => service.loadDemoData());
resolver.define('clearData', () => service.clearData());

export const handler = resolver.getDefinitions();
