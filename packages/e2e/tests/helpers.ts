import { type APIRequestContext } from "@playwright/test";

const API_URL = process.env.TEST_API_URL || "http://localhost:3000";

// ============================================================
// Test Helpers — Create test users, orgs, channels via API
// ============================================================

// Since we use OIDC in production, tests use a test-only endpoint
// or directly create JWT tokens for testing purposes.
// In a real setup, you'd configure a test OIDC realm in Keycloak.

export interface TestUser {
  id: string;
  email: string;
  name: string;
  token: string;
}

// Create a test user and get a JWT token
// This calls a test-only endpoint that should be disabled in production
export async function createTestUser(
  request: APIRequestContext,
  data: { email: string; name: string }
): Promise<TestUser> {
  const res = await request.post(`${API_URL}/auth/test-login`, {
    data: { email: data.email, name: data.name },
  });
  const body = await res.json();
  return body.data;
}

// Create an organization
export async function createTestOrg(
  request: APIRequestContext,
  token: string,
  data: { name: string; slug: string }
) {
  const res = await request.post(`${API_URL}/api/orgs`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  return res.json();
}

// Create a channel
export async function createTestChannel(
  request: APIRequestContext,
  token: string,
  data: { orgId: string; name: string; type?: string }
) {
  const res = await request.post(`${API_URL}/api/channels`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  return res.json();
}

// Add member to org
export async function addOrgMember(
  request: APIRequestContext,
  token: string,
  orgId: string,
  email: string
) {
  const res = await request.post(`${API_URL}/api/orgs/${orgId}/members`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { email },
  });
  return res.json();
}

// Add member to channel
export async function addChannelMember(
  request: APIRequestContext,
  token: string,
  channelId: string,
  targetUserId: string
) {
  const res = await request.post(`${API_URL}/api/channels/${channelId}/members`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { targetUserId },
  });
  return res.json();
}

// Get messages
export async function getMessages(
  request: APIRequestContext,
  token: string,
  channelId: string
) {
  const res = await request.get(`${API_URL}/api/messages/${channelId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

// Connect to WebSocket and return a promise-based wrapper
export function connectWS(token: string): Promise<TestWebSocket> {
  return new Promise((resolve, reject) => {
    const wsUrl = `ws://localhost:3000/ws?token=${token}`;
    const ws = new WebSocket(wsUrl);
    const received: unknown[] = [];

    ws.onopen = () => {
      resolve({
        ws,
        received,
        send(data: unknown) {
          ws.send(JSON.stringify(data));
        },
        waitForMessage(type: string, timeoutMs = 5000): Promise<unknown> {
          return new Promise((res, rej) => {
            const timeout = setTimeout(() => rej(new Error(`Timeout waiting for ${type}`)), timeoutMs);

            // Check already received
            const existing = received.find((m: any) => m.type === type);
            if (existing) {
              clearTimeout(timeout);
              res(existing);
              return;
            }

            const handler = (e: MessageEvent) => {
              if (e.data === "pong") return;
              const msg = JSON.parse(e.data);
              received.push(msg);
              if (msg.type === type) {
                clearTimeout(timeout);
                ws.removeEventListener("message", handler);
                res(msg);
              }
            };
            ws.addEventListener("message", handler);
          });
        },
        close() {
          ws.close();
        },
      });
    };

    ws.onerror = () => reject(new Error("WebSocket connection failed"));
  });
}

export interface TestWebSocket {
  ws: WebSocket;
  received: unknown[];
  send(data: unknown): void;
  waitForMessage(type: string, timeoutMs?: number): Promise<unknown>;
  close(): void;
}
