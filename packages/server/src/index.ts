import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { authRoutes } from "./routes/auth";
import { orgRoutes } from "./routes/org";
import { channelRoutes } from "./routes/channel";
import { messageRoutes } from "./routes/message";
import { healthRoutes } from "./routes/health";
import { uploadRoutes } from "./routes/upload";
import { tusRoutes } from "./routes/tus";
import { searchRoutes } from "./routes/search";
import { reactionRoutes } from "./routes/reaction";
import { previewRoutes } from "./routes/preview";
import { adminRoutes } from "./routes/admin";
import { userRoutes } from "./routes/user";
import { pushRoutes } from "./routes/push";
import { systemRoutes } from "./routes/system";
import { v1Routes } from "./routes/v1";
import { redis, redisSub } from "./lib/redis";
import { prisma } from "./lib/prisma";
import { verifyAccessToken } from "./auth/jwt";
import { handleWSOpen, handleWSClose, handleWSMessage } from "./ws/handler";
import { startHeartbeat, stopHeartbeat, type WSData } from "./ws/connections";
import { initPubSub } from "./ws/pubsub";
import { startPresenceBatching, stopPresenceBatching } from "./ws/presence";
import { ensureBucket } from "./lib/minio";
import { startWebhookRetryWorker, stopWebhookRetryWorker } from "./integration/webhook";

const app = new Hono();

// ---- Middleware ----
app.use("*", logger());
app.use("*", secureHeaders());
app.use(
  "*",
  cors({
    // In dev, accept any origin so reverse proxies/tunnels work without reconfiguring.
    // In production, restrict to APP_URL.
    origin: process.env.NODE_ENV === "development"
      ? (origin) => origin ?? "*"
      : process.env.APP_URL || "http://localhost:5173",
    credentials: true,
  })
);

// ---- Routes ----
app.route("/health", healthRoutes);
app.route("/auth", authRoutes);
app.route("/api/orgs", orgRoutes);
app.route("/api/channels", channelRoutes);
app.route("/api/messages", messageRoutes);
app.route("/api/upload", uploadRoutes);
app.route("/api/tus", tusRoutes);
app.route("/api/search", searchRoutes);
app.route("/api/reactions", reactionRoutes);
app.route("/api/preview", previewRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/users", userRoutes);
app.route("/api/push", pushRoutes);
app.route("/api/system", systemRoutes);
app.route("/api/v1", v1Routes);

// ---- Initialize services ----
initPubSub();
startHeartbeat();
startPresenceBatching();
startWebhookRetryWorker();
ensureBucket().catch((err) => console.warn("MinIO bucket init:", err.message));
initSuperAdminLocalAccount().catch((err) => console.warn("Super admin init:", err.message));

// ---- Super admin local account init ----
async function initSuperAdminLocalAccount() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) return;

  const existing = await prisma.user.findUnique({ where: { email }, select: { passwordHash: true, isSuperAdmin: true } });

  // Skip rehashing if password hasn't changed
  if (existing?.passwordHash && await Bun.password.verify(password, existing.passwordHash)) {
    if (!existing.isSuperAdmin) await prisma.user.update({ where: { email }, data: { isSuperAdmin: true } });
    console.log(`Super admin local account ready: ${email}`);
    return;
  }

  const passwordHash = await Bun.password.hash(password);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, isSuperAdmin: true },
    create: { email, name: email.split("@")[0], provider: "local", isSuperAdmin: true, passwordHash },
  });
  console.log(`Super admin local account ready: ${email}`);
}

// ---- Graceful shutdown ----
async function shutdown() {
  console.log("Shutting down...");
  stopHeartbeat();
  stopPresenceBatching();
  stopWebhookRetryWorker();
  redisSub.disconnect();
  redis.disconnect();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ---- Start ----
const port = parseInt(process.env.APP_PORT || "3000");
console.log(`XekuChat server starting on port ${port}`);

export default {
  port,
  async fetch(req: Request, server: import("bun").Server) {
    // Handle WebSocket upgrade before Hono to avoid "Context not finalized" error
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const token = url.searchParams.get("token");
      if (!token) {
        return new Response(JSON.stringify({ error: "Missing token" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      try {
        const payload = await verifyAccessToken(token);
        const upgraded = server.upgrade(req, {
          data: {
            userId: payload.sub,
            channels: new Set<string>(),
            lastPing: Date.now(),
          } satisfies WSData,
        });
        if (upgraded) return undefined as never;
        return new Response(JSON.stringify({ error: "WebSocket upgrade failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ error: "Invalid token" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return app.fetch(req, server);
  },
  websocket: {
    async open(ws: import("bun").ServerWebSocket<WSData>) {
      await handleWSOpen(ws);
    },
    async message(ws: import("bun").ServerWebSocket<WSData>, message: string | Buffer) {
      await handleWSMessage(ws, message);
    },
    async close(ws: import("bun").ServerWebSocket<WSData>) {
      await handleWSClose(ws);
    },
  },
};
