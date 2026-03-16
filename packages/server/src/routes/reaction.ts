import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../auth/middleware";
import { sendToChannel } from "../ws/connections";
import { publishToChannel } from "../ws/pubsub";

export const reactionRoutes = new Hono();

reactionRoutes.use("*", authMiddleware);

// Add reaction to a message
reactionRoutes.post("/:messageId", async (c) => {
  const userId = c.get("userId");
  const messageId = c.req.param("messageId");
  const { emoji } = await c.req.json<{ emoji: string }>();

  if (!emoji) {
    return c.json({ error: "emoji is required" }, 400);
  }

  // Verify the message exists and user is a member of the channel
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { channelId: true },
  });

  if (!message) {
    return c.json({ error: "Message not found" }, 404);
  }

  const member = await prisma.channelMember.findUnique({
    where: { userId_channelId: { userId, channelId: message.channelId } },
  });
  if (!member) {
    return c.json({ error: "Not a member of this channel" }, 403);
  }

  // Toggle reaction (add if not exists, remove if exists)
  const existing = await prisma.reaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId, emoji } },
  });

  let action: "added" | "removed";
  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
    action = "removed";
  } else {
    await prisma.reaction.create({
      data: { messageId, userId, emoji },
    });
    action = "added";
  }

  // Get updated reaction counts for this message
  const reactions = await prisma.reaction.groupBy({
    by: ["emoji"],
    where: { messageId },
    _count: { emoji: true },
  });

  const payload = JSON.stringify({
    type: "reaction:updated",
    messageId,
    channelId: message.channelId,
    reactions: reactions.map((r) => ({
      emoji: r.emoji,
      count: r._count.emoji,
    })),
    userId,
    action,
  });

  sendToChannel(message.channelId, payload);
  await publishToChannel(message.channelId, payload);

  return c.json({ success: true, data: { action } });
});

// Get reactions for a message
reactionRoutes.get("/:messageId", async (c) => {
  const messageId = c.req.param("messageId");

  const reactions = await prisma.reaction.findMany({
    where: { messageId },
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  // Group by emoji
  const grouped = reactions.reduce(
    (acc, r) => {
      if (!acc[r.emoji]) {
        acc[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
      }
      acc[r.emoji].count++;
      acc[r.emoji].users.push(r.user);
      return acc;
    },
    {} as Record<string, { emoji: string; count: number; users: Array<{ id: string; name: string }> }>
  );

  return c.json({ success: true, data: Object.values(grouped) });
});
