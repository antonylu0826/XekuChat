import type { Context, Next } from "hono";
import { verifyAccessToken } from "./jwt";
import { prisma } from "../lib/prisma";

// Extend Hono context with authenticated user
declare module "hono" {
  interface ContextVariableMap {
    userId: string;
    userRole: string | null;
  }
}

// Auth middleware — validates JWT and sets userId in context
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const payload = await verifyAccessToken(authHeader.slice(7));
    c.set("userId", payload.sub);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
}

// Org admin middleware — checks if user is admin of the org
export async function orgAdminMiddleware(c: Context, next: Next) {
  const userId = c.get("userId");
  const orgId = c.req.param("orgId");

  if (!orgId) {
    return c.json({ error: "Missing orgId" }, 400);
  }

  const member = await prisma.orgMember.findUnique({
    where: { userId_orgId: { userId, orgId } },
  });

  if (!member) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (member.role !== "admin") {
    return c.json({ error: "Admin access required" }, 403);
  }

  c.set("userRole", member.role);
  await next();
}
