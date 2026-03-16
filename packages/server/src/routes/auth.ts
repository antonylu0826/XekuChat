import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { prisma } from "../lib/prisma";
import { createTokens, verifyAccessToken, verifyRefreshToken } from "../auth/jwt";
import { getOIDCAuthUrl, exchangeCode, getUserInfo } from "../auth/oidc";
import { writeAuditLog } from "../audit/log";

export const authRoutes = new Hono();

// Redirect to OIDC provider login page
authRoutes.get("/login", async (c) => {
  const url = await getOIDCAuthUrl();
  return c.redirect(url);
});

// OIDC callback — exchange code for tokens, upsert user
authRoutes.get("/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) {
    return c.json({ error: "Missing authorization code" }, 400);
  }

  try {
    const tokenSet = await exchangeCode(code);
    const userInfo = await getUserInfo(tokenSet.access_token);

    // Upsert user
    const user = await prisma.user.upsert({
      where: { email: userInfo.email },
      update: {
        name: userInfo.name,
        avatar: userInfo.picture || null,
        sub: userInfo.sub,
        provider: userInfo.provider,
      },
      create: {
        email: userInfo.email,
        name: userInfo.name,
        avatar: userInfo.picture || null,
        sub: userInfo.sub,
        provider: userInfo.provider,
      },
    });

    // Issue JWT
    const { accessToken, refreshToken } = await createTokens(user.id);

    // Set refresh token as HttpOnly cookie
    setCookie(c, "refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      path: "/auth",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    // Redirect to app with access token
    const appUrl = process.env.APP_URL || "http://localhost:5173";
    return c.redirect(`${appUrl}?token=${accessToken}`);
  } catch (err) {
    console.error("Auth callback error:", err);
    return c.json({ error: "Authentication failed" }, 401);
  }
});

// Refresh access token
authRoutes.post("/refresh", async (c) => {
  const refreshToken = getCookie(c, "refresh_token");
  if (!refreshToken) {
    return c.json({ error: "No refresh token" }, 401);
  }

  try {
    const payload = await verifyRefreshToken(refreshToken);
    const { accessToken, refreshToken: newRefreshToken } = await createTokens(payload.sub);

    setCookie(c, "refresh_token", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      path: "/auth",
      maxAge: 7 * 24 * 60 * 60,
    });

    return c.json({ accessToken });
  } catch {
    return c.json({ error: "Invalid refresh token" }, 401);
  }
});

// Get current user
authRoutes.get("/me", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const payload = await verifyAccessToken(authHeader.slice(7));
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, avatar: true, isBot: true, status: true },
    });

    if (!user) return c.json({ error: "User not found" }, 404);
    return c.json({ success: true, data: user });
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
});

// Test-only login (creates user + returns JWT, disabled in production)
authRoutes.post("/test-login", async (c) => {
  if (process.env.NODE_ENV === "production") {
    return c.json({ error: "Not available in production" }, 403);
  }

  const { email, name } = await c.req.json<{ email: string; name: string }>();
  if (!email || !name) {
    return c.json({ error: "email and name are required" }, 400);
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: { name },
    create: { email, name, provider: "test" },
  });

  const { accessToken } = await createTokens(user.id);

  return c.json({
    success: true,
    data: { id: user.id, email: user.email, name: user.name, token: accessToken },
  });
});

// Logout
authRoutes.post("/logout", (c) => {
  deleteCookie(c, "refresh_token", { path: "/auth" });
  return c.json({ success: true });
});
