// ============================================================
// LLM Streaming Client — OpenAI & Anthropic providers
// ============================================================

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type LLMProvider = "openai" | "anthropic";

interface StreamOptions {
  provider: LLMProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: LLMMessage[];
  timeoutMs?: number;
}

/**
 * Stream LLM response tokens. Yields string chunks as they arrive.
 * Supports OpenAI-compatible (/v1/chat/completions) and Anthropic (/v1/messages) APIs.
 */
export async function* streamLLMResponse(opts: StreamOptions): AsyncGenerator<string> {
  if (opts.provider === "anthropic") {
    yield* streamAnthropic(opts);
  } else {
    yield* streamOpenAI(opts);
  }
}

// ---- OpenAI-compatible streaming ----

async function* streamOpenAI(opts: StreamOptions): AsyncGenerator<string> {
  const { baseUrl, apiKey, model, messages, timeoutMs = 60_000 } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: true }),
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

function parseOpenAIChunk(data: string): string | null {
  if (data === "[DONE]") return null;
  try {
    const parsed = JSON.parse(data);
    return parsed.choices?.[0]?.delta?.content ?? null;
  } catch {
    return null;
  }
}

// ---- Anthropic streaming ----

async function* streamAnthropic(opts: StreamOptions): AsyncGenerator<string> {
  const { baseUrl, apiKey, model, messages, timeoutMs = 60_000 } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Separate system prompt from messages
  const systemPrompt = messages.find((m) => m.role === "system")?.content;
  const chatMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

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
        ...(systemPrompt && { system: systemPrompt }),
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

function parseAnthropicChunk(data: string): string | null {
  try {
    const parsed = JSON.parse(data);
    if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
      return parsed.delta.text ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

// ---- Shared SSE parser ----

async function* parseSSEStream(
  body: ReadableStream<Uint8Array>,
  extractToken: (data: string) => string | null
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Keep last potentially incomplete line in buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        const token = extractToken(data);
        if (token) yield token;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
