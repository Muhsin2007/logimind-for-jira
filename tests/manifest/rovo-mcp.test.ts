import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

/**
 * Guards the Atlassian MCP surface (rovo:mcp). The MCP tools reuse the Rovo agent's action
 * modules one-to-one, so the same validated, read-only handlers serve both channels.
 */

interface ActionModule { key: string; function: string; actionVerb: string }
interface FunctionModule { key: string; handler: string }
interface Manifest {
  modules: {
    'rovo:mcp'?: Array<{ key: string; name: string; tools: string[] }>;
    'rovo:agent': Array<{ key: string; actions: string[] }>;
    action: ActionModule[];
    function: FunctionModule[];
  };
  permissions: { scopes: string[] };
}

const manifest = parse(readFileSync(resolve(__dirname, '../../manifest.yml'), 'utf8')) as Manifest;
const indexSource = readFileSync(resolve(__dirname, '../../src/index.ts'), 'utf8');
const READ_ONLY_TOOLS = ['get-risk-summary', 'get-shipment', 'get-inventory', 'get-linked-jira-issue', 'simulate-delay'];

describe('rovo:mcp module', () => {
  const mcp = manifest.modules['rovo:mcp'] ?? [];
  const server = () => {
    expect(mcp, 'rovo:mcp module is missing').toHaveLength(1);
    return mcp[0];
  };

  it('declares exactly one MCP server with a valid key and a name of at most 30 characters', () => {
    expect(server().key).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(server().name.length).toBeGreaterThan(0);
    expect(server().name.length).toBeLessThanOrEqual(30);
  });

  it('exposes exactly the five read-only LogiMind tools', () => {
    expect([...server().tools].sort()).toEqual([...READ_ONLY_TOOLS].sort());
  });

  it('only references GET actions whose functions exist and are the agent handlers', () => {
    const functions = new Map(manifest.modules.function.map((f) => [f.key, f.handler]));
    for (const tool of server().tools) {
      const action = manifest.modules.action.find((a) => a.key === tool);
      expect(action, tool).toBeDefined();
      expect(action!.actionVerb).toBe('GET');
      // Forge requires action keys under 64 characters (exclusive).
      expect(action!.key.length).toBeLessThan(64);
      const handler = functions.get(action!.function) ?? '';
      expect(handler).toMatch(/^index\.agent[A-Za-z]+$/);
      const exported = handler.slice('index.'.length);
      expect(indexSource, `${exported} must be exported from src/index.ts`).toMatch(new RegExp(`export const ${exported} = `));
    }
  });

  it('keeps the Rovo agent unchanged and on the same actions', () => {
    const agent = manifest.modules['rovo:agent'];
    expect(agent).toHaveLength(1);
    expect(agent[0].key).toBe('logimind-agent');
    expect([...agent[0].actions].sort()).toEqual([...READ_ONLY_TOOLS].sort());
  });

  it('adds no new OAuth scopes', () => {
    expect([...manifest.permissions.scopes].sort()).toEqual(
      ['read:jira-user', 'read:jira-work', 'storage:app', 'write:jira-work'].sort(),
    );
  });
});
