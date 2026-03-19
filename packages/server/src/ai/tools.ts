// ============================================================
// Tool Use Framework — ToolDefinition, execution registry
// ============================================================

export interface ToolParameter {
  type: "string" | "number" | "boolean" | "object" | "array";
  description?: string;
  enum?: string[];
  properties?: Record<string, ToolParameter>;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
  /** Execute the tool and return a string result */
  execute: (args: Record<string, unknown>) => Promise<string>;
}

// ============================================================
// LLM Tool Call Types
// ============================================================

export interface LLMToolCall {
  id: string;           // OpenAI: tool_call.id | Anthropic: toolu_xxx
  name: string;
  arguments: Record<string, unknown>;
}

export type LLMNonStreamResult =
  | { type: "text"; content: string; usage?: TokenUsage }
  | { type: "tool_calls"; calls: LLMToolCall[]; partialText?: string; usage?: TokenUsage };

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

// ============================================================
// Model Pricing Table (USD per million tokens)
// ============================================================

const PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-4": { input: 30, output: 60 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  // Anthropic
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
  "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4 },
  "claude-3-opus-20240229": { input: 15, output: 75 },
};

export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = PRICING[model];
  if (!pricing) return 0;
  return (promptTokens / 1_000_000) * pricing.input + (completionTokens / 1_000_000) * pricing.output;
}
