import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { uploadFile } from "../lib/minio";
import { authMiddleware } from "../auth/middleware";
import { MAX_FILE_SIZE, ALLOWED_FILE_TYPES } from "@xekuchat/core";

export const uploadRoutes = new Hono();

uploadRoutes.use("*", authMiddleware);

// Simple file upload (for images and small files)
// Large files (>10MB) should use tus endpoint
uploadRoutes.post("/", async (c) => {
  try {
    const userId = c.get("userId");
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    const messageId = formData.get("messageId") as string | null;

    if (!file) {
      return c.json({ error: "No file provided" }, 400);
    }

    if (file.size > MAX_FILE_SIZE) {
      return c.json({ error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` }, 413);
    }

    // On iOS WebKit, file.type can be empty for camera photos — fall back to extension
    const extMap: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
      gif: "image/gif", webp: "image/webp", heic: "image/heic", heif: "image/heif",
      mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
      pdf: "application/pdf",
    };
    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const mimeType = file.type || extMap[ext] || "";

    if (!ALLOWED_FILE_TYPES.includes(mimeType as any)) {
      return c.json({ error: `File type ${mimeType || "(unknown)"} is not allowed` }, 415);
    }

    const key = `uploads/${userId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadFile(key, buffer, mimeType);

    if (messageId) {
      const attachment = await prisma.attachment.create({
        data: { name: file.name, url, mimeType, size: file.size, messageId },
      });
      return c.json({ success: true, data: attachment }, 201);
    }

    return c.json({ success: true, data: { url, name: file.name, mimeType, size: file.size } });
  } catch (err) {
    console.error("Upload error:", err);
    return c.json({ error: "Upload failed" }, 500);
  }
});

// Clipboard paste upload (receives base64 image)
uploadRoutes.post("/paste", async (c) => {
  const userId = c.get("userId");
  const { data, mimeType, channelId } = await c.req.json<{
    data: string; // base64
    mimeType: string;
    channelId?: string;
  }>();

  if (!data || !mimeType) {
    return c.json({ error: "data and mimeType are required" }, 400);
  }

  if (!mimeType.startsWith("image/")) {
    return c.json({ error: "Only images can be pasted" }, 415);
  }

  const buffer = Buffer.from(data, "base64");

  if (buffer.length > MAX_FILE_SIZE) {
    return c.json({ error: "File too large" }, 413);
  }

  const ext = mimeType.split("/")[1] || "png";
  const key = `uploads/${userId}/${Date.now()}-paste.${ext}`;
  const url = await uploadFile(key, buffer, mimeType);

  return c.json({
    success: true,
    data: { url, name: `paste-${Date.now()}.${ext}`, mimeType, size: buffer.length },
  });
});
