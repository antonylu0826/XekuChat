import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";

export const healthRoutes = new Hono();

healthRoutes.get("/", async (c) => {
  const checks: Record<string, "ok" | "error"> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  try {
    await redis.ping();
    checks.redis = "ok";
  } catch {
    checks.redis = "error";
  }

  const healthy = Object.values(checks).every((v) => v === "ok");

  return c.json(
    {
      status: healthy ? "healthy" : "degraded",
      checks,
      nodeId: process.env.APP_NODE_ID || "single",
      timestamp: new Date().toISOString(),
    },
    healthy ? 200 : 503
  );
});
