import { test, expect } from "@playwright/test";
import {
  createTestUser,
  createTestOrg,
  createTestChannel,
  addOrgMember,
  addChannelMember,
  connectWS,
} from "./helpers";

test.describe("WebSocket Reconnection & Gap Fill @ws", () => {
  test("should fill message gap after reconnection", async ({ request }) => {
    const alice = await createTestUser(request, {
      email: "gap-alice@example.com",
      name: "Gap Alice",
    });
    const bob = await createTestUser(request, {
      email: "gap-bob@example.com",
      name: "Gap Bob",
    });

    const org = await createTestOrg(request, alice.token, {
      name: "Gap Org",
      slug: "gap-org",
    });
    await addOrgMember(request, alice.token, org.data.id, bob.email);

    const channel = await createTestChannel(request, alice.token, {
      orgId: org.data.id,
      name: "gap-test",
    });
    await addChannelMember(request, alice.token, channel.data.id, bob.id);

    // Bob connects, gets a message, then disconnects
    const wsBob1 = await connectWS(bob.token);
    const wsAlice = await connectWS(alice.token);

    // Alice sends message 1
    wsAlice.send({
      type: "message:send",
      channelId: channel.data.id,
      content: "Message 1 - before disconnect",
    });
    const msg1 = (await wsBob1.waitForMessage("message:new")) as any;
    const lastMsgId = msg1.message.id;

    // Bob disconnects
    wsBob1.close();

    // Alice sends messages while Bob is offline
    wsAlice.send({
      type: "message:send",
      channelId: channel.data.id,
      content: "Message 2 - during disconnect",
    });
    // Wait for Alice to receive her own message
    await wsAlice.waitForMessage("message:new");

    wsAlice.send({
      type: "message:send",
      channelId: channel.data.id,
      content: "Message 3 - during disconnect",
    });
    await wsAlice.waitForMessage("message:new");

    // Bob reconnects and fetches gap fill via API
    const res = await request.get(
      `/api/messages/${channel.data.id}/since/${lastMsgId}`,
      {
        headers: { Authorization: `Bearer ${bob.token}` },
      }
    );

    const body = await res.json();
    expect(body.data.length).toBe(2);
    expect(body.data[0].content).toBe("Message 2 - during disconnect");
    expect(body.data[1].content).toBe("Message 3 - during disconnect");

    wsAlice.close();
  });
});
