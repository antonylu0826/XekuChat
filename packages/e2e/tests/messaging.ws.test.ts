import { test, expect } from "@playwright/test";
import {
  createTestUser,
  createTestOrg,
  createTestChannel,
  addOrgMember,
  addChannelMember,
  connectWS,
  getMessages,
} from "./helpers";

test.describe("WebSocket Messaging @ws", () => {
  test("should send and receive messages in real-time", async ({ request }) => {
    // Setup: 2 users in the same channel
    const alice = await createTestUser(request, {
      email: "ws-alice@example.com",
      name: "Alice",
    });
    const bob = await createTestUser(request, {
      email: "ws-bob@example.com",
      name: "Bob",
    });

    const org = await createTestOrg(request, alice.token, {
      name: "WS Org",
      slug: "ws-org",
    });
    await addOrgMember(request, alice.token, org.data.id, bob.email);

    const channel = await createTestChannel(request, alice.token, {
      orgId: org.data.id,
      name: "ws-test",
    });
    await addChannelMember(request, alice.token, channel.data.id, bob.id);

    // Connect WebSockets
    const wsAlice = await connectWS(alice.token);
    const wsBob = await connectWS(bob.token);

    try {
      // Alice sends a message
      wsAlice.send({
        type: "message:send",
        channelId: channel.data.id,
        content: "Hello from Alice!",
      });

      // Bob should receive it
      const msg = (await wsBob.waitForMessage("message:new")) as any;
      expect(msg.message.content).toBe("Hello from Alice!");
      expect(msg.message.senderId).toBe(alice.id);

      // Verify message is persisted in DB
      const messages = await getMessages(request, alice.token, channel.data.id);
      expect(messages.items.some((m: any) => m.content === "Hello from Alice!")).toBe(true);
    } finally {
      wsAlice.close();
      wsBob.close();
    }
  });

  test("should show typing indicator", async ({ request }) => {
    const alice = await createTestUser(request, {
      email: "typing-alice@example.com",
      name: "Typing Alice",
    });
    const bob = await createTestUser(request, {
      email: "typing-bob@example.com",
      name: "Typing Bob",
    });

    const org = await createTestOrg(request, alice.token, {
      name: "Typing Org",
      slug: "typing-org",
    });
    await addOrgMember(request, alice.token, org.data.id, bob.email);

    const channel = await createTestChannel(request, alice.token, {
      orgId: org.data.id,
      name: "typing-test",
    });
    await addChannelMember(request, alice.token, channel.data.id, bob.id);

    const wsAlice = await connectWS(alice.token);
    const wsBob = await connectWS(bob.token);

    try {
      // Alice starts typing
      wsAlice.send({
        type: "typing:start",
        channelId: channel.data.id,
      });

      // Bob should see typing indicator
      const typing = (await wsBob.waitForMessage("typing")) as any;
      expect(typing.userId).toBe(alice.id);
      expect(typing.isTyping).toBe(true);
    } finally {
      wsAlice.close();
      wsBob.close();
    }
  });

  test("should retract message and create audit log", async ({ request }) => {
    const user = await createTestUser(request, {
      email: "retract-user@example.com",
      name: "Retract User",
    });

    const org = await createTestOrg(request, user.token, {
      name: "Retract Org",
      slug: "retract-org",
    });

    const channel = await createTestChannel(request, user.token, {
      orgId: org.data.id,
      name: "retract-test",
    });

    const ws = await connectWS(user.token);

    try {
      // Send a message
      ws.send({
        type: "message:send",
        channelId: channel.data.id,
        content: "This will be retracted",
      });

      const newMsg = (await ws.waitForMessage("message:new")) as any;
      const messageId = newMsg.message.id;

      // Retract the message
      ws.send({
        type: "message:retract",
        messageId,
      });

      const retracted = (await ws.waitForMessage("message:retracted")) as any;
      expect(retracted.messageId).toBe(messageId);

      // Verify message is retracted in DB
      const messages = await getMessages(request, user.token, channel.data.id);
      const found = messages.items.find((m: any) => m.id === messageId);
      expect(found.isRetracted).toBe(true);
    } finally {
      ws.close();
    }
  });

  test("should update read cursor and return read count", async ({ request }) => {
    const alice = await createTestUser(request, {
      email: "read-alice@example.com",
      name: "Read Alice",
    });
    const bob = await createTestUser(request, {
      email: "read-bob@example.com",
      name: "Read Bob",
    });

    const org = await createTestOrg(request, alice.token, {
      name: "Read Org",
      slug: "read-org",
    });
    await addOrgMember(request, alice.token, org.data.id, bob.email);

    const channel = await createTestChannel(request, alice.token, {
      orgId: org.data.id,
      name: "read-test",
    });
    await addChannelMember(request, alice.token, channel.data.id, bob.id);

    const wsAlice = await connectWS(alice.token);
    const wsBob = await connectWS(bob.token);

    try {
      // Alice sends a message
      wsAlice.send({
        type: "message:send",
        channelId: channel.data.id,
        content: "Read this!",
      });

      const newMsg = (await wsBob.waitForMessage("message:new")) as any;

      // Bob marks as read
      wsBob.send({
        type: "read:update",
        channelId: channel.data.id,
        messageId: newMsg.message.id,
      });

      // Alice should get read count update
      const readUpdate = (await wsAlice.waitForMessage("read:updated")) as any;
      expect(readUpdate.readCount).toBeGreaterThanOrEqual(1);
    } finally {
      wsAlice.close();
      wsBob.close();
    }
  });

  test("should rate limit message flood", async ({ request }) => {
    const user = await createTestUser(request, {
      email: "ratelimit@example.com",
      name: "Rate Limit User",
    });

    const org = await createTestOrg(request, user.token, {
      name: "Rate Org",
      slug: "rate-org",
    });

    const channel = await createTestChannel(request, user.token, {
      orgId: org.data.id,
      name: "rate-test",
    });

    const ws = await connectWS(user.token);

    try {
      // Send 15 messages rapidly (limit is 10/sec)
      for (let i = 0; i < 15; i++) {
        ws.send({
          type: "message:send",
          channelId: channel.data.id,
          content: `Flood ${i}`,
        });
      }

      // Should receive a rate limit error
      const error = (await ws.waitForMessage("error")) as any;
      expect(error.code).toBe("RATE_LIMITED");
    } finally {
      ws.close();
    }
  });

  test("should reject message to non-member channel", async ({ request }) => {
    const alice = await createTestUser(request, {
      email: "nonmember-alice@example.com",
      name: "NonMember Alice",
    });
    const bob = await createTestUser(request, {
      email: "nonmember-bob@example.com",
      name: "NonMember Bob",
    });

    const org = await createTestOrg(request, alice.token, {
      name: "NonMember Org",
      slug: "nonmember-org",
    });

    // Alice creates a channel but does NOT add Bob
    const channel = await createTestChannel(request, alice.token, {
      orgId: org.data.id,
      name: "private-test",
    });

    // Bob connects and tries to send to Alice's channel
    await addOrgMember(request, alice.token, org.data.id, bob.email);
    const wsBob = await connectWS(bob.token);

    try {
      wsBob.send({
        type: "message:send",
        channelId: channel.data.id,
        content: "Should be rejected",
      });

      const error = (await wsBob.waitForMessage("error")) as any;
      expect(error.code).toBe("NOT_MEMBER");
    } finally {
      wsBob.close();
    }
  });
});
