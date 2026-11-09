import { chat, type Prompt } from '@forge/llm';
import { kvs } from '@forge/kvs';
import { cleanUntrusted } from '../domain/text';
import { LlmUnavailableError, toolArguments, type LlmMessage, type LlmPort, type LlmReply, type LlmRequest } from './llm-port';

/** Atlassian-hosted Claude Haiku: the cheapest Forge LLM, enough for tool use over small DTOs. */
export const LLM_MODEL = 'claude-haiku-4-5-20251001';
/** App-wide cap on model calls per UTC day, so the hackathon budget cannot be run down. */
export const DAILY_CALL_LIMIT = 150;
/** The copilot (open to every viewer) stops here, keeping the rest for admins' column mapping. */
export const COPILOT_SHARE = 120;
/** Model calls per person per day for the copilot (a question takes up to 4). */
export const PER_USER_COPILOT_LIMIT = 40;
const HARD_MAX_TOKENS = 1200;
const TTL = { ttl: { value: 2, unit: 'DAYS' as const } };

type ForgeMessage = Prompt['messages'][number];

/**
 * Forge wants an index per tool call, and — despite the SDK's `arguments: object` type — the
 * API rejects objects when tool calls are sent back (verified live: HTTP 400 "Cannot deserialize
 * value of type String from Object"), so arguments go back as a JSON string.
 */
function toForgeMessage(m: LlmMessage): ForgeMessage {
  if (m.role !== 'assistant') return m;
  if (!m.tool_calls) return { role: 'assistant', content: m.content };
  return {
    role: 'assistant',
    content: m.content,
    tool_calls: m.tool_calls.map((c, index) => ({ id: c.id, type: 'function', index, function: { name: c.function.name, arguments: JSON.stringify(toolArguments(c)) as unknown as object } })),
  };
}

const day = (now: Date) => now.toISOString().slice(0, 10);
const encode = (part: string) => Buffer.from(part, 'utf8').toString('base64url');

/**
 * `@forge/llm` adapter. Every call is counted against daily caps before it is made; if the
 * counters cannot be read the call is refused (fail closed). Counting is best effort: calls
 * racing in parallel may overshoot a cap by a few. Output tokens are capped and token usage is
 * logged so the spend can be read from `forge logs`. Any failure surfaces as `LlmUnavailableError`.
 */
export class ForgeLlm implements LlmPort {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async chat(request: LlmRequest): Promise<LlmReply> {
    const callsToday = await this.reserve(request);

    const prompt: Prompt = {
      model: LLM_MODEL,
      messages: request.messages.map(toForgeMessage),
      max_completion_tokens: Math.min(request.maxTokens, HARD_MAX_TOKENS),
      temperature: 0,
      ...(request.tools ? { tools: request.tools } : {}),
      ...(request.toolChoice ? { tool_choice: request.toolChoice } : {}),
    };

    let response;
    try {
      response = await chat(prompt);
    } catch (err) {
      const status = (err as { status?: unknown }).status;
      // The API message is kept (short, cleaned) because it is the only clue to request bugs.
      console.error('LogiMind LLM call failed', {
        purpose: request.purpose,
        status,
        error: err instanceof Error ? err.name : typeof err,
        message: cleanUntrusted(err instanceof Error ? err.message : String(err), 200),
      });
      throw new LlmUnavailableError('the AI model is not available right now');
    }
    const choice = response.choices?.[0];
    console.log('LogiMind LLM usage', {
      purpose: request.purpose,
      model: LLM_MODEL,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      finishReason: choice?.finish_reason,
      callsToday,
    });
    if (!choice) throw new LlmUnavailableError('the AI model returned no answer');
    const content = choice.message.content;
    return {
      content: typeof content === 'string' ? content : (content ?? []).map((p) => p.text ?? '').join(''),
      toolCalls: (choice.message.tool_calls ?? []).map((c) => ({ id: c.id, type: 'function' as const, function: c.function })),
      finishReason: choice.finish_reason,
    };
  }

  /** Checks and increments the caps; returns the app-wide count including this call. */
  private async reserve(request: LlmRequest): Promise<number> {
    const date = day(this.now());
    const appKey = `llm-calls:${date}`;
    // Person-initiated calls (copilot questions, follow-up drafts) share the per-user and copilot caps.
    const personal = request.purpose !== 'column-mapping';
    const userKey = personal ? `llm-calls:${date}:${encode(request.accountId ?? 'anonymous')}` : null;
    let app: number;
    let user: number;
    try {
      const [a, u] = await Promise.all([kvs.get<{ count: number }>(appKey), userKey ? kvs.get<{ count: number }>(userKey) : undefined]);
      app = a?.count ?? 0;
      user = u?.count ?? 0;
    } catch (err) {
      console.error('LogiMind LLM budget unreadable; refusing the call', { purpose: request.purpose, error: err instanceof Error ? err.name : typeof err });
      throw new LlmUnavailableError('the AI usage limit could not be checked');
    }
    const appLimit = personal ? COPILOT_SHARE : DAILY_CALL_LIMIT;
    if (app >= appLimit) throw new LlmUnavailableError('the daily AI usage limit is reached');
    if (userKey && user >= PER_USER_COPILOT_LIMIT) throw new LlmUnavailableError('your daily AI question limit is reached');
    try {
      await Promise.all([kvs.set(appKey, { count: app + 1 }, TTL), userKey ? kvs.set(userKey, { count: user + 1 }, TTL) : undefined]);
    } catch (err) {
      console.error('LogiMind LLM budget not updated; refusing the call', { purpose: request.purpose, error: err instanceof Error ? err.name : typeof err });
      throw new LlmUnavailableError('the AI usage limit could not be checked');
    }
    return app + 1;
  }
}
