import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { uploadFile } from "../lib/minio";
import { authMiddleware } from "../auth/middleware";

export const userRoutes = new Hono();

userRoutes.use("*", authMiddleware);

// PATCH /api/users/me — update display name
userRoutes.patch("/me", async (c) => {
  const userId = c.get("userId");
  const { name } = await c.req.json<{ name?: string }>();

  if (!name || name.trim().length === 0) {
    return c.json({ error: "name is required" }, 400);
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { name: name.trim() },
    select: { id: true, name: true, avatar: true, email: true },
  });

  return c.json({ success: true, data: user });
});

// POST /api/users/me/avatar — upload avatar image
userRoutes.post("/me/avatar", async (c) => {
  const userId = c.get("userId");
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return c.json({ error: "No file provided" }, 400);
  }

  if (!file.type.startsWith("image/")) {
    return c.json({ error: "Only image files are allowed" }, 415);
  }

  if (file.size > 5 * 1024 * 1024) {
    return c.json({ error: "Avatar must be under 5MB" }, 413);
  }

  const ext = file.name.split(".").pop() || "jpg";
  const key = `avatars/${userId}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await uploadFile(key, buffer, file.type);

  const user = await prisma.user.update({
    where: { id: userId },
    data: { avatar: url },
    select: { id: true, name: true, avatar: true, email: true },
  });

  return c.json({ success: true, data: user });
});
