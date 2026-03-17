import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { authMiddleware, superAdminMiddleware } from "../auth/middleware";
import { autoJoinOrgs } from "../lib/autoJoinOrgs";
import { deleteFile, bucket } from "../lib/minio";

export const systemRoutes = new Hono();

// All system routes require auth + super admin
systemRoutes.use("/*", authMiddleware);
systemRoutes.use("/*", superAdminMiddleware);

// ============================================================
// Local Users
// ============================================================

// GET /local-users — list all local accounts
systemRoutes.get("/local-users", async (c) => {
  const users = await prisma.user.findMany({
    where: { provider: "local" },
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
      isDisabled: true,
      isSuperAdmin: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return c.json({ success: true, data: users });
});

// POST /local-users — create a new local account
systemRoutes.post("/local-users", async (c) => {
  const { email, name, password } = await c.req.json<{ email: string; name: string; password: string }>();
  if (!email || !name || !password) {
    return c.json({ error: "email, name and password are required" }, 400);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return c.json({ error: "Email already in use" }, 409);
  }

  const passwordHash = await Bun.password.hash(password);
  const user = await prisma.user.create({
    data: { email, name, provider: "local", passwordHash },
    select: { id: true, email: true, name: true, isDisabled: true, isSuperAdmin: true, createdAt: true },
  });

  // Immediately add to all orgs and their public channels
  await autoJoinOrgs(user.id);

  return c.json({ success: true, data: user }, 201);
});

// PATCH /local-users/:id — update name, password, or isDisabled
systemRoutes.patch("/local-users/:id", async (c) => {
  const actorId = c.get("userId");
  const id = c.req.param("id");

  const body = await c.req.json<{ name?: string; password?: string; isDisabled?: boolean }>();

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.isDisabled !== undefined) {
    if (id === actorId) return c.json({ error: "Cannot disable yourself" }, 400);
    updateData.isDisabled = body.isDisabled;
  }
  if (body.password) {
    updateData.passwordHash = await Bun.password.hash(body.password);
  }

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: { id: true, email: true, name: true, isDisabled: true, isSuperAdmin: true, createdAt: true },
  });

  return c.json({ success: true, data: user });
});

// DELETE /local-users/:id — delete local account
systemRoutes.delete("/local-users/:id", async (c) => {
  const actorId = c.get("userId");
  const id = c.req.param("id");

  if (id === actorId) return c.json({ error: "Cannot delete yourself" }, 400);

  const user = await prisma.user.findUnique({ where: { id }, select: { isSuperAdmin: true, avatar: true } });
  if (!user) return c.json({ error: "User not found" }, 404);
  if (user.isSuperAdmin) return c.json({ error: "Cannot delete super admin" }, 400);

  // Delete avatar from MinIO if it's stored there
  if (user.avatar) {
    try {
      const publicBase = process.env.MINIO_PUBLIC_URL;
      const internalBase = `${process.env.MINIO_ENDPOINT || "http://localhost:9000"}/${bucket}`;
      const base = publicBase || internalBase;
      if (user.avatar.startsWith(base)) {
        const key = user.avatar.slice(base.length + 1);
        await deleteFile(key);
      }
    } catch {
      // Non-fatal: log but don't block deletion
      console.warn(`Failed to delete avatar for user ${id}`);
    }
  }

  await prisma.user.delete({ where: { id } });
  return c.json({ success: true });
});
