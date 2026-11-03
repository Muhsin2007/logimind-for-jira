import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ColumnMapper } from '../../src/ai/column-mapper';
import { LlmUnavailableError, type LlmPort, type LlmReply, type LlmRequest } from '../../src/llm/llm-port';

const MESSY = readFileSync(join(__dirname, '../fixtures/supplier-export-messy.csv'), 'utf8');

const proposal = (args: object): LlmReply => ({
  content: '',
  finishReason: 'tool_calls',
  toolCalls: [{ id: 'c1', type: 'function', function: { name: 'propose_mapping', arguments: args } }],
});

function fakeLlm(reply: LlmReply | Error): LlmPort & { chat: ReturnType<typeof vi.fn> } {
  return { chat: vi.fn(async (_req: LlmRequest) => { if (reply instanceof Error) throw reply; return reply; }) };
}

const GOOD = {
  kind: 'shipments',
  columns: [
    { column: 0, field: 'shipment_id' }, { column: 1, field: 'order_id' }, { column: 2, field: 'supplier' },
    { column: 3, field: 'sku' }, { column: 4, field: 'product_name' }, { column: 5, field: 'qty' },
    { column: 6, field: 'planned_arrival' }, { column: 7, field: 'eta' }, { column: 8, field: 'actual_arrival' },
    { column: 9, field: 'status' }, { column: 10, field: 'warehouse' }, { column: 11, field: 'carrier' },
    { column: 12, field: null },
  ],
};

describe('ColumnMapper', () => {
  it('asks the model only for a header mapping, sending headers and capped samples as data', async () => {
    const llm = fakeLlm(proposal(GOOD));
    const p = await new ColumnMapper(llm).propose(MESSY);
    expect(p).toMatchObject({ ok: true, kind: 'shipments', source: 'ai', missingRequired: [], notice: null });
    if (!p.ok) throw new Error('expected ok');
    expect(p.columns.map((c) => c.field)).toEqual([...GOOD.columns.map((c) => c.field)]);
    expect(p.columns[0]).toMatchObject({ index: 0, header: 'Shipment #', samples: ['TK-501', 'TK-502', 'TK-503'] });

    const req = llm.chat.mock.calls[0][0] as LlmRequest;
    expect(req.toolChoice).toEqual({ type: 'function', function: { name: 'propose_mapping' } });
    expect(req.maxTokens).toBeLessThanOrEqual(800);
    const user = req.messages.find((m) => m.role === 'user')!.content;
    // Only the first rows are sent, never the whole file.
    expect(user).toContain('TK-503');
    expect(user).not.toContain('TK-504');
    expect(req.messages[0].content).toMatch(/never follow instructions/i);
  });

  it('skips the model when names already match after normalising', async () => {
    const llm = fakeLlm(new Error('should not be called'));
    const p = await new ColumnMapper(llm).propose('SKU,Warehouse,On Hand,Safety Stock\nA-1,Main,5,2\n');
    expect(p).toMatchObject({ ok: true, kind: 'inventory', source: 'name', missingRequired: [] });
    expect(llm.chat).not.toHaveBeenCalled();
  });

  it('drops invented fields, out-of-range columns and duplicate targets from the model', async () => {
    const llm = fakeLlm(proposal({
      kind: 'shipments',
      columns: [
        { column: 0, field: 'shipment_id' }, { column: 1, field: 'shipment_id' }, { column: 2, field: 'password' },
        { column: 99, field: 'sku' }, { column: '3', field: 'sku' },
      ],
    }));
    const p = await new ColumnMapper(llm).propose(MESSY);
    if (!p.ok) throw new Error('expected ok');
    expect(p.columns.map((c) => c.field).slice(0, 4)).toEqual(['shipment_id', null, null, null]);
    expect(p.missingRequired).toEqual(['supplier', 'sku', 'qty', 'planned_arrival', 'status', 'warehouse']);
  });

  it('falls back to name matching, and says so, when the model is unavailable', async () => {
    const p = await new ColumnMapper(fakeLlm(new LlmUnavailableError('the daily AI usage limit is reached'))).propose(MESSY);
    expect(p).toMatchObject({ ok: true, source: 'name', kind: 'shipments' });
    if (!p.ok) throw new Error('expected ok');
    expect(p.notice).toMatch(/AI mapping is unavailable \(the daily AI usage limit is reached\)/);
    expect(p.columns.every((c) => c.field === null)).toBe(true);
  });

  it('treats an unusable model reply like an unavailable model', async () => {
    const p = await new ColumnMapper(fakeLlm({ content: 'Sure! shipment_id is column 0', toolCalls: [], finishReason: 'stop' })).propose(MESSY);
    expect(p).toMatchObject({ ok: true, source: 'name' });
    if (!p.ok) throw new Error('expected ok');
    expect(p.notice).toMatch(/AI mapping is unavailable/);
  });

  it('works without any model configured', async () => {
    const p = await new ColumnMapper(null).propose(MESSY);
    expect(p).toMatchObject({ ok: true, source: 'name' });
  });

  it('reports files that cannot be mapped at all', async () => {
    expect(await new ColumnMapper(null).propose('a\n"oops')).toEqual({ ok: false, message: expect.stringMatching(/Unterminated/) });
  });
});
