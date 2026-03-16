import type { ServerWebSocket } from "bun";
import { redis } from "../lib/redis";
import { WS_HEARTBEAT_INTERVAL, WS_TIMEOUT } from "@xekuchat/core";

// ============================================================
// WebSocket Connection Manager
// Manages per-node connections, heartbeat, and user mapping
// ============================================================

export interface WSData {
  userId: string;
  channels: Set<string>;
  lastPing: number;
}

// userId -> Set of WebSocket connections (one user may have multiple tabs/devices)
const userConnections = new Map<string, Set<ServerWebSocket<WSData>>>();

// All active connections on this node
const allConnections = new Set<ServerWebSocket<WSData>>();

export function addConnection(ws: ServerWebSocket<WSData>) {
  allConnections.add(ws);

  const userId = ws.data.userId;
  let conns = userConnections.get(userId);
  if (!conns) {
    conns = new Set();
    userConnections.set(userId, conns);
  }
  conns.add(ws);
}

export function removeConnection(ws: ServerWebSocket<WSData>) {
  allConnections.delete(ws);

  const userId = ws.data.userId;
  const conns = userConnections.get(userId);
  if (conns) {
    conns.delete(ws);
    if (conns.size === 0) {
      userConnections.delete(userId);
    }
  }
}

export function getUserConnections(userId: string): Set<ServerWebSocket<WSData>> | undefined {
  return userConnections.get(userId);
}

export function isUserOnlineLocally(userId: string): boolean {
  return userConnections.has(userId);
}

export function getLocalOnlineUserIds(): string[] {
  return Array.from(userConnections.keys());
}

// Send to all connections of a specific user on this node
export function sendToUser(userId: string, data: string) {
  const conns = userConnections.get(userId);
  if (!conns) return;
  for (const ws of conns) {
    ws.send(data);
  }
}

// Send to all connections subscribed to a channel on this node
export function sendToChannel(channelId: string, data: string, excludeUserId?: string) {
  for (const ws of allConnections) {
    if (ws.data.channels.has(channelId) && ws.data.userId !== excludeUserId) {
      ws.send(data);
    }
  }
}

// Subscribe a connection to a channel
export function subscribeToChannel(ws: ServerWebSocket<WSData>, channelId: string) {
  ws.data.channels.add(channelId);
}

// Unsubscribe from a channel
export function unsubscribeFromChannel(ws: ServerWebSocket<WSData>, channelId: string) {
  ws.data.channels.delete(channelId);
}

// ============================================================
// Heartbeat — detect dead connections
// ============================================================

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

export function startHeartbeat() {
  if (heartbeatInterval) return;

  heartbeatInterval = setInterval(() => {
    const now = Date.now();
    for (const ws of allConnections) {
      if (now - ws.data.lastPing > WS_TIMEOUT) {
        ws.close(1000, "Heartbeat timeout");
      }
    }
  }, WS_HEARTBEAT_INTERVAL);
}

export function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}
