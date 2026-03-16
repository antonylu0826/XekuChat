import { test, expect } from "@playwright/test";
import { createTestUser } from "./helpers";

test.describe("Auth @api", () => {
  test("should create a test user and get JWT token", async ({ request }) => {
    const user = await createTestUser(request, {
      email: "auth-test@example.com",
      name: "Auth Test User",
    });

    expect(user.id).toBeTruthy();
    expect(user.email).toBe("auth-test@example.com");
    expect(user.token).toBeTruthy();
  });

  test("should get current user with valid token", async ({ request }) => {
    const user = await createTestUser(request, {
      email: "me-test@example.com",
      name: "Me Test",
    });

    const res = await request.get("/auth/me", {
      headers: { Authorization: `Bearer ${user.token}` },
    });

    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.data.email).toBe("me-test@example.com");
  });

  test("should reject invalid token", async ({ request }) => {
    const res = await request.get("/auth/me", {
      headers: { Authorization: "Bearer invalid-token" },
    });

    expect(res.status()).toBe(401);
  });

  test("should reject request without token", async ({ request }) => {
    const res = await request.get("/auth/me");
    expect(res.status()).toBe(401);
  });
});
