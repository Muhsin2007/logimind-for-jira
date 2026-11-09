import { beforeEach, describe, expect, it, vi } from 'vitest';

const kvs = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
const chat = vi.hoisted(() => vi.fn());
vi.mock('@forge/kvs', () => ({ kvs }));
vi.mock('@forge/llm', () => ({ chat }));

import { COPILOT_SHARE, DAILY_CALL_LIMIT, ForgeLlm, LLM_MODEL, PER_USER_COPILOT_LIMIT } from '../../src/llm/forge-llm';
import { LlmUnavailableError, toolArguments, type LlmRequest } from '../../src/llm/llm-port';

const NOW = new Date('2026-11-03T10:00:00Z');
const MAPPING: LlmRequest = { purpose: 'column-mapping', maxTokens: 5000, messages: [{ role: 'user', content: 'hi' }] };
const COPILOT: LlmRequest = { ...MAPPING, purpose: 'copilot', accountId: 'acc-1' };
const USER_KEY = `llm-calls:2026-11-03:${Buffer.from('acc-1').toString('base64url')}`;

const ok = { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'ok' } }], usage: { input_tokens: 10, output_tokens: 2 } };

/** KVS counters by key. */
function counters(values: Record<string, number>) {
  kvs.get.mockImplementation(async (key: string) => (key in values ? { count: values[key] } : undefined));
}

describe('ForgeLlm', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    counters({ 'llm-calls:2026-11-03': 3 });
    kvs.set.mockResolvedValue(undefined);
    chat.mockResolvedValue(ok);
  });

  it('calls Haiku with capped tokens, counts the call and maps tool calls both ways', async () => {
    chat.mockResolvedValue({
      choices: [{ finish_reason: 'tool_use', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }], tool_calls: [{ id: 't1', type: 'function', index: 0, function: { name: 'x', arguments: { a: 1 } } }] } }],
      usage: { input_tokens: 10, output_tokens: 2 },
    });
    const reply = await new ForgeLlm(() => NOW).chat({
      ...MAPPING,
      toolChoice: 'required',
      tools: [],
      messages: [{ role: 'assistant', content: 'calling', tool_calls: [{ id: 'p1', type: 'function', function: { name: 'y', arguments: '{"b":2}' } }] }],
    });
    expect(chat).toHaveBeenCalledWith(expect.objectContaining({
      model: LLM_MODEL,
      max_completion_tokens: 1200,
      temperature: 0,
      tool_choice: 'required',
      messages: [{ role: 'assistant', content: 'calling', tool_calls: [{ id: 'p1', type: 'function', index: 0, function: { name: 'y', arguments: '{"b":2}' } }] }],
    }));
    expect(kvs.set).toHaveBeenCalledWith('llm-calls:2026-11-03', { count: 4 }, { ttl: { value: 2, unit: 'DAYS' } });
    expect(reply).toEqual({ content: 'ok', finishReason: 'tool_use', toolCalls: [{ id: 't1', type: 'function', function: { name: 'x', arguments: { a: 1 } } }] });
  });

  it('refuses any call once the app-wide daily limit is reached', async () => {
    counters({ 'llm-calls:2026-11-03': DAILY_CALL_LIMIT });
    await expect(new ForgeLlm(() => NOW).chat(MAPPING)).rejects.toThrow('the daily AI usage limit is reached');
    expect(chat).not.toHaveBeenCalled();
  });

  it('keeps a reserve for admins: the copilot stops earlier than column mapping', async () => {
    counters({ 'llm-calls:2026-11-03': COPILOT_SHARE });
    await expect(new ForgeLlm(() => NOW).chat(COPILOT)).rejects.toThrow(LlmUnavailableError);
    await expect(new ForgeLlm(() => NOW).chat(MAPPING)).resolves.toMatchObject({ content: 'ok' });
  });

  it('limits copilot calls per person and counts them per person', async () => {
    counters({ 'llm-calls:2026-11-03': 3, [USER_KEY]: 5 });
    await new ForgeLlm(() => NOW).chat(COPILOT);
    expect(kvs.set).toHaveBeenCalledWith(USER_KEY, { count: 6 }, expect.anything());
    counters({ 'llm-calls:2026-11-03': 3, [USER_KEY]: PER_USER_COPILOT_LIMIT });
    await expect(new ForgeLlm(() => NOW).chat(COPILOT)).rejects.toThrow('your daily AI question limit is reached');
  });

  it('counts follow-up drafts against the same per-person and copilot caps', async () => {
    const FOLLOW_UP: LlmRequest = { ...COPILOT, purpose: 'follow-up' };
    counters({ 'llm-calls:2026-11-03': 3, [USER_KEY]: PER_USER_COPILOT_LIMIT });
    await expect(new ForgeLlm(() => NOW).chat(FOLLOW_UP)).rejects.toThrow(LlmUnavailableError);
    counters({ 'llm-calls:2026-11-03': COPILOT_SHARE });
    await expect(new ForgeLlm(() => NOW).chat(FOLLOW_UP)).rejects.toThrow(LlmUnavailableError);
  });

  it('fails closed when the usage counters cannot be read or written', async () => {
    kvs.get.mockRejectedValue(new Error('kvs down'));
    await expect(new ForgeLlm(() => NOW).chat(MAPPING)).rejects.toThrow('the AI usage limit could not be checked');
    counters({});
    kvs.set.mockRejectedValue(new Error('kvs down'));
    await expect(new ForgeLlm(() => NOW).chat(MAPPING)).rejects.toThrow('the AI usage limit could not be checked');
    expect(chat).not.toHaveBeenCalled();
  });

  it('reports API failures as unavailable without exposing their details', async () => {
    chat.mockRejectedValue(Object.assign(new Error('internal trace 123'), { status: 500 }));
    await expect(new ForgeLlm(() => NOW).chat(MAPPING)).rejects.toThrow('the AI model is not available right now');
  });

  it('treats a reply without choices as unavailable', async () => {
    chat.mockResolvedValue({ choices: [] });
    await expect(new ForgeLlm(() => NOW).chat(MAPPING)).rejects.toThrow(LlmUnavailableError);
  });
});

describe('toolArguments', () => {
  const call = (args: object | string) => ({ id: 'c', type: 'function' as const, function: { name: 'f', arguments: args } });
  it('accepts objects and JSON strings, and ignores anything else', () => {
    expect(toolArguments(call({ a: 1 }))).toEqual({ a: 1 });
    expect(toolArguments(call('{"a":1}'))).toEqual({ a: 1 });
    expect(toolArguments(call('not json'))).toEqual({});
    expect(toolArguments(call('[1]'))).toEqual({});
    expect(toolArguments(call([1] as unknown as object))).toEqual({});
  });
});
