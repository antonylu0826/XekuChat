import { Hono } from "hono";
import { authMiddleware } from "../auth/middleware";
import { fetchOGPreview } from "../services/opengraph";

export const previewRoutes = new Hono();

previewRoutes.use("*", authMiddleware);

// Fetch Open Graph preview for a URL
previewRoutes.get("/", async (c) => {
  const url = c.req.query("url");

  if (!url) {
    return c.json({ error: "url is required" }, 400);
  }

  // Basic URL validation
  try {
    new URL(url);
  } catch {
    return c.json({ error: "Invalid URL" }, 400);
  }

  const preview = await fetchOGPreview(url);

  if (!preview) {
    return c.json({ success: true, data: null });
  }

  return c.json({ success: true, data: preview });
});
