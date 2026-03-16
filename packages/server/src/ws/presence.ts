import { redis } from "../lib/redis";
import { sendToChannel, getLocalOnlineUserIds } from "./connections";
import { PRESENCE_BATCH_INTERVAL } from "@xekuchat/core";
import { prisma } from "../lib/prisma";

// ============================================================
// Presence Manager — Batched broadcasting
// Only notifies members of the same channel, batched every 5s
// ============================================================

const ONLINE_SET_KEY = "xc:online";
const pendingPresenceUpdates = new Map<string, "online" | "offline" | "away">();

export async function setUserOnline(userId: string) {
  await redis.sadd(ONLINE_SET_KEY, userId);
  await prisma.user.update({ where: { id: userId }, data: { status: "online" } });
  pendingPresenceUpdates.set(userId, "online");
}

export async function setUserOffline(userId: string) {
  await redis.srem(ONLINE_SET_KEY, userId);
  await prisma.user.update({ where: { id: userId }, data: { status: "offline" } });
  pendingPresenceUpdates.set(userId, "offline");
}

export async function getOnlineUserIds(): Promise<string[]> {
  return redis.smembers(ONLINE_SET_KEY);
}

export async function isUserOnline(userId: string): Promise<boolean> {
  return (await redis.sismember(ONLINE_SET_KEY, userId)) === 1;
}

// Get online members for a specific channel
export async function getChannelOnlineMembers(channelId: string): Promise<string[]> {
  const members = await prisma.channelMember.findMany({
    where: { channelId },
    select: { userId: true },
  });
  const memberIds = members.map((m) => m.userId);
  if (memberIds.length === 0) return [];

  const onlineIds = await getOnlineUserIds();
  const onlineSet = new Set(onlineIds);
  return memberIds.filter((id) => onlineSet.has(id));
}

// ============================================================
// Batch presence flush — runs every PRESENCE_BATCH_INTERVAL
// ============================================================

let presenceInterval: ReturnType<typeof setInterval> | null = null;

export function startPresenceBatching() {
  if (presenceInterval) return;

  presenceInterval = setInterval(async () => {
    if (pendingPresenceUpdates.size === 0) return;

    const updates = new Map(pendingPresenceUpdates);
    pendingPresenceUpdates.clear();

    // For each user with a presence change, notify their channel members
    for (const [userId, status] of updates) {
      try {
        // Find all channels this user belongs to
        const memberships = await prisma.channelMember.findMany({
          where: { userId },
          select: { channelId: true },
        });

        const payload = JSON.stringify({ type: "presence", userId, status });

        for (const { channelId } of memberships) {
          sendToChannel(channelId, payload, userId);
        }
      } catch (err) {
        console.error("Presence broadcast error:", err);
      }
    }
  }, PRESENCE_BATCH_INTERVAL);
}

export function stopPresenceBatching() {
  if (presenceInterval) {
    clearInterval(presenceInterval);
    presenceInterval = null;
  }
}
