import { chat, type Prompt } from '@forge/llm';
import { kvs } from '@forge/kvs';
import { LlmUnavailableError, type LlmPort, type LlmReply, type LlmRequest } from './llm-port';

/** Atlassian-hosted Claude Haiku: the cheapest Forge LLM, enough for tool use over small DTOs. */
export const LLM_MODEL = 'claude-haiku-4-5-20251001';
/** App-wide soft cap on model calls per UTC day, so the hackathon budget cannot be run down. */
export const DAILY_CALL_LIMIT = 150;
const HARD_MAX_TOKENS = 1200;

const counterKey = (now: Date) => `llm-calls:${now.toISOString().slice(0, 10)}`;

/**
 * `@forge/llm` adapter. Every call is counted against a daily cap (best effort: concurrent
 * calls may overshoot slightly), output tokens are capped, and token usage is logged so the
 * spend can be read from `forge logs`. Any failure surfaces as `LlmUnavailableError`.
 */
export class ForgeLlm implements LlmPort {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async chat(request: LlmRequest): Promise<LlmReply> {
    const key = counterKey(this.now());
    const used = (await kvs.get<{ count: number }>(key).catch(() => undefined))?.count ?? 0;
    if (used >= DAILY_CALL_LIMIT) throw new LlmUnavailableError('the daily AI usage limit is reached');
    await kvs.set(key, { count: used + 1 }, { ttl: { value: 2, unit: 'DAYS' } }).catch(() => undefined);

    const prompt: Prompt = {
      model: LLM_MODEL,
      messages: request.messages,
      max_completion_tokens: Math.min(request.maxTokens, HARD_MAX_TOKENS),
      temperature: 0,
      ...(request.tools ? { tools: request.tools } : {}),
      ...(request.toolChoice ? { tool_choice: request.toolChoice } : {}),
    } as Prompt;

    let response;
    try {
      response = await chat(prompt);
    } catch (err) {
      const status = (err as { status?: unknown }).status;
      console.error('LogiMind LLM call failed', { purpose: request.purpose, status, message: err instanceof Error ? err.message : String(err) });
      throw new LlmUnavailableError('the AI model is not available right now');
    }
    const choice = response.choices?.[0];
    console.log('LogiMind LLM usage', {
      purpose: request.purpose,
      model: LLM_MODEL,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      finishReason: choice?.finish_reason,
      callsToday: used + 1,
    });
    if (!choice) throw new LlmUnavailableError('the AI model returned no answer');
    const content = choice.message.content;
    return {
      content: typeof content === 'string' ? content : (content ?? []).map((p) => p.text).join(''),
      toolCalls: (choice.message.tool_calls ?? []).map((c) => ({ id: c.id, type: 'function' as const, function: c.function })),
      finishReason: choice.finish_reason,
    };
  }
}
