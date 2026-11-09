/**
 * The only way application code talks to a language model. Shapes mirror `@forge/llm`
 * (OpenAI-style messages and function tools) so the Forge adapter is a thin pass-through,
 * and tests substitute a scripted fake.
 */

export interface LlmToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: object | string };
}

export type LlmMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: LlmToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string; name: string };

export interface LlmTool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export type LlmToolChoice = 'auto' | 'required' | { type: 'function'; function: { name: string } };

export interface LlmRequest {
  /** Which feature calls; also selects the usage limits that apply. */
  purpose: 'copilot' | 'column-mapping' | 'follow-up';
  /** The asking user, for per-user limits (copilot, follow-up). */
  accountId?: string | null;
  messages: LlmMessage[];
  tools?: LlmTool[];
  toolChoice?: LlmToolChoice;
  maxTokens: number;
}

export interface LlmReply {
  content: string;
  toolCalls: LlmToolCall[];
  finishReason: string;
}

export interface LlmPort {
  chat(request: LlmRequest): Promise<LlmReply>;
}

/** The model could not be used (not provisioned, limit reached, API failure). Callers fall back. */
export class LlmUnavailableError extends Error {}

/** Tool arguments arrive as an object from Forge, but tolerate a JSON string. */
export function toolArguments(call: LlmToolCall): Record<string, unknown> {
  const raw = call.function.arguments;
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}
