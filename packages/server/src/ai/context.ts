import { prisma } from "../lib/prisma";
import type { LLMMessage } from "./llm";

/**
 * Build conversation context for the LLM using a sliding window.
 * - Fetches the most recent `maxContext` messages before the trigger message.
 * - In group channels, prefixes each message with "[UserName]: " so the AI
 *   knows who said what.
 * - In DM channels, no prefix needed.
 */
export async function buildContextMessages(
  botUserId: string,
  systemPrompt: string,
  channelId: string,
  triggerMessageId: string,
  maxContext: number,
  isDM: boolean
): Promise<LLMMessage[]> {
  // Get the trigger message's createdAt for cursor
  const trigger = await prisma.message.findUnique({
    where: { id: triggerMessageId },
    select: { createdAt: true },
  });
  if (!trigger) return [{ role: "system", content: systemPrompt }];

  // Fetch recent messages before (and including) the trigger
  const recentMessages = await prisma.message.findMany({
    where: {
      channelId,
      createdAt: { lte: trigger.createdAt },
      isRetracted: false,
    },
    orderBy: { createdAt: "desc" },
    take: maxContext,
    select: {
      content: true,
      senderId: true,
      sender: { select: { name: true } },
    },
  });

  // Reverse to chronological order
  recentMessages.reverse();

  const messages: LLMMessage[] = [{ role: "system", content: systemPrompt }];

  for (const msg of recentMessages) {
    const role: "user" | "assistant" = msg.senderId === botUserId ? "assistant" : "user";
    const content = isDM || role === "assistant"
      ? msg.content
      : `[${msg.sender.name}]: ${msg.content}`;
    messages.push({ role, content });
  }

  return messages;
}
