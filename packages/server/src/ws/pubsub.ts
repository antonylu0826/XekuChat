import { redis, redisSub } from "../lib/redis";
import { sendToChannel, sendToUser } from "./connections";

// ============================================================
// Redis Pub/Sub — Cross-node message broadcasting
// ============================================================

const CHANNEL_PREFIX = "xc:ch:";
const USER_PREFIX = "xc:user:";
const PRESENCE_CHANNEL = "xc:presence";

interface PubSubMessage {
  type: "channel_message" | "user_message" | "presence";
  payload: string; // JSON stringified WSServerEvent
  channelId?: string;
  userId?: string;
  excludeUserId?: string;
}

// Publish a message to a channel (all nodes will receive it)
export async function publishToChannel(
  channelId: string,
  payload: string,
  excludeUserId?: string
) {
  const msg: PubSubMessage = {
    type: "channel_message",
    payload,
    channelId,
    excludeUserId,
  };
  await redis.publish(CHANNEL_PREFIX + channelId, JSON.stringify(msg));
}

// Publish a direct message to a user (all nodes will receive it)
export async function publishToUser(userId: string, payload: string) {
  const msg: PubSubMessage = {
    type: "user_message",
    payload,
    userId,
  };
  await redis.publish(USER_PREFIX + userId, JSON.stringify(msg));
}

// Publish presence update
export async function publishPresence(userId: string, status: string) {
  const msg: PubSubMessage = {
    type: "presence",
    payload: JSON.stringify({ type: "presence", userId, status }),
  };
  await redis.publish(PRESENCE_CHANNEL, JSON.stringify(msg));
}

// ============================================================
// Subscriber — handles incoming messages from other nodes
// ============================================================

const subscribedChannels = new Set<string>();

export function subscribeChannel(channelId: string) {
  const key = CHANNEL_PREFIX + channelId;
  if (subscribedChannels.has(key)) return;
  subscribedChannels.add(key);
  redisSub.subscribe(key);
}

export function unsubscribeChannel(channelId: string) {
  const key = CHANNEL_PREFIX + channelId;
  subscribedChannels.delete(key);
  redisSub.unsubscribe(key);
}

export function subscribeUser(userId: string) {
  redisSub.subscribe(USER_PREFIX + userId);
}

export function unsubscribeUser(userId: string) {
  redisSub.unsubscribe(USER_PREFIX + userId);
}

// Initialize subscriber message handler
export function initPubSub() {
  redisSub.subscribe(PRESENCE_CHANNEL);

  redisSub.on("message", (_channel: string, rawMessage: string) => {
    try {
      const msg: PubSubMessage = JSON.parse(rawMessage);

      switch (msg.type) {
        case "channel_message":
          if (msg.channelId) {
            sendToChannel(msg.channelId, msg.payload, msg.excludeUserId);
          }
          break;

        case "user_message":
          if (msg.userId) {
            sendToUser(msg.userId, msg.payload);
          }
          break;

        case "presence":
          // Presence events are broadcast to all local connections
          // The client filters by its subscribed channels
          // (handled by the presence batching system)
          break;
      }
    } catch (err) {
      console.error("PubSub message parse error:", err);
    }
  });

  console.log("Redis Pub/Sub initialized");
}
