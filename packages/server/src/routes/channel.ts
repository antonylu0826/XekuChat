import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../auth/middleware";
import { writeAuditLog } from "../audit/log";

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
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({ success: true, data: channels });
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

// Leave channel
channelRoutes.delete("/:channelId/leave", async (c) => {
  const userId = c.get("userId");
  const channelId = c.req.param("channelId");

  await prisma.channelMember.delete({
    where: { userId_channelId: { userId, channelId } },
  });

  return c.json({ success: true });
});
