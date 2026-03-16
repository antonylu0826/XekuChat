import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../auth/middleware";
import { DEFAULT_PAGE_SIZE } from "@xekuchat/core";

export const searchRoutes = new Hono();

searchRoutes.use("*", authMiddleware);

// Full-text search messages using pgroonga
searchRoutes.get("/messages", async (c) => {
  const userId = c.get("userId");
  const query = c.req.query("q");
  const orgId = c.req.query("orgId");
  const channelId = c.req.query("channelId");
  const limit = parseInt(c.req.query("limit") || String(DEFAULT_PAGE_SIZE));
  const offset = parseInt(c.req.query("offset") || "0");

  if (!query || query.trim().length < 2) {
    return c.json({ error: "Query must be at least 2 characters" }, 400);
  }

  if (!orgId) {
    return c.json({ error: "orgId is required" }, 400);
  }

  // Verify org membership
  const orgMember = await prisma.orgMember.findUnique({
    where: { userId_orgId: { userId, orgId } },
  });
  if (!orgMember) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  // Use raw query for pgroonga full-text search
  // pgroonga supports CJK (Chinese, Japanese, Korean) without tokenizer config
  const channelFilter = channelId ? `AND m."channelId" = '${channelId}'` : "";

  const results = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      content: string;
      type: string;
      channelId: string;
      channelName: string;
      senderId: string;
      senderName: string;
      isRetracted: boolean;
      createdAt: Date;
      score: number;
    }>
  >(
    `
    SELECT
      m.id,
      m.content,
      m.type,
      m."channelId",
      ch.name as "channelName",
      m."senderId",
      u.name as "senderName",
      m."isRetracted",
      m."createdAt",
      pgroonga_score(tableoid, ctid) as score
    FROM "Message" m
    JOIN "Channel" ch ON ch.id = m."channelId"
    JOIN "User" u ON u.id = m."senderId"
    WHERE
      ch."orgId" = $1
      AND m."isRetracted" = false
      AND m.content &@~ $2
      ${channelFilter}
      AND m."channelId" IN (
        SELECT "channelId" FROM "ChannelMember" WHERE "userId" = $3
      )
    ORDER BY score DESC, m."createdAt" DESC
    LIMIT $4 OFFSET $5
    `,
    orgId,
    query,
    userId,
    limit,
    offset
  );

  return c.json({
    success: true,
    data: results,
    query,
  });
});
