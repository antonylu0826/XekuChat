import { prisma } from "../lib/prisma";
import { decrypt } from "../lib/crypto";
import { buildContextMessages } from "./context";
import { streamLLMResponse, type LLMProvider } from "./llm";
import { publishToChannel } from "../ws/pubsub";
import { MENTION_PATTERN } from "@xekuchat/core";

const BATCH_INTERVAL_MS = 50;
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
  // Parallelize all independent initial queries
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

  // DM mode: find the bot member directly with all needed assistant fields
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

  // Group channel mode: only respond to @mentioned assistants
  const mentionedNames = new Set(
    [...message.content.matchAll(MENTION_REGEX)].map((m) => m[1].toLowerCase())
  );

  if (mentionedNames.size === 0) return;

  // Trigger matching assistants in parallel
  await Promise.all(
    assignments
      .filter(({ assistant }) => assistant.isActive && mentionedNames.has(assistant.name.toLowerCase()))
      .map(({ assistant }) => streamAIResponse(assistant, channelId, messageId, isDM))
  );
}

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

async function streamAIResponse(
  assistant: AssistantInfo,
  channelId: string,
  triggerMessageId: string,
  isDM: boolean
): Promise<void> {
  // Create placeholder message
  const placeholder = await prisma.message.create({
    data: {
      content: "",
      type: "text",
      channelId,
      senderId: assistant.botUserId,
    },
    include: {
      sender: { select: { id: true, name: true, avatar: true } },
    },
  });

  // Broadcast stream start
  await publishToChannel(channelId, JSON.stringify({
    type: "ai:stream:start",
    messageId: placeholder.id,
    channelId,
    assistantId: assistant.id,
    model: assistant.model,
    sender: placeholder.sender,
  }));

  let fullContent = "";

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

    // Stream tokens with batching (flush every BATCH_INTERVAL_MS)
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
      messages,
    });

    for await (const token of stream) {
      fullContent += token;
      tokenBuffer += token;

      if (!flushTimer) {
        flushTimer = setTimeout(async () => {
          flushTimer = null;
          await flush();
        }, BATCH_INTERVAL_MS);
      }
    }

    // Final flush
    if (flushTimer) clearTimeout(flushTimer);
    await flush();
  } catch (err) {
    console.error(`AI stream error (${assistant.name}):`, err);
    fullContent = fullContent || `[AI Error: ${err instanceof Error ? err.message : "Unknown error"}]`;
  }

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
}
