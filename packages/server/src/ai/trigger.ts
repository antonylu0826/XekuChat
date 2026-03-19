import { prisma } from "../lib/prisma";
import { decrypt } from "../lib/crypto";
import { buildContextMessages } from "./context";
import { callLLM, streamLLMResponse, type LLMProvider, type LLMMessage } from "./llm";
import { publishToChannel } from "../ws/pubsub";
import { MENTION_PATTERN } from "@xekuchat/core";
import { getBuiltinTool } from "./builtins";
import { loadMCPTools } from "./mcp";
import type { ToolDefinition, LLMToolCall, TokenUsage } from "./tools";
import { estimateCost } from "./tools";

const BATCH_INTERVAL_MS = 50;
const MAX_TOOL_ROUNDS = 5;
const MENTION_REGEX = new RegExp(MENTION_PATTERN, "gu");

/**
 * Check if a message should trigger an AI assistant, and if so,
 * stream the response back to the channel.
 *
 * Called fire-and-forget from the WS handler after a message is saved.
 */
export async function handleAITrigger(
  channelId: string,
  messageId: string,
  senderId: string
): Promise<void> {
  const [sender, channel, message, assignments] = await Promise.all([
    prisma.user.findUnique({ where: { id: senderId }, select: { isBot: true } }),
    prisma.channel.findUnique({ where: { id: channelId }, select: { type: true } }),
    prisma.message.findUnique({ where: { id: messageId }, select: { content: true } }),
    prisma.aIAssistantChannel.findMany({
      where: { channelId },
      include: {
        assistant: {
          select: {
            id: true,
            provider: true,
            systemPrompt: true,
            baseUrl: true,
            apiKeyEnc: true,
            model: true,
            maxContext: true,
            isActive: true,
            botUserId: true,
            name: true,
          },
        },
      },
    }),
  ]);

  if (sender?.isBot) return;
  if (!channel || !message) return;

  const isDM = channel.type === "dm";

  if (isDM && assignments.length === 0) {
    const botMember = await prisma.channelMember.findFirst({
      where: { channelId, user: { isBot: true } },
      include: {
        user: {
          select: {
            aiAssistant: {
              select: {
                id: true,
                provider: true,
                systemPrompt: true,
                baseUrl: true,
                apiKeyEnc: true,
                model: true,
                maxContext: true,
                isActive: true,
                botUserId: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const assistant = botMember?.user.aiAssistant;
    if (!assistant || !assistant.isActive) return;

    await streamAIResponse(assistant, channelId, messageId, isDM);
    return;
  }

  const mentionedNames = new Set(
    [...message.content.matchAll(MENTION_REGEX)].map((m) => m[1].toLowerCase())
  );

  if (mentionedNames.size === 0) return;

  await Promise.all(
    assignments
      .filter(({ assistant }) => assistant.isActive && mentionedNames.has(assistant.name.toLowerCase()))
      .map(({ assistant }) => streamAIResponse(assistant, channelId, messageId, isDM))
  );
}

// ============================================================
// Assistant Info Interface
// ============================================================

interface AssistantInfo {
  id: string;
  provider: string;
  systemPrompt: string;
  baseUrl: string;
  apiKeyEnc: string;
  model: string;
  maxContext: number;
  botUserId: string;
  name: string;
}

// ============================================================
// Load tools for an assistant (built-in + webhook + MCP)
// ============================================================

async function loadAssistantTools(assistantId: string): Promise<ToolDefinition[]> {
  const skillAssignments = await prisma.aIAssistantSkill.findMany({
    where: { assistantId },
    include: { skill: true },
  });

  const tools: ToolDefinition[] = [];

  for (const { skill } of skillAssignments) {
    if (!skill.isActive) continue;

    if (skill.type === "builtin" && skill.builtinName) {
      const t = getBuiltinTool(skill.builtinName);
      if (t) tools.push(t);
    } else if (skill.type === "webhook" && skill.endpoint) {
      // Webhook skill: proxy call through backend
      const s = skill;
      tools.push({
        name: skill.name.replace(/\s+/g, "_").toLowerCase(),
        description: skill.description,
        parameters: {
          type: "object",
          properties: (skill.paramSchema as Record<string, unknown> | null)?.properties as Record<string, { type: "string" }> ?? {},
          required: ((skill.paramSchema as Record<string, unknown> | null)?.required ?? []) as string[],
        },
        execute: async (args) => {
          try {
            const headers: Record<string, string> = {
              "Content-Type": "application/json",
              ...((s.headers as Record<string, string> | null) ?? {}),
            };
            const isGet = (s.method ?? "POST").toUpperCase() === "GET";
            const url = isGet
              ? `${s.endpoint}?${new URLSearchParams(args as Record<string, string>)}`
              : s.endpoint!;

            const res = await fetch(url, {
              method: isGet ? "GET" : "POST",
              headers,
              ...(!isGet && { body: JSON.stringify(args) }),
              signal: AbortSignal.timeout(15_000),
            });

            if (!res.ok) return `Webhook error: HTTP ${res.status}`;
            const text = await res.text();
            return text.slice(0, 2000);
          } catch (err) {
            return `Webhook error: ${err instanceof Error ? err.message : "unknown"}`;
          }
        },
      });
    }
  }

  // MCP tools
  const mcpAssignments = await prisma.aIAssistantMCPServer.findMany({
    where: { assistantId },
    include: { mcpServer: true },
  });

  for (const { mcpServer } of mcpAssignments) {
    if (!mcpServer.isActive) continue;
    const mcpTools = await loadMCPTools({
      id: mcpServer.id,
      transport: mcpServer.transport as "stdio" | "sse",
      command: mcpServer.command,
      url: mcpServer.url,
      envVars: (mcpServer.envVars as Record<string, string> | null) ?? undefined,
    });
    tools.push(...mcpTools);
  }

  return tools;
}

// ============================================================
// Tool Use Execution Loop
// ============================================================

async function executeToolUseLoop(
  messages: LLMMessage[],
  tools: ToolDefinition[],
  provider: LLMProvider,
  baseUrl: string,
  apiKey: string,
  model: string,
  onThinking: (toolName: string) => Promise<void>
): Promise<{ messages: LLMMessage[]; totalUsage: TokenUsage; toolCallCount: number }> {
  const toolMap = new Map(tools.map((t) => [t.name, t]));
  let totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0 };
  let toolCallCount = 0;
  let currentMessages = [...messages];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const result = await callLLM({
      provider,
      baseUrl,
      apiKey,
      model,
      messages: currentMessages,
      tools,
    });

    if (result.usage) {
      totalUsage.promptTokens += result.usage.promptTokens;
      totalUsage.completionTokens += result.usage.completionTokens;
    }

    if (result.type === "text") {
      // Done — no more tool calls, pass back updated messages
      currentMessages.push({ role: "assistant", content: result.content });
      break;
    }

    // Execute tool calls
    toolCallCount += result.calls.length;

    // Build assistant message with tool_calls
    if (provider === "openai") {
      currentMessages.push({
        role: "assistant",
        content: result.partialText ?? "",
        tool_calls: result.calls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.arguments) },
        })),
      });
    } else {
      // Anthropic: assistant message with tool_use content blocks
      currentMessages.push({
        role: "assistant",
        content: [
          ...(result.partialText ? [{ type: "text" as const, text: result.partialText }] : []),
          ...result.calls.map((c) => ({
            type: "tool_use" as const,
            id: c.id,
            name: c.name,
            input: c.arguments,
          })),
        ],
      });
    }

    // Execute each tool call
    const toolResults: LLMMessage[] = [];

    for (const call of result.calls) {
      await onThinking(call.name);
      const tool = toolMap.get(call.name);
      let toolResult: string;

      if (!tool) {
        toolResult = `Error: tool "${call.name}" not found`;
      } else {
        try {
          toolResult = await tool.execute(call.arguments);
        } catch (err) {
          toolResult = `Tool execution error: ${err instanceof Error ? err.message : "unknown"}`;
        }
      }

      if (provider === "openai") {
        toolResults.push({
          role: "tool",
          tool_call_id: call.id,
          content: toolResult,
        });
      } else {
        // Anthropic: tool results as user message
        toolResults.push({
          role: "user",
          content: [{ type: "tool_result", tool_use_id: call.id, content: toolResult }],
        });
      }
    }

    currentMessages.push(...toolResults);
  }

  return { messages: currentMessages, totalUsage, toolCallCount };
}

// ============================================================
// Main Response Streaming
// ============================================================

async function streamAIResponse(
  assistant: AssistantInfo,
  channelId: string,
  triggerMessageId: string,
  isDM: boolean
): Promise<void> {
  const startTime = Date.now();

  // Create placeholder message
  const placeholder = await prisma.message.create({
    data: { content: "", type: "text", channelId, senderId: assistant.botUserId },
    include: { sender: { select: { id: true, name: true, avatar: true } } },
  });

  await publishToChannel(channelId, JSON.stringify({
    type: "ai:stream:start",
    messageId: placeholder.id,
    channelId,
    assistantId: assistant.id,
    model: assistant.model,
    sender: placeholder.sender,
  }));

  let fullContent = "";
  let totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0 };
  let toolCallCount = 0;
  let ttftMs: number | undefined;
  let errorMsg: string | undefined;

  try {
    const apiKey = decrypt(assistant.apiKeyEnc);
    const messages = await buildContextMessages(
      assistant.botUserId,
      assistant.systemPrompt,
      channelId,
      triggerMessageId,
      assistant.maxContext,
      isDM
    );

    // Load tools for this assistant
    const tools = await loadAssistantTools(assistant.id);

    let finalMessages = messages;

    if (tools.length > 0) {
      // Tool use loop — non-streaming with "thinking" indicator
      const result = await executeToolUseLoop(
        messages,
        tools,
        assistant.provider as LLMProvider,
        assistant.baseUrl,
        apiKey,
        assistant.model,
        async (toolName) => {
          // Broadcast thinking status
          await publishToChannel(channelId, JSON.stringify({
            type: "ai:stream:token",
            messageId: placeholder.id,
            channelId,
            token: `\n\n*[工具呼叫: ${toolName}...]*\n\n`,
          }));
        }
      );

      totalUsage = result.totalUsage;
      toolCallCount = result.toolCallCount;
      finalMessages = result.messages;

      // If the last message is already assistant text (loop ended with text), use it
      const lastMsg = finalMessages[finalMessages.length - 1];
      if (lastMsg?.role === "assistant" && typeof lastMsg.content === "string" && lastMsg.content) {
        fullContent = lastMsg.content;

        // Stream the pre-computed content
        ttftMs = Date.now() - startTime;
        const chunks = chunkString(fullContent, 50);
        for (const chunk of chunks) {
          await publishToChannel(channelId, JSON.stringify({
            type: "ai:stream:token",
            messageId: placeholder.id,
            channelId,
            token: chunk,
          }));
        }
      } else {
        // Need another streaming pass with the tool results in context
        finalMessages = finalMessages.filter((m) => m.role !== "assistant" || typeof m.content === "string");
        await streamFinalResponse();
      }
    } else {
      // No tools — direct streaming
      await streamFinalResponse();
    }

    async function streamFinalResponse() {
      let tokenBuffer = "";
      let flushTimer: ReturnType<typeof setTimeout> | null = null;

      const flush = async () => {
        if (!tokenBuffer) return;
        const batch = tokenBuffer;
        tokenBuffer = "";
        await publishToChannel(channelId, JSON.stringify({
          type: "ai:stream:token",
          messageId: placeholder.id,
          channelId,
          token: batch,
        }));
      };

      const stream = streamLLMResponse({
        provider: assistant.provider as LLMProvider,
        baseUrl: assistant.baseUrl,
        apiKey,
        model: assistant.model,
        messages: finalMessages,
      });

      for await (const chunk of stream) {
        if (typeof chunk === "object" && "usage" in chunk) {
          // Usage event from stream
          totalUsage.promptTokens += chunk.usage.promptTokens;
          totalUsage.completionTokens += chunk.usage.completionTokens;
          continue;
        }

        if (!ttftMs) ttftMs = Date.now() - startTime;
        fullContent += chunk;
        tokenBuffer += chunk;

        if (!flushTimer) {
          flushTimer = setTimeout(async () => {
            flushTimer = null;
            await flush();
          }, BATCH_INTERVAL_MS);
        }
      }

      if (flushTimer) clearTimeout(flushTimer);
      await flush();
    }
  } catch (err) {
    console.error(`AI stream error (${assistant.name}):`, err);
    errorMsg = err instanceof Error ? err.message : "Unknown error";
    fullContent = fullContent || `[AI Error: ${errorMsg}]`;
  }

  const totalMs = Date.now() - startTime;

  // Update placeholder with full content
  await prisma.message.update({
    where: { id: placeholder.id },
    data: { content: fullContent },
  });

  // Broadcast stream end
  await publishToChannel(channelId, JSON.stringify({
    type: "ai:stream:end",
    messageId: placeholder.id,
    channelId,
    content: fullContent,
  }));

  // Write usage log (Part E)
  const costUsd = estimateCost(assistant.model, totalUsage.promptTokens, totalUsage.completionTokens);
  await prisma.aIUsageLog.create({
    data: {
      assistantId: assistant.id,
      channelId,
      messageId: placeholder.id,
      provider: assistant.provider,
      model: assistant.model,
      promptTokens: totalUsage.promptTokens,
      completionTokens: totalUsage.completionTokens,
      costUsd,
      ttftMs: ttftMs ?? null,
      totalMs,
      toolCallCount,
      error: errorMsg ?? null,
    },
  }).catch((err) => console.error("Failed to write AI usage log:", err));
}

// ============================================================
// Helper
// ============================================================

function chunkString(str: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size));
  }
  return chunks;
}
