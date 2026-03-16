import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../auth/middleware";
import { DEFAULT_PAGE_SIZE } from "@xekuchat/core";

export const messageRoutes = new Hono();

messageRoutes.use("*", authMiddleware);

// Get messages for a channel (cursor-based pagination)
messageRoutes.get("/:channelId", async (c) => {
  const userId = c.get("userId");
  const channelId = c.req.param("channelId");
  const cursor = c.req.query("cursor");
  const limit = parseInt(c.req.query("limit") || String(DEFAULT_PAGE_SIZE));

  // Verify membership
  const member = await prisma.channelMember.findUnique({
    where: { userId_channelId: { userId, channelId } },
  });
  if (!member) {
    return c.json({ error: "Not a member" }, 403);
  }

  const messages = await prisma.message.findMany({
    where: { channelId },
    ...(cursor
      ? {
          cursor: { id: cursor },
          skip: 1,
        }
      : {}),
    take: -(limit + 1), // negative take: fetch last N rows in asc order
    orderBy: { createdAt: "asc" },
    include: {
      sender: { select: { id: true, name: true, avatar: true, isBot: true } },
      attachments: true,
      reactions: {
        include: { user: { select: { id: true, name: true } } },
      },
      replyTo: {
        select: {
          id: true,
          content: true,
          senderId: true,
          sender: { select: { name: true } },
        },
      },
    },
  });

  const hasMore = messages.length > limit;
  if (hasMore) messages.shift(); // remove the extra oldest item

  return c.json({
    items: messages,
    nextCursor: hasMore ? messages[0].id : null, // oldest item = cursor for loading more history
    hasMore,
  });
});

// Get messages since a specific message ID (for gap fill after reconnection)
messageRoutes.get("/:channelId/since/:messageId", async (c) => {
  const userId = c.get("userId");
  const channelId = c.req.param("channelId");
  const messageId = c.req.param("messageId");

  const member = await prisma.channelMember.findUnique({
    where: { userId_channelId: { userId, channelId } },
  });
  if (!member) {
    return c.json({ error: "Not a member" }, 403);
  }

  // Get the reference message's createdAt
  const refMessage = await prisma.message.findUnique({
    where: { id: messageId },
    select: { createdAt: true },
  });

  if (!refMessage) {
    return c.json({ error: "Message not found" }, 404);
  }

  const messages = await prisma.message.findMany({
    where: {
      channelId,
      createdAt: { gt: refMessage.createdAt },
    },
    orderBy: { createdAt: "asc" },
    take: 200, // Cap gap fill at 200 messages
    include: {
      sender: { select: { id: true, name: true, avatar: true, isBot: true } },
      attachments: true,
    },
  });

  return c.json({ success: true, data: messages });
});

// Get read count for a message
messageRoutes.get("/:channelId/read/:messageId", async (c) => {
  const channelId = c.req.param("channelId");
  const messageId = c.req.param("messageId");

  const readCount = await prisma.channelReadCursor.count({
    where: {
      channelId,
      lastReadMsgId: { gte: messageId },
    },
  });

  return c.json({ success: true, data: { readCount } });
});
