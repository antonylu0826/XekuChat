import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { authMiddleware, orgAdminMiddleware } from "../auth/middleware";
import { writeAuditLog } from "../audit/log";
import { createHash, randomBytes } from "crypto";
import { publishToChannel } from "../ws/pubsub";

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

// GET /:orgId/integrations — list all integrations (no apiKeyHash)
adminRoutes.get("/:orgId/integrations", async (c) => {
  const orgId = c.req.param("orgId");

  const integrations = await prisma.integration.findMany({
    where: { orgId },
    select: {
      id: true,
      orgId: true,
      name: true,
      description: true,
      webhookUrl: true,
      permissions: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({ success: true, data: integrations });
});

// POST /:orgId/integrations — create integration
adminRoutes.post("/:orgId/integrations", async (c) => {
  const actorId = c.get("userId");
  const orgId = c.req.param("orgId");
  const body = await c.req.json<{ name: string; description?: string; webhookUrl?: string }>();

  if (!body.name) {
    return c.json({ error: "name is required" }, 400);
  }

  const plainKey = "xku_" + randomBytes(32).toString("hex");
  const apiKeyHash = createHash("sha256").update(plainKey).digest("hex");

  const integration = await prisma.integration.create({
    data: {
      orgId,
      name: body.name,
      description: body.description || null,
      webhookUrl: body.webhookUrl || null,
      apiKeyHash,
    },
    select: {
      id: true,
      orgId: true,
      name: true,
      description: true,
      webhookUrl: true,
      permissions: true,
      isActive: true,
      createdAt: true,
    },
  });

  await writeAuditLog({
    orgId,
    action: "integration_create",
    actorId,
    targetId: integration.id,
    meta: { name: body.name },
  });

  return c.json({ success: true, data: { ...integration, plainKey } }, 201);
});

// PATCH /:orgId/integrations/:id — update integration
adminRoutes.patch("/:orgId/integrations/:id", async (c) => {
  const orgId = c.req.param("orgId");
  const id = c.req.param("id");
  const body = await c.req.json<{ isActive: boolean }>();

  const integration = await prisma.integration.update({
    where: { id },
    data: { isActive: body.isActive },
    select: {
      id: true,
      orgId: true,
      name: true,
      description: true,
      webhookUrl: true,
      permissions: true,
      isActive: true,
      createdAt: true,
    },
  });

  return c.json({ success: true, data: integration });
});

// DELETE /:orgId/integrations/:id — delete integration
adminRoutes.delete("/:orgId/integrations/:id", async (c) => {
  const actorId = c.get("userId");
  const orgId = c.req.param("orgId");
  const id = c.req.param("id");

  await prisma.integration.delete({ where: { id } });

  await writeAuditLog({
    orgId,
    action: "integration_delete",
    actorId,
    targetId: id,
  });

  return c.json({ success: true });
});
