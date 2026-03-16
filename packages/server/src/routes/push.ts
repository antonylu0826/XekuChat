import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { vapidPublicKey } from "../lib/webpush";
import { authMiddleware } from "../auth/middleware";

export const pushRoutes = new Hono();

pushRoutes.use("*", authMiddleware);

// GET /api/push/vapid-public-key
pushRoutes.get("/vapid-public-key", (c) => {
  return c.json({ key: vapidPublicKey || null });
});

// POST /api/push/subscribe
pushRoutes.post("/subscribe", async (c) => {
  const userId = c.get("userId");
  const { endpoint, keys } = await c.req.json<{
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }>();

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return c.json({ error: "Invalid subscription" }, 400);
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId, keys },
    create: { userId, endpoint, keys },
  });

  return c.json({ success: true });
});

// DELETE /api/push/subscribe
pushRoutes.delete("/subscribe", async (c) => {
  const userId = c.get("userId");
  const { endpoint } = await c.req.json<{ endpoint: string }>();

  if (!endpoint) return c.json({ error: "Missing endpoint" }, 400);

  await prisma.pushSubscription.deleteMany({
    where: { userId, endpoint },
  });

  return c.json({ success: true });
});

// PATCH /api/push/mute/:channelId - toggle mute
pushRoutes.patch("/mute/:channelId", async (c) => {
  const userId = c.get("userId");
  const { channelId } = c.req.param();
  const { muted } = await c.req.json<{ muted: boolean }>();

  const member = await prisma.channelMember.findUnique({
    where: { userId_channelId: { userId, channelId } },
  });

  if (!member) return c.json({ error: "Not a member" }, 403);

  await prisma.channelMember.update({
    where: { userId_channelId: { userId, channelId } },
    data: { isMuted: muted },
  });

  return c.json({ success: true, muted });
});
