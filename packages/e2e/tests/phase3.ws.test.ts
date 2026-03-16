import { test, expect } from "@playwright/test";
import {
  createTestUser,
  createTestOrg,
  createTestChannel,
  addOrgMember,
  addChannelMember,
  connectWS,
} from "./helpers";

const API_URL = process.env.TEST_API_URL || "http://localhost:3000";

test.describe("Phase 3 — Reaction broadcast via WebSocket", () => {
  let user1: Awaited<ReturnType<typeof createTestUser>>;
  let user2: Awaited<ReturnType<typeof createTestUser>>;
  let channelId: string;

  test.beforeAll(async ({ request }) => {
    user1 = await createTestUser(request, { email: "wsreact1@test.com", name: "WSReactor1" });
    user2 = await createTestUser(request, { email: "wsreact2@test.com", name: "WSReactor2" });

    const org = await createTestOrg(request, user1.token, { name: "WSReact Org", slug: "wsreact-org" });
    const orgId = org.data.id;
    await addOrgMember(request, user1.token, orgId, user2.email);

    const ch = await createTestChannel(request, user1.token, { orgId, name: "wsreact-ch" });
    channelId = ch.data.id;
    await addChannelMember(request, user1.token, channelId, user2.id);
  });

  test("should broadcast reaction:updated to channel members", async ({ request }) => {
    const ws1 = await connectWS(user1.token);
    const ws2 = await connectWS(user2.token);

    // User1 sends a message
    ws1.send({ type: "message:send", channelId, content: "react to me via ws" });
    const msg: any = await ws1.waitForMessage("message:new");
    const messageId = msg.message.id;

    // Also wait for user2 to receive it
    await ws2.waitForMessage("message:new");

    // User2 adds a reaction via API
    const res = await request.post(`${API_URL}/api/reactions`, {
      headers: {
        Authorization: `Bearer ${user2.token}`,
        "Content-Type": "application/json",
      },
      data: { messageId, emoji: "🔥" },
    });
    expect(res.ok()).toBeTruthy();

    // User1 should receive reaction:updated via WebSocket
    const reactionEvent: any = await ws1.waitForMessage("reaction:updated", 5000);
    expect(reactionEvent.messageId).toBe(messageId);
    expect(reactionEvent.reactions).toBeTruthy();
    expect(reactionEvent.reactions.length).toBeGreaterThanOrEqual(1);

    ws1.close();
    ws2.close();
  });
});

test.describe("Phase 3 — Message with reply via WebSocket", () => {
  let user1: Awaited<ReturnType<typeof createTestUser>>;
  let channelId: string;

  test.beforeAll(async ({ request }) => {
    user1 = await createTestUser(request, { email: "wsreply@test.com", name: "WSReplier" });

    const org = await createTestOrg(request, user1.token, { name: "Reply Org", slug: "reply-org" });
    const ch = await createTestChannel(request, user1.token, { orgId: org.data.id, name: "reply-ch" });
    channelId = ch.data.id;
  });

  test("should send and receive a reply message with replyToId", async () => {
    const ws = await connectWS(user1.token);

    // Send original message
    ws.send({ type: "message:send", channelId, content: "original message" });
    const original: any = await ws.waitForMessage("message:new");
    const originalId = original.message.id;

    // Send reply
    ws.send({
      type: "message:send",
      channelId,
      content: "this is a reply",
      replyToId: originalId,
    });
    const reply: any = await ws.waitForMessage("message:new");
    expect(reply.message.content).toBe("this is a reply");
    expect(reply.message.replyToId).toBe(originalId);

    ws.close();
  });
});
