import { test, expect } from "@playwright/test";
import { createTestUser, createTestOrg, createTestChannel, addOrgMember } from "./helpers";

test.describe("Organization & Channel CRUD @api", () => {
  test("should create an organization", async ({ request }) => {
    const admin = await createTestUser(request, {
      email: "org-admin@example.com",
      name: "Org Admin",
    });

    const res = await createTestOrg(request, admin.token, {
      name: "Test Corp",
      slug: "test-corp",
    });

    expect(res.success).toBe(true);
    expect(res.data.name).toBe("Test Corp");
    expect(res.data.slug).toBe("test-corp");
  });

  test("should list user organizations", async ({ request }) => {
    const user = await createTestUser(request, {
      email: "org-list@example.com",
      name: "Org List User",
    });

    await createTestOrg(request, user.token, {
      name: "List Org",
      slug: "list-org",
    });

    const res = await request.get("/api/orgs", {
      headers: { Authorization: `Bearer ${user.token}` },
    });

    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data.some((o: any) => o.slug === "list-org")).toBe(true);
  });

  test("should invite member to organization", async ({ request }) => {
    const admin = await createTestUser(request, {
      email: "invite-admin@example.com",
      name: "Invite Admin",
    });
    const member = await createTestUser(request, {
      email: "invite-member@example.com",
      name: "Invite Member",
    });

    const org = await createTestOrg(request, admin.token, {
      name: "Invite Org",
      slug: "invite-org",
    });

    const res = await addOrgMember(request, admin.token, org.data.id, member.email);
    expect(res.success).toBe(true);
  });

  test("should create a channel", async ({ request }) => {
    const admin = await createTestUser(request, {
      email: "ch-admin@example.com",
      name: "Channel Admin",
    });

    const org = await createTestOrg(request, admin.token, {
      name: "Channel Org",
      slug: "channel-org",
    });

    const res = await createTestChannel(request, admin.token, {
      orgId: org.data.id,
      name: "general",
    });

    expect(res.success).toBe(true);
    expect(res.data.name).toBe("general");
    expect(res.data.type).toBe("group");
  });

  test("should create DM channel", async ({ request }) => {
    const userA = await createTestUser(request, {
      email: "dm-a@example.com",
      name: "DM User A",
    });
    const userB = await createTestUser(request, {
      email: "dm-b@example.com",
      name: "DM User B",
    });

    const org = await createTestOrg(request, userA.token, {
      name: "DM Org",
      slug: "dm-org",
    });
    await addOrgMember(request, userA.token, org.data.id, userB.email);

    const res = await request.post("/api/channels/dm", {
      headers: { Authorization: `Bearer ${userA.token}` },
      data: { orgId: org.data.id, targetUserId: userB.id },
    });

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.type).toBe("dm");
  });

  test("should reject slug collision", async ({ request }) => {
    const user = await createTestUser(request, {
      email: "slug-test@example.com",
      name: "Slug Test",
    });

    await createTestOrg(request, user.token, {
      name: "Slug Org",
      slug: "slug-collision",
    });

    const res = await request.post("/api/orgs", {
      headers: { Authorization: `Bearer ${user.token}` },
      data: { name: "Another Org", slug: "slug-collision" },
    });

    expect(res.status()).toBe(409);
  });

  test("non-admin should not be able to invite members", async ({ request }) => {
    const admin = await createTestUser(request, {
      email: "perm-admin@example.com",
      name: "Perm Admin",
    });
    const member = await createTestUser(request, {
      email: "perm-member@example.com",
      name: "Perm Member",
    });
    const outsider = await createTestUser(request, {
      email: "perm-outsider@example.com",
      name: "Perm Outsider",
    });

    const org = await createTestOrg(request, admin.token, {
      name: "Perm Org",
      slug: "perm-org",
    });
    await addOrgMember(request, admin.token, org.data.id, member.email);

    // Member (not admin) tries to invite
    const res = await request.post(`/api/orgs/${org.data.id}/members`, {
      headers: { Authorization: `Bearer ${member.token}` },
      data: { email: outsider.email },
    });

    expect(res.status()).toBe(403);
  });
});
