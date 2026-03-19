// ============================================================
// LLM Client — OpenAI & Anthropic (streaming + tool_use)
// ============================================================

import type { ToolDefinition, LLMNonStreamResult, LLMToolCall, TokenUsage } from "./tools";

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | LLMContentBlock[];
  // OpenAI tool call fields
  tool_call_id?: string;
  tool_calls?: OpenAIToolCall[];
  // Anthropic: for assistant messages with tool_use blocks
  name?: string;
}

export interface LLMContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

export type LLMProvider = "openai" | "anthropic";

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

// ============================================================
// Stream Options
// ============================================================

interface BaseOptions {
  provider: LLMProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: LLMMessage[];
  tools?: ToolDefinition[];
  timeoutMs?: number;
}

export type StreamOptions = BaseOptions;
export type CallOptions = BaseOptions;

// ============================================================
// Non-streaming call (used for tool_use loop)
// ============================================================

export async function callLLM(opts: CallOptions): Promise<LLMNonStreamResult> {
  if (opts.provider === "anthropic") {
    return callAnthropic(opts);
  }
  return callOpenAI(opts);
}

async function callOpenAI(opts: CallOptions): Promise<LLMNonStreamResult> {
  const { baseUrl, apiKey, model, messages, tools, timeoutMs = 60_000 } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
    const body: Record<string, unknown> = { model, messages: messages.map(toOpenAIMessage), stream: false };
    if (tools?.length) {
      body.tools = tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      body.tool_choice = "auto";
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`OpenAI API ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json() as {
      choices: Array<{
        message: { role: string; content: string | null; tool_calls?: OpenAIToolCall[] };
        finish_reason: string;
      }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const usage: TokenUsage = {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
    };

    const choice = data.choices[0];
    if (choice.finish_reason === "tool_calls" && choice.message.tool_calls?.length) {
      const calls: LLMToolCall[] = choice.message.tool_calls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments || "{}"),
      }));
      return { type: "tool_calls", calls, partialText: choice.message.content ?? undefined, usage };
    }

    return { type: "text", content: choice.message.content ?? "", usage };
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropic(opts: CallOptions): Promise<LLMNonStreamResult> {
  const { baseUrl, apiKey, model, messages, tools, timeoutMs = 60_000 } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const systemPrompt = messages.find((m) => m.role === "system");
  const chatMessages = messages.filter((m) => m.role !== "system").map(toAnthropicMessage);

  try {
    const url = `${baseUrl.replace(/\/+$/, "")}/v1/messages`;
    const body: Record<string, unknown> = {
      model,
      max_tokens: 4096,
      ...(systemPrompt && { system: typeof systemPrompt.content === "string" ? systemPrompt.content : "" }),
      messages: chatMessages,
    };
    if (tools?.length) {
      body.tools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json() as {
      content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
      stop_reason: string;
      usage?: { input_tokens: number; output_tokens: number };
    };

    const usage: TokenUsage = {
      promptTokens: data.usage?.input_tokens ?? 0,
      completionTokens: data.usage?.output_tokens ?? 0,
    };

    if (data.stop_reason === "tool_use") {
      const textBlock = data.content.find((b) => b.type === "text");
      const toolBlocks = data.content.filter((b) => b.type === "tool_use");
      const calls: LLMToolCall[] = toolBlocks.map((b) => ({
        id: b.id!,
        name: b.name!,
        arguments: b.input ?? {},
      }));
      return { type: "tool_calls", calls, partialText: textBlock?.text, usage };
    }

    const textContent = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return { type: "text", content: textContent, usage };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// Streaming call (for final text response)
// ============================================================

export async function* streamLLMResponse(opts: StreamOptions): AsyncGenerator<string | { usage: TokenUsage }> {
  if (opts.provider === "anthropic") {
    yield* streamAnthropic(opts);
  } else {
    yield* streamOpenAI(opts);
  }
}

async function* streamOpenAI(opts: StreamOptions): AsyncGenerator<string | { usage: TokenUsage }> {
  const { baseUrl, apiKey, model, messages, timeoutMs = 60_000 } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: messages.map(toOpenAIMessage), stream: true, stream_options: { include_usage: true } }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`OpenAI API ${res.status}: ${errText.slice(0, 200)}`);
    }

    yield* parseSSEStream(res.body!, parseOpenAIChunk);
  } finally {
    clearTimeout(timer);
  }
}

function parseOpenAIChunk(data: string): string | { usage: TokenUsage } | null {
  if (data === "[DONE]") return null;
  try {
    const parsed = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    // Usage comes in the last chunk with usage object
    if (parsed.usage && (!parsed.choices || parsed.choices.length === 0)) {
      return { usage: { promptTokens: parsed.usage.prompt_tokens, completionTokens: parsed.usage.completion_tokens } };
    }
    return parsed.choices?.[0]?.delta?.content ?? null;
  } catch {
    return null;
  }
}

async function* streamAnthropic(opts: StreamOptions): AsyncGenerator<string | { usage: TokenUsage }> {
  const { baseUrl, apiKey, model, messages, timeoutMs = 60_000 } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const systemPrompt = messages.find((m) => m.role === "system")?.content;
  const chatMessages = messages.filter((m) => m.role !== "system").map(toAnthropicMessage);

  try {
    const url = `${baseUrl.replace(/\/+$/, "")}/v1/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        stream: true,
        ...(systemPrompt && { system: typeof systemPrompt === "string" ? systemPrompt : "" }),
        messages: chatMessages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 200)}`);
    }

    yield* parseSSEStream(res.body!, parseAnthropicChunk);
  } finally {
    clearTimeout(timer);
  }
}

function parseAnthropicChunk(data: string): string | { usage: TokenUsage } | null {
  try {
    const parsed = JSON.parse(data) as {
      type: string;
      delta?: { type?: string; text?: string };
      message?: { usage?: { input_tokens: number; output_tokens: number } };
      usage?: { input_tokens?: number; output_tokens?: number; output_tokens_details?: unknown };
    };
    if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
      return parsed.delta.text ?? null;
    }
    if (parsed.type === "message_delta" && parsed.usage) {
      // usage comes as partial — we capture it here but it may only have output_tokens
      return null;
    }
    if (parsed.type === "message_start" && parsed.message?.usage) {
      return { usage: { promptTokens: parsed.message.usage.input_tokens, completionTokens: 0 } };
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================
// Shared SSE parser
// ============================================================

async function* parseSSEStream(
  body: ReadableStream<Uint8Array>,
  extractToken: (data: string) => string | { usage: TokenUsage } | null
): AsyncGenerator<string | { usage: TokenUsage }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        const token = extractToken(data);
        if (token !== null) yield token;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ============================================================
// Message format converters
// ============================================================

function toOpenAIMessage(msg: LLMMessage): Record<string, unknown> {
  if (msg.role === "tool") {
    return { role: "tool", tool_call_id: msg.tool_call_id, content: msg.content };
  }
  if (msg.tool_calls) {
    return { role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls };
  }
  return { role: msg.role, content: msg.content };
}

function toAnthropicMessage(msg: LLMMessage): Record<string, unknown> {
  if (msg.role === "system") return { role: "user", content: msg.content }; // shouldn't happen, filtered before
  if (msg.role === "tool") {
    // Tool result in Anthropic format
    return {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: msg.tool_call_id, content: msg.content }],
    };
  }
  if (Array.isArray(msg.content)) {
    return { role: msg.role, content: msg.content };
  }
  return { role: msg.role, content: msg.content };
}
