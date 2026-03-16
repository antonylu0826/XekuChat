import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { authMiddleware, orgAdminMiddleware } from "../auth/middleware";
import { writeAuditLog } from "../audit/log";

export const orgRoutes = new Hono();

// All org routes require auth
orgRoutes.use("*", authMiddleware);

// Create organization
orgRoutes.post("/", async (c) => {
  const userId = c.get("userId");
  const { name, slug } = await c.req.json<{ name: string; slug: string }>();

  if (!name || !slug) {
    return c.json({ error: "name and slug are required" }, 400);
  }

  // Only super admins can create organizations
  const actor = await prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
  if (!actor?.isSuperAdmin) {
    return c.json({ error: "Only system admin can create organizations" }, 403);
  }

  // Check slug uniqueness
  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) {
    return c.json({ error: "Slug already taken" }, 409);
  }

  const org = await prisma.organization.create({
    data: {
      name,
      slug,
      members: {
        create: { userId, role: "admin" },
      },
      settings: {
        create: {},
      },
    },
    include: { members: true },
  });

  await writeAuditLog({
    orgId: org.id,
    action: "channel_create",
    actorId: userId,
    targetId: org.id,
    meta: { type: "org_create", name, slug },
  });

  return c.json({ success: true, data: org }, 201);
});

// List user's organizations
orgRoutes.get("/", async (c) => {
  const userId = c.get("userId");

  const memberships = await prisma.orgMember.findMany({
    where: { userId },
    include: {
      org: {
        select: { id: true, name: true, slug: true },
      },
    },
  });

  return c.json({
    success: true,
    data: memberships.map((m) => ({ ...m.org, role: m.role })),
  });
});

// Get organization details
orgRoutes.get("/:orgId", async (c) => {
  const userId = c.get("userId");
  const orgId = c.req.param("orgId");

  const member = await prisma.orgMember.findUnique({
    where: { userId_orgId: { userId, orgId } },
  });
  if (!member) {
    return c.json({ error: "Not a member" }, 403);
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: {
      settings: true,
      _count: { select: { members: true, channels: true } },
    },
  });

  return c.json({ success: true, data: org });
});

// Invite member (admin only)
orgRoutes.post("/:orgId/members", orgAdminMiddleware, async (c) => {
  const userId = c.get("userId");
  const orgId = c.req.param("orgId");
  const { email, role = "member" } = await c.req.json<{ email: string; role?: string }>();

  const targetUser = await prisma.user.findUnique({ where: { email } });
  if (!targetUser) {
    return c.json({ error: "User not found" }, 404);
  }

  const existing = await prisma.orgMember.findUnique({
    where: { userId_orgId: { userId: targetUser.id, orgId } },
  });
  if (existing) {
    return c.json({ error: "Already a member" }, 409);
  }

  const member = await prisma.orgMember.create({
    data: { userId: targetUser.id, orgId, role },
  });

  await writeAuditLog({
    orgId,
    action: "member_invite",
    actorId: userId,
    targetId: targetUser.id,
    meta: { email, role },
  });

  return c.json({ success: true, data: member }, 201);
});

// List members
orgRoutes.get("/:orgId/members", async (c) => {
  const userId = c.get("userId");
  const orgId = c.req.param("orgId");

  const member = await prisma.orgMember.findUnique({
    where: { userId_orgId: { userId, orgId } },
  });
  if (!member) {
    return c.json({ error: "Not a member" }, 403);
  }

  const members = await prisma.orgMember.findMany({
    where: { orgId },
    include: {
      user: {
        select: { id: true, email: true, name: true, avatar: true, status: true },
      },
    },
  });

  return c.json({ success: true, data: members });
});

// Remove member (admin only)
orgRoutes.delete("/:orgId/members/:targetUserId", orgAdminMiddleware, async (c) => {
  const userId = c.get("userId");
  const orgId = c.req.param("orgId");
  const targetUserId = c.req.param("targetUserId");

  if (targetUserId === userId) {
    return c.json({ error: "Cannot remove yourself" }, 400);
  }

  await prisma.orgMember.delete({
    where: { userId_orgId: { userId: targetUserId, orgId } },
  });

  await writeAuditLog({
    orgId,
    action: "member_kick",
    actorId: userId,
    targetId: targetUserId,
  });

  return c.json({ success: true });
});

// Update org settings (admin only)
orgRoutes.patch("/:orgId/settings", orgAdminMiddleware, async (c) => {
  const userId = c.get("userId");
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
    actorId: userId,
    meta: { messageRetainDays: body.messageRetainDays },
  });

  return c.json({ success: true, data: settings });
});
