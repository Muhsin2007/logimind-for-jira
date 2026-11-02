import Resolver from '@forge/resolver';

export interface HealthResponse {
  app: 'LogiMind for Jira';
  status: 'ok';
  accountId: string | null;
  timestamp: string;
}

const resolver = new Resolver();

resolver.define('getHealth', ({ context }): HealthResponse => ({
  app: 'LogiMind for Jira',
  status: 'ok',
  accountId: context?.accountId ?? null,
  timestamp: new Date().toISOString(),
}));

export const handler = resolver.getDefinitions();
