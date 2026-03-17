import type { Context, Next } from "hono";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { hashApiKey } from "./apiKey";

// Extend Hono context for integration routes
declare module "hono" {
  interface ContextVariableMap {
    integrationId: string;
    integrationOrgId: string;
    integrationBotUserId: string;
  }
}

/**
 * Integration API Key auth middleware.
 * Validates Bearer token → SHA-256 hash → DB lookup.
 * Also checks isActive flag.
 */
export async function integrationAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer xk_live_")) {
    return c.json({ error: "Invalid API key format" }, 401);
  }

  const apiKey = authHeader.slice(7); // strip "Bearer "
  const hash = hashApiKey(apiKey);

  const integration = await prisma.integration.findUnique({
    where: { apiKeyHash: hash },
    select: { id: true, orgId: true, botUserId: true, isActive: true, rateLimit: true },
  });

  if (!integration) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  if (!integration.isActive) {
    return c.json({ error: "Integration is disabled" }, 403);
  }

  // Rate limiting: sliding window per integration
  const rateLimitOk = await checkRateLimit(integration.id, integration.rateLimit);
  if (!rateLimitOk) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  c.set("integrationId", integration.id);
  c.set("integrationOrgId", integration.orgId);
  c.set("integrationBotUserId", integration.botUserId);
  await next();
}

/**
 * Redis sliding window rate limiter.
 * Returns true if request is allowed.
 */
async function checkRateLimit(integrationId: string, maxPerMinute: number): Promise<boolean> {
  const key = `ratelimit:integration:${integrationId}`;
  const now = Date.now();
  const windowMs = 60_000;

  const pipe = redis.pipeline();
  // Remove entries older than window
  pipe.zremrangebyscore(key, 0, now - windowMs);
  // Count remaining entries
  pipe.zcard(key);
  // Add current request
  pipe.zadd(key, now, `${now}:${Math.random()}`);
  // Set expiry on key
  pipe.expire(key, 120);

  const results = await pipe.exec();
  const count = results?.[1]?.[1] as number;

  return count < maxPerMinute;
}

/**
 * Idempotency middleware.
 * If X-Idempotency-Key header is present, checks Redis cache.
 * On first request: proceeds and caches the response.
 * On duplicate: returns cached response.
 */
export async function idempotencyMiddleware(c: Context, next: Next) {
  const idempotencyKey = c.req.header("X-Idempotency-Key");
  if (!idempotencyKey) {
    await next();
    return;
  }

  const integrationId = c.get("integrationId");
  const cacheKey = `idempotency:${integrationId}:${idempotencyKey}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    const parsed = JSON.parse(cached);
    return c.json(parsed.body, parsed.status);
  }

  await next();

  // Cache the response after handler executes
  if (c.res) {
    const cloned = c.res.clone();
    try {
      const body = await cloned.json();
      await redis.set(cacheKey, JSON.stringify({ body, status: cloned.status }), "EX", 86400);
    } catch {
      // non-JSON response, skip caching
    }
  }
}
