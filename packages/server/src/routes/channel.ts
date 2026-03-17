import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../auth/middleware";
import { writeAuditLog } from "../audit/log";
import { sendToUser } from "../ws/connections";

export const channelRoutes = new Hono();

channelRoutes.use("*", authMiddleware);

// Create channel
channelRoutes.post("/", async (c) => {
  const userId = c.get("userId");
  const { orgId, name, type = "group", isPrivate = false } = await c.req.json<{
    orgId: string;
    name: string;
    type?: string;
    isPrivate?: boolean;
  }>();

  // Verify org membership
  const orgMember = await prisma.orgMember.findUnique({
    where: { userId_orgId: { userId, orgId } },
  });
  if (!orgMember) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  const channel = await prisma.channel.create({
    data: {
      name,
      type,
      isPrivate,
      orgId,
      members: {
        create: { userId, role: "admin" },
      },
    },
    include: { members: true },
  });

  await writeAuditLog({
    orgId,
    action: "channel_create",
    actorId: userId,
    targetId: channel.id,
    meta: { name, type, isPrivate },
  });

  return c.json({ success: true, data: channel }, 201);
});

// Create DM channel between two users
channelRoutes.post("/dm", async (c) => {
  const userId = c.get("userId");
  const { orgId, targetUserId } = await c.req.json<{ orgId: string; targetUserId: string }>();

  // Check if DM already exists between these two users
  const existing = await prisma.channel.findFirst({
    where: {
      orgId,
      type: "dm",
      AND: [
        { members: { some: { userId } } },
        { members: { some: { userId: targetUserId } } },
      ],
    },
  });

  if (existing) {
    return c.json({ success: true, data: existing });
  }

  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!targetUser) {
    return c.json({ error: "User not found" }, 404);
  }

  const channel = await prisma.channel.create({
    data: {
      name: `dm-${userId}-${targetUserId}`,
      type: "dm",
      isPrivate: true,
      orgId,
      members: {
        createMany: {
          data: [
            { userId, role: "member" },
            { userId: targetUserId, role: "member" },
          ],
        },
      },
    },
    include: { members: true },
  });

  // Notify both users via WS so their channel lists refresh
  const joinedPayload = JSON.stringify({ type: "channel:joined", channelId: channel.id });
  sendToUser(userId, joinedPayload);
  sendToUser(targetUserId, joinedPayload);

  return c.json({ success: true, data: channel }, 201);
});

// List channels for an org (that user is member of)
channelRoutes.get("/org/:orgId", async (c) => {
  const userId = c.get("userId");
  const orgId = c.req.param("orgId");

  const channels = await prisma.channel.findMany({
    where: {
      orgId,
      OR: [
        { isPrivate: false },
        { members: { some: { userId } } },
      ],
    },
    include: {
      _count: { select: { members: true, messages: true } },
      members: {
        include: { user: { select: { id: true, name: true, avatar: true, isBot: true } } },
        // isMuted is a field on ChannelMember, automatically included
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Compute unread counts per channel
  const channelIds = channels.map((c) => c.id);
  const cursors = await prisma.channelReadCursor.findMany({
    where: { userId, channelId: { in: channelIds } },
    select: { channelId: true, lastReadAt: true },
  });
  const cursorMap = new Map(cursors.map((c) => [c.channelId, c.lastReadAt]));

  const unreadEntries = await Promise.all(
    channels.map(async (ch) => {
      const lastReadAt = cursorMap.get(ch.id);
      // No cursor = user hasn't opened this channel yet; treat as baseline (0)
      // so historical messages don't pollute the unread count
      if (!lastReadAt) return [ch.id, 0] as [string, number];
      const count = await prisma.message.count({
        where: {
          channelId: ch.id,
          senderId: { not: userId },
          isRetracted: false,
          createdAt: { gt: lastReadAt },
        },
      });
      return [ch.id, count] as [string, number];
    })
  );
  const unreadMap = Object.fromEntries(unreadEntries);

  return c.json({
    success: true,
    data: channels.map((ch) => ({ ...ch, unreadCount: unreadMap[ch.id] ?? 0 })),
  });
});

// Get channel details
channelRoutes.get("/:channelId", async (c) => {
  const userId = c.get("userId");
  const channelId = c.req.param("channelId");

  const member = await prisma.channelMember.findUnique({
    where: { userId_channelId: { userId, channelId } },
  });
  if (!member) {
    return c.json({ error: "Not a member" }, 403);
  }

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true, status: true } },
        },
      },
      _count: { select: { messages: true } },
    },
  });

  return c.json({ success: true, data: channel });
});

// Join channel (public only)
channelRoutes.post("/:channelId/join", async (c) => {
  const userId = c.get("userId");
  const channelId = c.req.param("channelId");

  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel || channel.isPrivate) {
    return c.json({ error: "Channel not found or is private" }, 404);
  }

  const existing = await prisma.channelMember.findUnique({
    where: { userId_channelId: { userId, channelId } },
  });
  if (existing) {
    return c.json({ error: "Already a member" }, 409);
  }

  const member = await prisma.channelMember.create({
    data: { userId, channelId },
  });

  return c.json({ success: true, data: member });
});

// Add member to channel (admin only)
channelRoutes.post("/:channelId/members", async (c) => {
  const userId = c.get("userId");
  const channelId = c.req.param("channelId");
  const { targetUserId } = await c.req.json<{ targetUserId: string }>();

  const adminMember = await prisma.channelMember.findUnique({
    where: { userId_channelId: { userId, channelId } },
  });
  if (!adminMember || adminMember.role !== "admin") {
    return c.json({ error: "Admin access required" }, 403);
  }

  const member = await prisma.channelMember.create({
    data: { userId: targetUserId, channelId },
  });

  return c.json({ success: true, data: member }, 201);
});

// Leave channel (DM: delete channel when all members have left)
channelRoutes.delete("/:channelId/leave", async (c) => {
  const userId = c.get("userId");
  const channelId = c.req.param("channelId");

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { type: true },
  });

  await prisma.channelMember.delete({
    where: { userId_channelId: { userId, channelId } },
  });

  // For DM channels, delete the channel if no members remain
  if (channel?.type === "dm") {
    const remaining = await prisma.channelMember.count({ where: { channelId } });
    if (remaining === 0) {
      await prisma.channel.delete({ where: { id: channelId } });
    }
  }

  return c.json({ success: true });
});

// GET /:channelId/assistants — list AI assistants assigned to this channel (public, auth only)
channelRoutes.get("/:channelId/assistants", async (c) => {
  const channelId = c.req.param("channelId");

  const assignments = await prisma.aIAssistantChannel.findMany({
    where: { channelId },
    include: {
      assistant: {
        select: {
          id: true,
          name: true,
          avatar: true,
          model: true,
          isActive: true,
          botUserId: true,
        },
      },
    },
  });

  const data = assignments
    .filter((a) => a.assistant.isActive)
    .map((a) => a.assistant);

  return c.json({ success: true, data });
});
