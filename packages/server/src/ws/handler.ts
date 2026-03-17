import type { ServerWebSocket } from "bun";
import type { WSClientEvent, WSServerEvent } from "@xekuchat/core";
import { prisma } from "../lib/prisma";
import { writeAuditLog } from "../audit/log";
import {
  addConnection,
  removeConnection,
  sendToChannel,
  sendToUser,
  subscribeToChannel,
  isUserOnlineLocally,
  type WSData,
} from "./connections";
import { publishToChannel } from "./pubsub";
import { subscribeChannel, subscribeUser, unsubscribeUser } from "./pubsub";
import { checkRateLimit } from "./ratelimit";
import { setUserOnline, setUserOffline } from "./presence";
import { sendPushNotification } from "../lib/webpush";
import { handleAITrigger } from "../ai/trigger";

// ============================================================
// WebSocket Message Handler
// ============================================================

export async function handleWSOpen(ws: ServerWebSocket<WSData>) {
  addConnection(ws);
  subscribeUser(ws.data.userId);

  // Load user's channels and subscribe
  const memberships = await prisma.channelMember.findMany({
    where: { userId: ws.data.userId },
    select: { channelId: true },
  });

  for (const { channelId } of memberships) {
    subscribeToChannel(ws, channelId);
    subscribeChannel(channelId);
  }

  await setUserOnline(ws.data.userId);
  console.log(`WS connected: ${ws.data.userId}`);
}

export async function handleWSClose(ws: ServerWebSocket<WSData>) {
  removeConnection(ws);
  unsubscribeUser(ws.data.userId);
  await setUserOffline(ws.data.userId);
  console.log(`WS disconnected: ${ws.data.userId}`);
}

export async function handleWSMessage(ws: ServerWebSocket<WSData>, raw: string | Buffer) {
  const text = typeof raw === "string" ? raw : raw.toString();

  // Handle ping/pong heartbeat
  if (text === "ping") {
    ws.data.lastPing = Date.now();
    ws.send("pong");
    return;
  }

  let event: WSClientEvent;
  try {
    event = JSON.parse(text);
  } catch {
    ws.send(JSON.stringify({ type: "error", code: "PARSE_ERROR", message: "Invalid JSON" }));
    return;
  }

  switch (event.type) {
    case "message:send":
      await handleSendMessage(ws, event);
      break;
    case "message:retract":
      await handleRetractMessage(ws, event);
      break;
    case "typing:start":
    case "typing:stop":
      await handleTyping(ws, event);
      break;
    case "read:update":
      await handleReadUpdate(ws, event);
      break;
    case "channel:join":
      await handleChannelJoin(ws, event);
      break;
    default:
      ws.send(JSON.stringify({ type: "error", code: "UNKNOWN_EVENT", message: "Unknown event type" }));
  }
}

// ============================================================
// Event Handlers
// ============================================================

async function handleSendMessage(
  ws: ServerWebSocket<WSData>,
  event: Extract<WSClientEvent, { type: "message:send" }>
) {
  const userId = ws.data.userId;

  // Rate limit
  if (!checkRateLimit(userId)) {
    ws.send(JSON.stringify({ type: "error", code: "RATE_LIMITED", message: "Too many messages" }));
    return;
  }

  // Verify membership
  if (!ws.data.channels.has(event.channelId)) {
    ws.send(JSON.stringify({ type: "error", code: "NOT_MEMBER", message: "Not a member of this channel" }));
    return;
  }

  // Block non-super-admins from sending to readonly channels
  const channel = await prisma.channel.findUnique({ where: { id: event.channelId }, select: { type: true, name: true } });
  if (channel?.type === "readonly") {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
    if (!user?.isSuperAdmin) {
      ws.send(JSON.stringify({ type: "error", code: "READONLY_CHANNEL", message: "This channel is read-only" }));
      return;
    }
  }

  // Create message in DB
  const message = await prisma.message.create({
    data: {
      content: event.content,
      type: event.messageType || "text",
      channelId: event.channelId,
      senderId: userId,
      replyToId: event.replyToId || null,
      ...(event.fileName && {
        attachments: {
          create: {
            name: event.fileName,
            url: event.content,
            mimeType: event.fileMimeType || "application/octet-stream",
            size: event.fileSize || 0,
          },
        },
      }),
    },
    include: {
      sender: { select: { id: true, name: true, avatar: true, isBot: true } },
      attachments: true,
    },
  });

  const payload: WSServerEvent = {
    type: "message:new",
    message: {
      id: message.id,
      content: message.content,
      type: message.type as WSServerEvent extends { type: "message:new" } ? never : string,
      channelId: message.channelId,
      senderId: message.senderId,
      sender: message.sender,
      replyToId: message.replyToId,
      isRetracted: false,
      attachments: message.attachments.map((a) => ({
        id: a.id,
        name: a.name,
        url: a.url,
        mimeType: a.mimeType,
        size: a.size,
      })),
      createdAt: message.createdAt.toISOString(),
    },
  };

  const payloadStr = JSON.stringify(payload);

  // Send to local connections + publish for other nodes
  sendToChannel(event.channelId, payloadStr);
  await publishToChannel(event.channelId, payloadStr, userId);

  // Web Push: notify offline channel members who have not muted the channel
  const members = await prisma.channelMember.findMany({
    where: { channelId: event.channelId, userId: { not: userId }, isMuted: false },
    select: { userId: true },
  });

  const offlineUserIds = members
    .map((m) => m.userId)
    .filter((id) => !isUserOnlineLocally(id));

  if (offlineUserIds.length > 0) {
    const senderName = message.sender.name;
    const pushTitle = channel?.type === "dm" ? senderName : (channel?.name ?? "XekuChat");
    const pushBody = message.type === "text"
      ? (message.content.length > 100 ? message.content.slice(0, 97) + "..." : message.content)
      : message.type === "image" ? "📷 圖片" : "📎 檔案";

    const subs = await prisma.pushSubscription.findMany({
      where: { userId: { in: offlineUserIds } },
    });

    for (const sub of subs) {
      const keys = sub.keys as { p256dh: string; auth: string };
      sendPushNotification(sub.endpoint, keys, {
        title: pushTitle,
        body: pushBody,
        data: { channelId: event.channelId },
      }).catch(async (err: { statusCode?: number }) => {
        // Remove expired subscriptions
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      });
    }
  }

  // Fire-and-forget AI trigger (must not block message delivery)
  handleAITrigger(event.channelId, message.id, userId)
    .catch((err) => console.error("AI trigger error:", err));
}

async function handleRetractMessage(
  ws: ServerWebSocket<WSData>,
  event: Extract<WSClientEvent, { type: "message:retract" }>
) {
  const userId = ws.data.userId;

  const message = await prisma.message.findUnique({
    where: { id: event.messageId },
  });

  if (!message) {
    ws.send(JSON.stringify({ type: "error", code: "FORBIDDEN", message: "Cannot retract this message" }));
    return;
  }

  // Allow: message sender, channel admin, org admin, or super admin
  const isSender = message.senderId === userId;
  if (!isSender) {
    const [channelMember, orgMember, actor] = await Promise.all([
      prisma.channelMember.findUnique({ where: { userId_channelId: { userId, channelId: message.channelId } }, select: { role: true } }),
      prisma.channel.findUnique({ where: { id: message.channelId }, select: { orgId: true } }).then((ch) =>
        ch ? prisma.orgMember.findUnique({ where: { userId_orgId: { userId, orgId: ch.orgId } }, select: { role: true } }) : null
      ),
      prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } }),
    ]);

    const canModerate =
      actor?.isSuperAdmin ||
      channelMember?.role === "admin" ||
      orgMember?.role === "admin";

    if (!canModerate) {
      ws.send(JSON.stringify({ type: "error", code: "FORBIDDEN", message: "Cannot retract this message" }));
      return;
    }
  }

  await prisma.message.update({
    where: { id: event.messageId },
    data: { isRetracted: true, content: "" },
  });

  // Get orgId for audit log
  const channel = await prisma.channel.findUnique({
    where: { id: message.channelId },
    select: { orgId: true },
  });

  if (channel) {
    await writeAuditLog({
      orgId: channel.orgId,
      action: "message_retract",
      actorId: userId,
      targetId: event.messageId,
      meta: { originalContent: message.content },
    });
  }

  const payload: WSServerEvent = {
    type: "message:retracted",
    messageId: event.messageId,
    channelId: message.channelId,
  };

  const payloadStr = JSON.stringify(payload);
  sendToChannel(message.channelId, payloadStr);
  await publishToChannel(message.channelId, payloadStr);
}

async function handleTyping(
  ws: ServerWebSocket<WSData>,
  event: Extract<WSClientEvent, { type: "typing:start" | "typing:stop" }>
) {
  if (!ws.data.channels.has(event.channelId)) return;

  const payload: WSServerEvent = {
    type: "typing",
    channelId: event.channelId,
    userId: ws.data.userId,
    isTyping: event.type === "typing:start",
  };

  const payloadStr = JSON.stringify(payload);
  sendToChannel(event.channelId, payloadStr, ws.data.userId);
  await publishToChannel(event.channelId, payloadStr, ws.data.userId);
}

async function handleReadUpdate(
  ws: ServerWebSocket<WSData>,
  event: Extract<WSClientEvent, { type: "read:update" }>
) {
  const userId = ws.data.userId;

  // Upsert read cursor
  await prisma.channelReadCursor.upsert({
    where: { userId_channelId: { userId, channelId: event.channelId } },
    update: { lastReadMsgId: event.messageId, lastReadAt: new Date() },
    create: { userId, channelId: event.channelId, lastReadMsgId: event.messageId },
  });

  // Count readers for this message
  const readCount = await prisma.channelReadCursor.count({
    where: {
      channelId: event.channelId,
      lastReadMsgId: { gte: event.messageId },
    },
  });

  const payload: WSServerEvent = {
    type: "read:updated",
    channelId: event.channelId,
    messageId: event.messageId,
    readCount,
  };

  const payloadStr = JSON.stringify(payload);
  sendToChannel(event.channelId, payloadStr);
  await publishToChannel(event.channelId, payloadStr);
}

async function handleChannelJoin(
  ws: ServerWebSocket<WSData>,
  event: Extract<WSClientEvent, { type: "channel:join" }>
) {
  const userId = ws.data.userId;

  // Verify actual DB membership before subscribing
  const member = await prisma.channelMember.findUnique({
    where: { userId_channelId: { userId, channelId: event.channelId } },
  });

  if (!member) {
    ws.send(JSON.stringify({ type: "error", code: "NOT_MEMBER", message: "Not a member of this channel" }));
    return;
  }

  subscribeToChannel(ws, event.channelId);
  subscribeChannel(event.channelId);
}
