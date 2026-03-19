import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { authMiddleware, orgAdminMiddleware } from "../auth/middleware";
import { writeAuditLog } from "../audit/log";
import { createHash, randomBytes } from "crypto";
import { publishToChannel } from "../ws/pubsub";
import { encrypt } from "../lib/crypto";
import { generateApiKey, hashApiKey } from "../integration/apiKey";

export const adminRoutes = new Hono();

// All admin routes require auth + org admin role
adminRoutes.use("/:orgId/*", authMiddleware);
adminRoutes.use("/:orgId/*", orgAdminMiddleware);

// ============================================================
// Users
// ============================================================

// GET /:orgId/users — list all org members with user details
adminRoutes.get("/:orgId/users", async (c) => {
  const orgId = c.req.param("orgId");

  const members = await prisma.orgMember.findMany({
    where: { orgId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          status: true,
          isDisabled: true,
          createdAt: true,
        },
      },
    },
  });

  const result = members.map((m) => ({
    id: m.id,
    role: m.role,
    user: m.user,
  }));

  return c.json({ success: true, data: result });
});

// PATCH /:orgId/users/:userId — update role or isDisabled
adminRoutes.patch("/:orgId/users/:userId", async (c) => {
  const actorId = c.get("userId");
  const orgId = c.req.param("orgId");
  const userId = c.req.param("userId");

  if (userId === actorId) {
    return c.json({ error: "Cannot modify yourself" }, 400);
  }

  const body = await c.req.json<{ role?: string; isDisabled?: boolean }>();

  // Update role in OrgMember if provided
  if (body.role !== undefined) {
    await prisma.orgMember.update({
      where: { userId_orgId: { userId, orgId } },
      data: { role: body.role },
    });
    await writeAuditLog({
      orgId,
      action: "member_role_change",
      actorId,
      targetId: userId,
      meta: { role: body.role },
    });
  }

  // Update isDisabled on User if provided
  if (body.isDisabled !== undefined) {
    await prisma.user.update({
      where: { id: userId },
      data: { isDisabled: body.isDisabled },
    });
    await writeAuditLog({
      orgId,
      action: "member_disable",
      actorId,
      targetId: userId,
      meta: { isDisabled: body.isDisabled },
    });
  }

  return c.json({ success: true });
});

// DELETE /:orgId/users/:userId — remove from org
adminRoutes.delete("/:orgId/users/:userId", async (c) => {
  const actorId = c.get("userId");
  const orgId = c.req.param("orgId");
  const userId = c.req.param("userId");

  if (userId === actorId) {
    return c.json({ error: "Cannot remove yourself" }, 400);
  }

  // Remove from all channels in this org first
  const orgChannels = await prisma.channel.findMany({
    where: { orgId },
    select: { id: true },
  });
  await prisma.channelMember.deleteMany({
    where: { userId, channelId: { in: orgChannels.map((c) => c.id) } },
  });

  await prisma.orgMember.delete({
    where: { userId_orgId: { userId, orgId } },
  });

  await writeAuditLog({
    orgId,
    action: "member_kick",
    actorId,
    targetId: userId,
  });

  return c.json({ success: true });
});

// ============================================================
// Channels
// ============================================================

// GET /:orgId/channels — list all channels with counts
adminRoutes.get("/:orgId/channels", async (c) => {
  const orgId = c.req.param("orgId");

  const channels = await prisma.channel.findMany({
    where: { orgId, type: { not: "dm" } },
    include: {
      _count: {
        select: { members: true, messages: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return c.json({ success: true, data: channels });
});

// POST /:orgId/channels — create channel
adminRoutes.post("/:orgId/channels", async (c) => {
  const actorId = c.get("userId");
  const orgId = c.req.param("orgId");
  const body = await c.req.json<{ name: string; type?: string; isPrivate?: boolean }>();

  if (!body.name) {
    return c.json({ error: "name is required" }, 400);
  }

  const isPrivate = body.isPrivate ?? false;
  const type = body.type || "group";

  const channel = await prisma.channel.create({
    data: {
      name: body.name,
      type,
      isPrivate,
      orgId,
      members: {
        create: { userId: actorId, role: "admin" },
      },
    },
  });

  // Auto-add all org members to public non-DM channels
  if (!isPrivate && type !== "dm") {
    const orgMembers = await prisma.orgMember.findMany({
      where: { orgId, userId: { not: actorId } },
      select: { userId: true },
    });
    if (orgMembers.length > 0) {
      await prisma.channelMember.createMany({
        data: orgMembers.map((m) => ({ userId: m.userId, channelId: channel.id, role: "member" })),
        skipDuplicates: true,
      });
    }
  }

  await writeAuditLog({
    orgId,
    action: "channel_create",
    actorId,
    targetId: channel.id,
    meta: { name: body.name, type: body.type || "group", isPrivate: body.isPrivate ?? false },
  });

  return c.json({ success: true, data: channel }, 201);
});

// PATCH /:orgId/channels/:channelId — update channel
adminRoutes.patch("/:orgId/channels/:channelId", async (c) => {
  const actorId = c.get("userId");
  const orgId = c.req.param("orgId");
  const channelId = c.req.param("channelId");
  const body = await c.req.json<{ name?: string; type?: string; isPrivate?: boolean; icon?: string | null }>();

  const channel = await prisma.channel.update({
    where: { id: channelId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.type !== undefined && { type: body.type }),
      ...(body.isPrivate !== undefined && { isPrivate: body.isPrivate }),
      ...(body.icon !== undefined && { icon: body.icon }),
    },
  });

  await writeAuditLog({
    orgId,
    action: "channel_update",
    actorId,
    targetId: channelId,
    meta: body as Record<string, unknown>,
  });

  // Broadcast to all channel subscribers so their sidebars update in real time
  await publishToChannel(
    channelId,
    JSON.stringify({ type: "channel:updated", channelId, name: channel.name, icon: channel.icon })
  );

  return c.json({ success: true, data: channel });
});

// DELETE /:orgId/channels/:channelId — delete channel
adminRoutes.delete("/:orgId/channels/:channelId", async (c) => {
  const actorId = c.get("userId");
  const orgId = c.req.param("orgId");
  const channelId = c.req.param("channelId");

  await prisma.channel.delete({ where: { id: channelId } });

  await writeAuditLog({
    orgId,
    action: "channel_delete",
    actorId,
    targetId: channelId,
  });

  return c.json({ success: true });
});

// DELETE /:orgId/channels/:channelId/messages — clear all messages in channel
adminRoutes.delete("/:orgId/channels/:channelId/messages", async (c) => {
  const actorId = c.get("userId");
  const orgId = c.req.param("orgId");
  const channelId = c.req.param("channelId");

  await prisma.message.deleteMany({ where: { channelId } });

  await writeAuditLog({
    orgId,
    action: "channel_delete",
    actorId,
    targetId: channelId,
    meta: { action: "clear_messages" },
  });

  return c.json({ success: true });
});

// ============================================================
// Channel Members
// ============================================================

// GET /:orgId/channels/:channelId/members — list channel members
adminRoutes.get("/:orgId/channels/:channelId/members", async (c) => {
  const channelId = c.req.param("channelId");

  const members = await prisma.channelMember.findMany({
    where: { channelId },
    include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    orderBy: { user: { name: "asc" } },
  });

  return c.json({ success: true, data: members });
});

// POST /:orgId/channels/:channelId/members — add member
adminRoutes.post("/:orgId/channels/:channelId/members", async (c) => {
  const channelId = c.req.param("channelId");
  const { userId } = await c.req.json<{ userId: string }>();

  const member = await prisma.channelMember.upsert({
    where: { userId_channelId: { userId, channelId } },
    update: {},
    create: { userId, channelId, role: "member" },
  });

  return c.json({ success: true, data: member }, 201);
});

// DELETE /:orgId/channels/:channelId/members/:userId — remove member
adminRoutes.delete("/:orgId/channels/:channelId/members/:userId", async (c) => {
  const channelId = c.req.param("channelId");
  const userId = c.req.param("userId");

  await prisma.channelMember.delete({
    where: { userId_channelId: { userId, channelId } },
  });

  return c.json({ success: true });
});

// ============================================================
// Settings
// ============================================================

// GET /:orgId/settings — get OrgSettings
adminRoutes.get("/:orgId/settings", async (c) => {
  const orgId = c.req.param("orgId");

  const settings = await prisma.orgSettings.findUnique({ where: { orgId } });

  return c.json({ success: true, data: settings });
});

// PATCH /:orgId/settings — upsert OrgSettings
adminRoutes.patch("/:orgId/settings", async (c) => {
  const actorId = c.get("userId");
  const orgId = c.req.param("orgId");
  const body = await c.req.json<{ messageRetainDays?: number | null }>();

  const settings = await prisma.orgSettings.upsert({
    where: { orgId },
    update: { messageRetainDays: body.messageRetainDays },
    create: { orgId, messageRetainDays: body.messageRetainDays },
  });

  await writeAuditLog({
    orgId,
    action: "org_settings_update",
    actorId,
    meta: { messageRetainDays: body.messageRetainDays },
  });

  return c.json({ success: true, data: settings });
});

// ============================================================
// Audit Logs
// ============================================================

// GET /:orgId/audit-logs — paginated audit logs
adminRoutes.get("/:orgId/audit-logs", async (c) => {
  const orgId = c.req.param("orgId");
  const action = c.req.query("action") || undefined;
  const actorId = c.req.query("actorId") || undefined;
  const cursor = c.req.query("cursor") || undefined;
  const limitParam = parseInt(c.req.query("limit") || "50");
  const limit = Math.min(Math.max(limitParam, 1), 100);

  const logs = await prisma.auditLog.findMany({
    where: {
      orgId,
      ...(action && { action }),
      ...(actorId && { actorId }),
      ...(cursor && { id: { lt: cursor } }),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
  });

  const hasMore = logs.length > limit;
  const items = hasMore ? logs.slice(0, limit) : logs;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  // Enrich with actor user info
  const uniqueActorIds = [...new Set(items.map((l) => l.actorId))];
  const actors = await prisma.user.findMany({
    where: { id: { in: uniqueActorIds } },
    select: { id: true, name: true, avatar: true },
  });
  const actorMap = new Map(actors.map((a) => [a.id, a]));

  const enrichedLogs = items.map((log) => ({
    ...log,
    actor: actorMap.get(log.actorId) || null,
  }));

  return c.json({ success: true, items: enrichedLogs, nextCursor, hasMore });
});

// ============================================================
// Integrations
// ============================================================

// Old integration routes removed — replaced by /:orgId/integrations-api routes below

// ============================================================
// AI Assistants
// ============================================================

// GET /:orgId/ai-assistants — list all AI assistants
adminRoutes.get("/:orgId/ai-assistants", async (c) => {
  const orgId = c.req.param("orgId");

  const assistants = await prisma.aIAssistant.findMany({
    where: { orgId },
    select: {
      id: true,
      name: true,
      avatar: true,
      provider: true,
      model: true,
      systemPrompt: true,
      baseUrl: true,
      maxContext: true,
      isActive: true,
      botUserId: true,
      createdAt: true,
      channels: {
        select: { channelId: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({ success: true, data: assistants });
});

// POST /:orgId/ai-assistants — create AI assistant
adminRoutes.post("/:orgId/ai-assistants", async (c) => {
  const actorId = c.get("userId");
  const orgId = c.req.param("orgId");
  const body = await c.req.json<{
    name: string;
    provider?: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    systemPrompt: string;
    maxContext?: number;
    avatar?: string;
  }>();

  if (!body.name || !body.baseUrl || !body.apiKey || !body.model || !body.systemPrompt) {
    return c.json({ error: "name, baseUrl, apiKey, model, systemPrompt are required" }, 400);
  }

  // Create bot user
  const botEmail = `ai-${body.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${randomBytes(4).toString("hex")}@xekuchat.bot`;
  const botUser = await prisma.user.create({
    data: {
      email: botEmail,
      name: body.name,
      avatar: body.avatar || null,
      provider: "bot",
      isBot: true,
    },
  });

  // Add bot to org
  await prisma.orgMember.create({
    data: { userId: botUser.id, orgId, role: "member" },
  });

  // Encrypt API key
  const apiKeyEnc = encrypt(body.apiKey);

  // Create assistant
  const assistant = await prisma.aIAssistant.create({
    data: {
      orgId,
      name: body.name,
      avatar: body.avatar || null,
      provider: body.provider || "openai",
      systemPrompt: body.systemPrompt,
      baseUrl: body.baseUrl,
      apiKeyEnc,
      model: body.model,
      maxContext: body.maxContext || 20,
      botUserId: botUser.id,
    },
    select: {
      id: true,
      name: true,
      provider: true,
      model: true,
      systemPrompt: true,
      baseUrl: true,
      maxContext: true,
      isActive: true,
      botUserId: true,
      createdAt: true,
    },
  });

  await writeAuditLog({
    orgId,
    action: "ai_assistant_create",
    actorId,
    targetId: assistant.id,
    meta: { name: body.name, model: body.model, provider: body.provider || "openai" },
  });

  return c.json({ success: true, data: assistant }, 201);
});

// PATCH /:orgId/ai-assistants/:id — update AI assistant
adminRoutes.patch("/:orgId/ai-assistants/:id", async (c) => {
  const actorId = c.get("userId");
  const orgId = c.req.param("orgId");
  const id = c.req.param("id");
  const body = await c.req.json<{
    name?: string;
    provider?: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    systemPrompt?: string;
    maxContext?: number;
    isActive?: boolean;
    avatar?: string;
  }>();

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.provider !== undefined) updateData.provider = body.provider;
  if (body.baseUrl !== undefined) updateData.baseUrl = body.baseUrl;
  if (body.model !== undefined) updateData.model = body.model;
  if (body.systemPrompt !== undefined) updateData.systemPrompt = body.systemPrompt;
  if (body.maxContext !== undefined) updateData.maxContext = body.maxContext;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;
  if (body.avatar !== undefined) updateData.avatar = body.avatar || null;
  if (body.apiKey) updateData.apiKeyEnc = encrypt(body.apiKey);

  const assistant = await prisma.aIAssistant.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      name: true,
      avatar: true,
      provider: true,
      model: true,
      systemPrompt: true,
      baseUrl: true,
      maxContext: true,
      isActive: true,
      botUserId: true,
      createdAt: true,
    },
  });

  // Sync bot user name/avatar if changed
  const botUpdate: Record<string, unknown> = {};
  if (body.name !== undefined) botUpdate.name = body.name;
  if (body.avatar !== undefined) botUpdate.avatar = body.avatar || null;
  if (Object.keys(botUpdate).length > 0) {
    await prisma.user.update({
      where: { id: assistant.botUserId },
      data: botUpdate,
    });
  }

  await writeAuditLog({
    orgId,
    action: "ai_assistant_update",
    actorId,
    targetId: id,
    meta: { ...body, apiKey: body.apiKey ? "***" : undefined },
  });

  return c.json({ success: true, data: assistant });
});

// DELETE /:orgId/ai-assistants/:id — delete AI assistant
adminRoutes.delete("/:orgId/ai-assistants/:id", async (c) => {
  const actorId = c.get("userId");
  const orgId = c.req.param("orgId");
  const id = c.req.param("id");

  const assistant = await prisma.aIAssistant.findUnique({
    where: { id },
    select: { botUserId: true, name: true },
  });

  if (!assistant) return c.json({ error: "Not found" }, 404);

  await prisma.aIAssistant.delete({ where: { id } });
  await prisma.user.delete({ where: { id: assistant.botUserId } });

  await writeAuditLog({
    orgId,
    action: "ai_assistant_delete",
    actorId,
    targetId: id,
    meta: { name: assistant.name },
  });

  return c.json({ success: true });
});

// POST /:orgId/ai-assistants/:id/channels — assign assistant to channel
adminRoutes.post("/:orgId/ai-assistants/:id/channels", async (c) => {
  const id = c.req.param("id");
  const { channelId } = await c.req.json<{ channelId: string }>();

  await prisma.aIAssistantChannel.upsert({
    where: { assistantId_channelId: { assistantId: id, channelId } },
    update: {},
    create: { assistantId: id, channelId },
  });

  // Also add bot user as channel member
  const assistant = await prisma.aIAssistant.findUnique({
    where: { id },
    select: { botUserId: true },
  });
  if (assistant) {
    await prisma.channelMember.upsert({
      where: { userId_channelId: { userId: assistant.botUserId, channelId } },
      update: {},
      create: { userId: assistant.botUserId, channelId, role: "member" },
    });
  }

  return c.json({ success: true }, 201);
});

// DELETE /:orgId/ai-assistants/:id/channels/:channelId — unassign
adminRoutes.delete("/:orgId/ai-assistants/:id/channels/:channelId", async (c) => {
  const id = c.req.param("id");
  const channelId = c.req.param("channelId");

  await prisma.aIAssistantChannel.delete({
    where: { assistantId_channelId: { assistantId: id, channelId } },
  }).catch(() => {});

  const assistant = await prisma.aIAssistant.findUnique({
    where: { id },
    select: { botUserId: true },
  });
  if (assistant) {
    await prisma.channelMember.delete({
      where: { userId_channelId: { userId: assistant.botUserId, channelId } },
    }).catch(() => {});
  }

  return c.json({ success: true });
});

// ============================================================
// Integrations (API)
// ============================================================

// GET /:orgId/integrations-api — list all integrations
adminRoutes.get("/:orgId/integrations-api", async (c) => {
  const orgId = c.req.param("orgId");

  const integrations = await prisma.integration.findMany({
    where: { orgId },
    select: {
      id: true,
      name: true,
      description: true,
      apiKeyPrefix: true,
      webhookUrl: true,
      rateLimit: true,
      isActive: true,
      botUserId: true,
      createdAt: true,
      channels: {
        select: { channelId: true, permissions: true },
      },
      _count: {
        select: { auditLogs: true, webhookDeliveries: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({ success: true, data: integrations });
});

// POST /:orgId/integrations-api — create integration
adminRoutes.post("/:orgId/integrations-api", async (c) => {
  const orgId = c.req.param("orgId");
  const actorId = c.get("userId");
  const body = await c.req.json<{
    name: string;
    description?: string;
    webhookUrl?: string;
    rateLimit?: number;
  }>();

  if (!body.name?.trim()) {
    return c.json({ error: "Name is required" }, 400);
  }

  // Generate API key
  const { raw, hash, prefix } = generateApiKey();

  // Generate webhook secret
  const webhookSecret = randomBytes(32).toString("hex");

  // Create bot user for this integration
  const botEmail = `integration-${Date.now()}@bot.xekuchat`;
  const botUser = await prisma.user.create({
    data: {
      email: botEmail,
      name: body.name,
      provider: "bot",
      isBot: true,
      avatar: "🔗",
    },
  });

  // Add bot to org
  await prisma.orgMember.create({
    data: { userId: botUser.id, orgId, role: "member" },
  });

  // Create integration
  const integration = await prisma.integration.create({
    data: {
      orgId,
      name: body.name,
      description: body.description || null,
      apiKeyHash: hash,
      apiKeyPrefix: prefix,
      webhookUrl: body.webhookUrl || null,
      webhookSecret,
      rateLimit: body.rateLimit || 60,
      botUserId: botUser.id,
    },
  });

  await writeAuditLog({
    orgId,
    action: "integration_create",
    actorId,
    targetId: integration.id,
    meta: { name: body.name },
  });

  // Return the raw API key (shown once only!)
  return c.json({
    success: true,
    data: {
      id: integration.id,
      name: integration.name,
      apiKey: raw,
      apiKeyPrefix: prefix,
      webhookSecret,
    },
  }, 201);
});

// PATCH /:orgId/integrations-api/:id — update integration
adminRoutes.patch("/:orgId/integrations-api/:id", async (c) => {
  const orgId = c.req.param("orgId");
  const id = c.req.param("id");
  const actorId = c.get("userId");
  const body = await c.req.json<{
    name?: string;
    description?: string;
    webhookUrl?: string;
    rateLimit?: number;
    isActive?: boolean;
  }>();

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description || null;
  if (body.webhookUrl !== undefined) updateData.webhookUrl = body.webhookUrl || null;
  if (body.rateLimit !== undefined) updateData.rateLimit = body.rateLimit;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;

  const integration = await prisma.integration.update({
    where: { id, orgId },
    data: updateData,
    select: { botUserId: true },
  });

  // Sync bot user name
  if (body.name) {
    await prisma.user.update({
      where: { id: integration.botUserId },
      data: { name: body.name },
    });
  }

  await writeAuditLog({
    orgId,
    action: "integration_update",
    actorId,
    targetId: id,
    meta: updateData,
  });

  return c.json({ success: true });
});

// POST /:orgId/integrations-api/:id/regenerate-key — regenerate API key
adminRoutes.post("/:orgId/integrations-api/:id/regenerate-key", async (c) => {
  const orgId = c.req.param("orgId");
  const id = c.req.param("id");
  const actorId = c.get("userId");

  const { raw, hash, prefix } = generateApiKey();

  await prisma.integration.update({
    where: { id, orgId },
    data: { apiKeyHash: hash, apiKeyPrefix: prefix },
  });

  await writeAuditLog({
    orgId,
    action: "integration_key_regenerate",
    actorId,
    targetId: id,
  });

  return c.json({ success: true, data: { apiKey: raw, apiKeyPrefix: prefix } });
});

// DELETE /:orgId/integrations-api/:id — delete integration
adminRoutes.delete("/:orgId/integrations-api/:id", async (c) => {
  const orgId = c.req.param("orgId");
  const id = c.req.param("id");
  const actorId = c.get("userId");

  const integration = await prisma.integration.findUnique({
    where: { id, orgId },
    select: { name: true, botUserId: true },
  });

  if (!integration) {
    return c.json({ error: "Integration not found" }, 404);
  }

  // Delete integration (cascades to channels, audit logs, webhook deliveries)
  await prisma.integration.delete({ where: { id } });

  // Remove bot user from all channels and org
  await prisma.channelMember.deleteMany({ where: { userId: integration.botUserId } });
  await prisma.orgMember.deleteMany({ where: { userId: integration.botUserId } });

  await writeAuditLog({
    orgId,
    action: "integration_delete",
    actorId,
    targetId: id,
    meta: { name: integration.name },
  });

  return c.json({ success: true });
});

// POST /:orgId/integrations-api/:id/channels — assign channel
adminRoutes.post("/:orgId/integrations-api/:id/channels", async (c) => {
  const id = c.req.param("id");
  const { channelId, permissions } = await c.req.json<{
    channelId: string;
    permissions?: string[];
  }>();

  await prisma.integrationChannel.upsert({
    where: { integrationId_channelId: { integrationId: id, channelId } },
    update: { permissions: permissions || ["send", "read", "webhook"] },
    create: {
      integrationId: id,
      channelId,
      permissions: permissions || ["send", "read", "webhook"],
    },
  });

  // Add bot user as channel member
  const integration = await prisma.integration.findUnique({
    where: { id },
    select: { botUserId: true },
  });
  if (integration) {
    await prisma.channelMember.upsert({
      where: { userId_channelId: { userId: integration.botUserId, channelId } },
      update: {},
      create: { userId: integration.botUserId, channelId, role: "member" },
    });
  }

  return c.json({ success: true }, 201);
});

// DELETE /:orgId/integrations-api/:id/channels/:channelId — unassign channel
adminRoutes.delete("/:orgId/integrations-api/:id/channels/:channelId", async (c) => {
  const id = c.req.param("id");
  const channelId = c.req.param("channelId");

  await prisma.integrationChannel.delete({
    where: { integrationId_channelId: { integrationId: id, channelId } },
  }).catch(() => {});

  const integration = await prisma.integration.findUnique({
    where: { id },
    select: { botUserId: true },
  });
  if (integration) {
    await prisma.channelMember.delete({
      where: { userId_channelId: { userId: integration.botUserId, channelId } },
    }).catch(() => {});
  }

  return c.json({ success: true });
});

// GET /:orgId/integrations-api/:id/audit-logs — get API call logs
adminRoutes.get("/:orgId/integrations-api/:id/audit-logs", async (c) => {
  const id = c.req.param("id");
  const limit = parseInt(c.req.query("limit") || "100");

  const logs = await prisma.integrationAuditLog.findMany({
    where: { integrationId: id },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 500),
  });

  return c.json({ success: true, data: logs });
});

// GET /:orgId/integrations-api/:id/webhook-deliveries — get webhook delivery logs
adminRoutes.get("/:orgId/integrations-api/:id/webhook-deliveries", async (c) => {
  const id = c.req.param("id");
  const limit = parseInt(c.req.query("limit") || "100");

  const deliveries = await prisma.webhookDelivery.findMany({
    where: { integrationId: id },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 500),
  });

  return c.json({ success: true, data: deliveries });
});

// ============================================================
// AI Skills (Part B)
// ============================================================

adminRoutes.get("/:orgId/ai-skills", async (c) => {
  const orgId = c.req.param("orgId");
  const skills = await prisma.aISkill.findMany({ where: { orgId }, orderBy: { createdAt: "asc" } });
  return c.json({ success: true, data: skills });
});

adminRoutes.post("/:orgId/ai-skills", async (c) => {
  const orgId = c.req.param("orgId");
  const body = await c.req.json() as {
    name: string; description: string; type: string;
    builtinName?: string; method?: string; endpoint?: string;
    headers?: Record<string, string>; paramSchema?: Record<string, unknown>;
  };
  const skill = await prisma.aISkill.create({
    data: {
      orgId, name: body.name, description: body.description, type: body.type,
      builtinName: body.builtinName ?? null, method: body.method ?? null,
      endpoint: body.endpoint ?? null, headers: body.headers ?? null,
      paramSchema: body.paramSchema ?? null,
    },
  });
  return c.json({ success: true, data: skill });
});

adminRoutes.patch("/:orgId/ai-skills/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json() as Partial<{
    name: string; description: string; method: string; endpoint: string;
    headers: Record<string, string>; paramSchema: Record<string, unknown>; isActive: boolean;
  }>;
  const skill = await prisma.aISkill.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.method !== undefined && { method: body.method }),
      ...(body.endpoint !== undefined && { endpoint: body.endpoint }),
      ...(body.headers !== undefined && { headers: body.headers }),
      ...(body.paramSchema !== undefined && { paramSchema: body.paramSchema }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  });
  return c.json({ success: true, data: skill });
});

adminRoutes.delete("/:orgId/ai-skills/:id", async (c) => {
  await prisma.aISkill.delete({ where: { id: c.req.param("id") } }).catch(() => {});
  return c.json({ success: true });
});

adminRoutes.get("/:orgId/ai-assistants/:id/assigned-skills", async (c) => {
  const assistantId = c.req.param("id");
  const rows = await prisma.aIAssistantSkill.findMany({
    where: { assistantId }, include: { skill: true },
  });
  return c.json({ success: true, data: rows.map((r) => r.skill) });
});

adminRoutes.post("/:orgId/ai-assistants/:id/skills", async (c) => {
  const assistantId = c.req.param("id");
  const { skillId } = await c.req.json() as { skillId: string };
  await prisma.aIAssistantSkill.upsert({
    where: { assistantId_skillId: { assistantId, skillId } },
    update: {}, create: { assistantId, skillId },
  });
  return c.json({ success: true });
});

adminRoutes.delete("/:orgId/ai-assistants/:id/skills/:skillId", async (c) => {
  const assistantId = c.req.param("id");
  const skillId = c.req.param("skillId");
  await prisma.aIAssistantSkill.delete({
    where: { assistantId_skillId: { assistantId, skillId } },
  }).catch(() => {});
  return c.json({ success: true });
});

// ============================================================
// MCP Servers (Part D)
// ============================================================

adminRoutes.get("/:orgId/mcp-servers", async (c) => {
  const orgId = c.req.param("orgId");
  const servers = await prisma.mCPServer.findMany({ where: { orgId }, orderBy: { createdAt: "asc" } });
  return c.json({ success: true, data: servers });
});

adminRoutes.post("/:orgId/mcp-servers", async (c) => {
  const orgId = c.req.param("orgId");
  const body = await c.req.json() as {
    name: string; transport: string; command?: string; url?: string;
    envVars?: Record<string, string>;
  };
  const server = await prisma.mCPServer.create({
    data: {
      orgId, name: body.name, transport: body.transport,
      command: body.command ?? null, url: body.url ?? null,
      envVars: body.envVars ?? null,
    },
  });
  return c.json({ success: true, data: server });
});

adminRoutes.patch("/:orgId/mcp-servers/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json() as Partial<{
    name: string; command: string; url: string;
    envVars: Record<string, string>; isActive: boolean;
  }>;
  const server = await prisma.mCPServer.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.command !== undefined && { command: body.command }),
      ...(body.url !== undefined && { url: body.url }),
      ...(body.envVars !== undefined && { envVars: body.envVars }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  });
  return c.json({ success: true, data: server });
});

adminRoutes.delete("/:orgId/mcp-servers/:id", async (c) => {
  await prisma.mCPServer.delete({ where: { id: c.req.param("id") } }).catch(() => {});
  return c.json({ success: true });
});

adminRoutes.get("/:orgId/ai-assistants/:id/assigned-mcp-servers", async (c) => {
  const assistantId = c.req.param("id");
  const rows = await prisma.aIAssistantMCPServer.findMany({
    where: { assistantId }, include: { mcpServer: true },
  });
  return c.json({ success: true, data: rows.map((r) => r.mcpServer) });
});

adminRoutes.post("/:orgId/ai-assistants/:id/mcp-servers", async (c) => {
  const assistantId = c.req.param("id");
  const { mcpServerId } = await c.req.json() as { mcpServerId: string };
  await prisma.aIAssistantMCPServer.upsert({
    where: { assistantId_mcpServerId: { assistantId, mcpServerId } },
    update: {}, create: { assistantId, mcpServerId },
  });
  return c.json({ success: true });
});

adminRoutes.delete("/:orgId/ai-assistants/:id/mcp-servers/:mcpServerId", async (c) => {
  const assistantId = c.req.param("id");
  const mcpServerId = c.req.param("mcpServerId");
  await prisma.aIAssistantMCPServer.delete({
    where: { assistantId_mcpServerId: { assistantId, mcpServerId } },
  }).catch(() => {});
  return c.json({ success: true });
});

// ============================================================
// AI Monitoring (Part E)
// ============================================================

adminRoutes.get("/:orgId/ai-monitoring/summary", async (c) => {
  const orgId = c.req.param("orgId");
  const days = parseInt(c.req.query("days") || "30");
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);

  const assistants = await prisma.aIAssistant.findMany({
    where: { orgId },
    select: {
      id: true, name: true, model: true, provider: true,
      usageLogs: {
        where: { createdAt: { gte: since } },
        select: {
          promptTokens: true, completionTokens: true, costUsd: true,
          ttftMs: true, totalMs: true, toolCallCount: true, error: true,
        },
      },
    },
  });

  const summary = assistants.map((a) => {
    const logs = a.usageLogs;
    const totalCalls = logs.length;
    const errorCount = logs.filter((l) => l.error).length;
    const totalPromptTokens = logs.reduce((s, l) => s + l.promptTokens, 0);
    const totalCompletionTokens = logs.reduce((s, l) => s + l.completionTokens, 0);
    const totalCost = logs.reduce((s, l) => s + l.costUsd, 0);
    const avgLatency = totalCalls > 0 ? Math.round(logs.reduce((s, l) => s + l.totalMs, 0) / totalCalls) : 0;
    const ttftLogs = logs.filter((l) => l.ttftMs);
    const avgTtft = ttftLogs.length > 0 ? Math.round(ttftLogs.reduce((s, l) => s + (l.ttftMs ?? 0), 0) / ttftLogs.length) : null;
    return {
      assistantId: a.id, name: a.name, model: a.model, provider: a.provider,
      totalCalls, errorCount, errorRate: totalCalls > 0 ? Math.round((errorCount / totalCalls) * 100) : 0,
      totalPromptTokens, totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      totalCostUsd: Math.round(totalCost * 1000000) / 1000000,
      avgLatencyMs: avgLatency, avgTtftMs: avgTtft,
      totalToolCalls: logs.reduce((s, l) => s + l.toolCallCount, 0),
    };
  });

  return c.json({ success: true, data: summary });
});

adminRoutes.get("/:orgId/ai-monitoring/:assistantId/logs", async (c) => {
  const assistantId = c.req.param("assistantId");
  const limit = Math.min(parseInt(c.req.query("limit") || "100"), 500);
  const logs = await prisma.aIUsageLog.findMany({
    where: { assistantId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true, channelId: true, provider: true, model: true,
      promptTokens: true, completionTokens: true, costUsd: true,
      ttftMs: true, totalMs: true, toolCallCount: true, error: true, createdAt: true,
    },
  });
  return c.json({ success: true, data: logs });
});

adminRoutes.get("/:orgId/ai-monitoring/:assistantId/daily", async (c) => {
  const assistantId = c.req.param("assistantId");
  const days = parseInt(c.req.query("days") || "30");
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const logs = await prisma.aIUsageLog.findMany({
    where: { assistantId, createdAt: { gte: since } },
    select: { promptTokens: true, completionTokens: true, costUsd: true, totalMs: true, error: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const byDay = new Map<string, { calls: number; errors: number; tokens: number; cost: number; latency: number }>();
  for (const log of logs) {
    const day = log.createdAt.toISOString().slice(0, 10);
    const e = byDay.get(day) ?? { calls: 0, errors: 0, tokens: 0, cost: 0, latency: 0 };
    e.calls++;
    if (log.error) e.errors++;
    e.tokens += log.promptTokens + log.completionTokens;
    e.cost += log.costUsd;
    e.latency += log.totalMs;
    byDay.set(day, e);
  }

  const daily = Array.from(byDay.entries()).map(([date, s]) => ({
    date, calls: s.calls, errors: s.errors, tokens: s.tokens,
    costUsd: Math.round(s.cost * 1000000) / 1000000,
    avgLatencyMs: s.calls > 0 ? Math.round(s.latency / s.calls) : 0,
  }));

  return c.json({ success: true, data: daily });
});
