import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { integrationAuthMiddleware, idempotencyMiddleware } from "../integration/middleware";
import { publishToChannel } from "../ws/pubsub";

export const v1Routes = new Hono();

// All v1 routes require integration API key auth
v1Routes.use("*", integrationAuthMiddleware);
v1Routes.use("*", idempotencyMiddleware);

// ============================================================
// Messaging
// ============================================================

// POST /messages/push — send message to a specific user (via DM)
v1Routes.post("/messages/push", async (c) => {
  const orgId = c.get("integrationOrgId");
  const botUserId = c.get("integrationBotUserId");
  const integrationId = c.get("integrationId");

  const body = await c.req.json<{
    to: string; // userId
    messages: Array<{ type: string; text?: string; url?: string }>;
  }>();

  if (!body.to || !body.messages?.length) {
    return c.json({ error: "to and messages are required" }, 400);
  }

  // Check scoped channel access (if integration has channel restrictions)
  // For push (DM), we allow if no channels are scoped or if we find/create a DM

  // Find or create DM channel between bot and target user
  const dmChannel = await findOrCreateDM(botUserId, body.to, orgId);

  const sentMessages = [];
  for (const msg of body.messages) {
    const content = msg.text || msg.url || "";
    const type = msg.type === "image" || msg.type === "file" ? msg.type : "text";

    const message = await prisma.message.create({
      data: {
        content,
        type,
        channelId: dmChannel.id,
        senderId: botUserId,
      },
      select: { id: true, content: true, type: true, createdAt: true },
    });

    // Broadcast via WebSocket
    publishToChannel(dmChannel.id, JSON.stringify({
      type: "message:new",
      channelId: dmChannel.id,
      message: {
        id: message.id,
        content: message.content,
        type: message.type as "text" | "image" | "file" | "system",
        channelId: dmChannel.id,
        sender: { id: botUserId, name: "", avatar: null, isBot: true },
        replyTo: null,
        reactions: [],
        attachments: [],
        createdAt: message.createdAt.toISOString(),
      },
    }));

    sentMessages.push(message);
  }

  await logApiCall(integrationId, "POST /messages/push", 200);

  return c.json({
    success: true,
    data: { channelId: dmChannel.id, messages: sentMessages },
  });
});

// POST /messages/broadcast — send message to a channel
v1Routes.post("/messages/broadcast", async (c) => {
  const orgId = c.get("integrationOrgId");
  const botUserId = c.get("integrationBotUserId");
  const integrationId = c.get("integrationId");

  const body = await c.req.json<{
    channelId: string;
    messages: Array<{ type: string; text?: string; url?: string }>;
  }>();

  if (!body.channelId || !body.messages?.length) {
    return c.json({ error: "channelId and messages are required" }, 400);
  }

  // Verify channel belongs to org
  const channel = await prisma.channel.findFirst({
    where: { id: body.channelId, orgId },
    select: { id: true },
  });

  if (!channel) {
    return c.json({ error: "Channel not found" }, 404);
  }

  // Check scoped access
  const hasAccess = await checkChannelAccess(integrationId, body.channelId, "send");
  if (!hasAccess) {
    return c.json({ error: "No send permission for this channel" }, 403);
  }

  // Ensure bot is a member
  await prisma.channelMember.upsert({
    where: { userId_channelId: { userId: botUserId, channelId: body.channelId } },
    update: {},
    create: { userId: botUserId, channelId: body.channelId, role: "member" },
  });

  const sentMessages = [];
  for (const msg of body.messages) {
    const content = msg.text || msg.url || "";
    const type = msg.type === "image" || msg.type === "file" ? msg.type : "text";

    const message = await prisma.message.create({
      data: {
        content,
        type,
        channelId: body.channelId,
        senderId: botUserId,
      },
      select: { id: true, content: true, type: true, createdAt: true },
    });

    publishToChannel(body.channelId, JSON.stringify({
      type: "message:new",
      channelId: body.channelId,
      message: {
        id: message.id,
        content: message.content,
        type: message.type as "text" | "image" | "file" | "system",
        channelId: body.channelId,
        sender: { id: botUserId, name: "", avatar: null, isBot: true },
        replyTo: null,
        reactions: [],
        attachments: [],
        createdAt: message.createdAt.toISOString(),
      },
    }));

    sentMessages.push(message);
  }

  await logApiCall(integrationId, "POST /messages/broadcast", 200);

  return c.json({ success: true, data: { messages: sentMessages } });
});

// POST /messages/reply — reply to a specific message
v1Routes.post("/messages/reply", async (c) => {
  const orgId = c.get("integrationOrgId");
  const botUserId = c.get("integrationBotUserId");
  const integrationId = c.get("integrationId");

  const body = await c.req.json<{
    replyToMessageId: string;
    messages: Array<{ type: string; text?: string; url?: string }>;
  }>();

  if (!body.replyToMessageId || !body.messages?.length) {
    return c.json({ error: "replyToMessageId and messages are required" }, 400);
  }

  // Find the original message and its channel
  const original = await prisma.message.findUnique({
    where: { id: body.replyToMessageId },
    select: {
      id: true,
      content: true,
      channelId: true,
      channel: { select: { orgId: true } },
      sender: { select: { id: true, name: true } },
    },
  });

  if (!original || original.channel.orgId !== orgId) {
    return c.json({ error: "Message not found" }, 404);
  }

  const hasAccess = await checkChannelAccess(integrationId, original.channelId, "send");
  if (!hasAccess) {
    return c.json({ error: "No send permission for this channel" }, 403);
  }

  // Ensure bot is a member
  await prisma.channelMember.upsert({
    where: { userId_channelId: { userId: botUserId, channelId: original.channelId } },
    update: {},
    create: { userId: botUserId, channelId: original.channelId, role: "member" },
  });

  const sentMessages = [];
  for (let i = 0; i < body.messages.length; i++) {
    const msg = body.messages[i];
    const content = msg.text || msg.url || "";
    const type = msg.type === "image" || msg.type === "file" ? msg.type : "text";

    const message = await prisma.message.create({
      data: {
        content,
        type,
        channelId: original.channelId,
        senderId: botUserId,
        replyToId: i === 0 ? body.replyToMessageId : undefined, // only first message is a reply
      },
      select: { id: true, content: true, type: true, replyToId: true, createdAt: true },
    });

    publishToChannel(original.channelId, JSON.stringify({
      type: "message:new",
      channelId: original.channelId,
      message: {
        id: message.id,
        content: message.content,
        type: message.type as "text" | "image" | "file" | "system",
        channelId: original.channelId,
        sender: { id: botUserId, name: "", avatar: null, isBot: true },
        replyTo: message.replyToId ? { id: original.id, content: original.content, sender: original.sender } : null,
        reactions: [],
        attachments: [],
        createdAt: message.createdAt.toISOString(),
      },
    }));

    sentMessages.push(message);
  }

  await logApiCall(integrationId, "POST /messages/reply", 200);

  return c.json({ success: true, data: { messages: sentMessages } });
});

// ============================================================
// Query
// ============================================================

// GET /channels — list org channels
v1Routes.get("/channels", async (c) => {
  const orgId = c.get("integrationOrgId");
  const integrationId = c.get("integrationId");

  const channels = await prisma.channel.findMany({
    where: { orgId, type: { not: "dm" } },
    select: {
      id: true,
      name: true,
      type: true,
      icon: true,
      isPrivate: true,
      _count: { select: { members: true } },
      createdAt: true,
    },
    orderBy: { name: "asc" },
  });

  await logApiCall(integrationId, "GET /channels", 200);

  return c.json({ success: true, data: channels });
});

// GET /users — list org members
v1Routes.get("/users", async (c) => {
  const orgId = c.get("integrationOrgId");
  const integrationId = c.get("integrationId");

  const members = await prisma.orgMember.findMany({
    where: { orgId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          isBot: true,
          status: true,
        },
      },
    },
  });

  const users = members.map((m) => ({ ...m.user, role: m.role }));

  await logApiCall(integrationId, "GET /users", 200);

  return c.json({ success: true, data: users });
});

// GET /channels/:id/messages — get channel messages (paginated)
v1Routes.get("/channels/:id/messages", async (c) => {
  const orgId = c.get("integrationOrgId");
  const integrationId = c.get("integrationId");
  const channelId = c.req.param("id");

  // Verify channel belongs to org
  const channel = await prisma.channel.findFirst({
    where: { id: channelId, orgId },
    select: { id: true },
  });

  if (!channel) {
    return c.json({ error: "Channel not found" }, 404);
  }

  const hasAccess = await checkChannelAccess(integrationId, channelId, "read");
  if (!hasAccess) {
    return c.json({ error: "No read permission for this channel" }, 403);
  }

  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 200);
  const before = c.req.query("before"); // cursor: message id

  const where: Record<string, unknown> = { channelId };
  if (before) {
    const cursor = await prisma.message.findUnique({
      where: { id: before },
      select: { createdAt: true },
    });
    if (cursor) {
      where.createdAt = { lt: cursor.createdAt };
    }
  }

  const messages = await prisma.message.findMany({
    where,
    select: {
      id: true,
      content: true,
      type: true,
      createdAt: true,
      sender: {
        select: { id: true, name: true, avatar: true, isBot: true },
      },
      replyTo: {
        select: { id: true, content: true, sender: { select: { id: true, name: true } } },
      },
      attachments: {
        select: { id: true, name: true, url: true, mimeType: true, size: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  await logApiCall(integrationId, "GET /channels/:id/messages", 200);

  return c.json({ success: true, data: messages.reverse() });
});

// ============================================================
// Helpers
// ============================================================

async function findOrCreateDM(botUserId: string, targetUserId: string, orgId: string) {
  // Look for existing DM between bot and target
  const existing = await prisma.channel.findFirst({
    where: {
      type: "dm",
      orgId,
      members: { every: { userId: { in: [botUserId, targetUserId] } } },
      AND: [
        { members: { some: { userId: botUserId } } },
        { members: { some: { userId: targetUserId } } },
      ],
    },
    select: { id: true },
  });

  if (existing) return existing;

  // Create new DM
  return prisma.channel.create({
    data: {
      name: "DM",
      type: "dm",
      orgId,
      members: {
        create: [
          { userId: botUserId, role: "member" },
          { userId: targetUserId, role: "member" },
        ],
      },
    },
    select: { id: true },
  });
}

async function checkChannelAccess(
  integrationId: string,
  channelId: string,
  permission: string,
): Promise<boolean> {
  // If no channels are scoped, allow all
  const scopedCount = await prisma.integrationChannel.count({
    where: { integrationId },
  });

  if (scopedCount === 0) return true;

  // Check specific channel permission
  const entry = await prisma.integrationChannel.findUnique({
    where: { integrationId_channelId: { integrationId, channelId } },
    select: { permissions: true },
  });

  return entry?.permissions.includes(permission) ?? false;
}

async function logApiCall(integrationId: string, endpoint: string, statusCode: number) {
  await prisma.integrationAuditLog.create({
    data: {
      integrationId,
      endpoint,
      method: endpoint.split(" ")[0],
      statusCode,
    },
  }).catch(() => {}); // non-blocking
}
