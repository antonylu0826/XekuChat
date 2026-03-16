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

test.describe("Phase 3 — File Upload", () => {
  let user: Awaited<ReturnType<typeof createTestUser>>;
  let orgId: string;
  let channelId: string;

  test.beforeAll(async ({ request }) => {
    user = await createTestUser(request, { email: "upload@test.com", name: "Uploader" });
    const org = await createTestOrg(request, user.token, { name: "Upload Org", slug: "upload-org" });
    orgId = org.data.id;
    const ch = await createTestChannel(request, user.token, { orgId, name: "upload-test" });
    channelId = ch.data.id;
  });

  test("should upload a file via multipart POST", async ({ request }) => {
    const content = Buffer.from("hello world");
    const res = await request.post(`${API_URL}/api/upload`, {
      headers: { Authorization: `Bearer ${user.token}` },
      multipart: {
        file: {
          name: "test.txt",
          mimeType: "text/plain",
          buffer: content,
        },
      },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("test.txt");
    expect(body.data.url).toBeTruthy();
    expect(body.data.mimeType).toBe("text/plain");
  });

  test("should upload a pasted image via base64", async ({ request }) => {
    // 1x1 red PNG
    const base64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
    const res = await request.post(`${API_URL}/api/upload/paste`, {
      headers: {
        Authorization: `Bearer ${user.token}`,
        "Content-Type": "application/json",
      },
      data: { data: base64, mimeType: "image/png" },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.mimeType).toBe("image/png");
    expect(body.data.url).toBeTruthy();
  });

  test("should reject disallowed file types", async ({ request }) => {
    const content = Buffer.from("fake exe");
    const res = await request.post(`${API_URL}/api/upload`, {
      headers: { Authorization: `Bearer ${user.token}` },
      multipart: {
        file: {
          name: "malware.exe",
          mimeType: "application/x-msdownload",
          buffer: content,
        },
      },
    });

    expect(res.status()).toBe(400);
  });
});

test.describe("Phase 3 — Search", () => {
  let user: Awaited<ReturnType<typeof createTestUser>>;
  let orgId: string;
  let channelId: string;

  test.beforeAll(async ({ request }) => {
    user = await createTestUser(request, { email: "search@test.com", name: "Searcher" });
    const org = await createTestOrg(request, user.token, { name: "Search Org", slug: "search-org" });
    orgId = org.data.id;
    const ch = await createTestChannel(request, user.token, { orgId, name: "search-test" });
    channelId = ch.data.id;

    // Send messages via WebSocket so they exist in DB
    const ws = await connectWS(user.token);
    ws.send({ type: "message:send", channelId, content: "unique-keyword-alpha for testing" });
    await ws.waitForMessage("message:new");
    ws.send({ type: "message:send", channelId, content: "another message without keyword" });
    await ws.waitForMessage("message:new");
    ws.close();

    // Wait a moment for indexing
    await new Promise((r) => setTimeout(r, 500));
  });

  test("should find messages matching query", async ({ request }) => {
    const res = await request.get(
      `${API_URL}/api/search/messages?q=unique-keyword-alpha&orgId=${orgId}`,
      { headers: { Authorization: `Bearer ${user.token}` } }
    );

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].content).toContain("unique-keyword-alpha");
  });

  test("should return empty for no match", async ({ request }) => {
    const res = await request.get(
      `${API_URL}/api/search/messages?q=zzz-nonexistent-zzz&orgId=${orgId}`,
      { headers: { Authorization: `Bearer ${user.token}` } }
    );

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data.length).toBe(0);
  });

  test("should reject short queries", async ({ request }) => {
    const res = await request.get(`${API_URL}/api/search/messages?q=a&orgId=${orgId}`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });

    expect(res.status()).toBe(400);
  });
});

test.describe("Phase 3 — Reactions", () => {
  let user1: Awaited<ReturnType<typeof createTestUser>>;
  let user2: Awaited<ReturnType<typeof createTestUser>>;
  let orgId: string;
  let channelId: string;
  let messageId: string;

  test.beforeAll(async ({ request }) => {
    user1 = await createTestUser(request, { email: "react1@test.com", name: "Reactor1" });
    user2 = await createTestUser(request, { email: "react2@test.com", name: "Reactor2" });

    const org = await createTestOrg(request, user1.token, { name: "React Org", slug: "react-org" });
    orgId = org.data.id;
    await addOrgMember(request, user1.token, orgId, user2.email);

    const ch = await createTestChannel(request, user1.token, { orgId, name: "react-test" });
    channelId = ch.data.id;
    await addChannelMember(request, user1.token, channelId, user2.id);

    // Send a message
    const ws = await connectWS(user1.token);
    ws.send({ type: "message:send", channelId, content: "react to this" });
    const msg: any = await ws.waitForMessage("message:new");
    messageId = msg.message.id;
    ws.close();
  });

  test("should add a reaction", async ({ request }) => {
    const res = await request.post(`${API_URL}/api/reactions`, {
      headers: {
        Authorization: `Bearer ${user1.token}`,
        "Content-Type": "application/json",
      },
      data: { messageId, emoji: "👍" },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("should get grouped reactions", async ({ request }) => {
    // Add a second reaction from user2
    await request.post(`${API_URL}/api/reactions`, {
      headers: {
        Authorization: `Bearer ${user2.token}`,
        "Content-Type": "application/json",
      },
      data: { messageId, emoji: "👍" },
    });

    const res = await request.get(`${API_URL}/api/reactions/${messageId}`, {
      headers: { Authorization: `Bearer ${user1.token}` },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const thumbsUp = body.data.find((r: any) => r.emoji === "👍");
    expect(thumbsUp).toBeTruthy();
    expect(thumbsUp._count.emoji).toBe(2);
  });

  test("should toggle (remove) a reaction", async ({ request }) => {
    // Toggle off user1's reaction
    const res = await request.post(`${API_URL}/api/reactions`, {
      headers: {
        Authorization: `Bearer ${user1.token}`,
        "Content-Type": "application/json",
      },
      data: { messageId, emoji: "👍" },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data.action).toBe("removed");
  });
});

test.describe("Phase 3 — URL Preview", () => {
  let user: Awaited<ReturnType<typeof createTestUser>>;

  test.beforeAll(async ({ request }) => {
    user = await createTestUser(request, { email: "preview@test.com", name: "Previewer" });
  });

  test("should fetch Open Graph preview", async ({ request }) => {
    const res = await request.get(
      `${API_URL}/api/preview?url=${encodeURIComponent("https://github.com")}`,
      { headers: { Authorization: `Bearer ${user.token}` } }
    );

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toBeTruthy();
    // GitHub should have OG tags
    expect(body.data.title || body.data.siteName).toBeTruthy();
  });

  test("should reject invalid URLs", async ({ request }) => {
    const res = await request.get(
      `${API_URL}/api/preview?url=${encodeURIComponent("not-a-url")}`,
      { headers: { Authorization: `Bearer ${user.token}` } }
    );

    expect(res.status()).toBe(400);
  });
});
