import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../auth/middleware";
import { MAX_FILE_SIZE } from "@xekuchat/core";

// ============================================================
// tus Resumable Upload Protocol (simplified implementation)
// For production, consider tus-node-server with S3 store
// ============================================================

interface TusUpload {
  id: string;
  userId: string;
  fileName: string;
  mimeType: string;
  totalSize: number;
  offset: number;
  chunks: Buffer[];
  createdAt: number;
}

const uploads = new Map<string, TusUpload>();

// Cleanup stale uploads every 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, upload] of uploads) {
    if (upload.createdAt < cutoff) {
      uploads.delete(id);
    }
  }
}, 30 * 60 * 1000);

export const tusRoutes = new Hono();

tusRoutes.use("*", authMiddleware);

// Create upload (POST)
tusRoutes.post("/", async (c) => {
  const userId = c.get("userId");
  const uploadLength = parseInt(c.req.header("Upload-Length") || "0");
  const metadata = parseTusMetadata(c.req.header("Upload-Metadata") || "");

  if (uploadLength > MAX_FILE_SIZE) {
    return c.json({ error: "File too large" }, 413);
  }

  const id = crypto.randomUUID();
  uploads.set(id, {
    id,
    userId,
    fileName: metadata.filename || "unknown",
    mimeType: metadata.filetype || "application/octet-stream",
    totalSize: uploadLength,
    offset: 0,
    chunks: [],
    createdAt: Date.now(),
  });

  c.header("Location", `/api/tus/${id}`);
  c.header("Tus-Resumable", "1.0.0");
  return c.body(null, 201);
});

// Get upload offset (HEAD)
tusRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const upload = uploads.get(id);

  if (!upload) {
    return c.json({ error: "Upload not found" }, 404);
  }

  c.header("Upload-Offset", String(upload.offset));
  c.header("Upload-Length", String(upload.totalSize));
  c.header("Tus-Resumable", "1.0.0");
  return c.body(null, 200);
});

// Upload chunk (PATCH)
tusRoutes.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const upload = uploads.get(id);

  if (!upload || upload.userId !== userId) {
    return c.json({ error: "Upload not found" }, 404);
  }

  const offset = parseInt(c.req.header("Upload-Offset") || "0");
  if (offset !== upload.offset) {
    return c.json({ error: "Offset mismatch" }, 409);
  }

  const chunk = Buffer.from(await c.req.arrayBuffer());
  upload.chunks.push(chunk);
  upload.offset += chunk.length;

  c.header("Upload-Offset", String(upload.offset));
  c.header("Tus-Resumable", "1.0.0");

  // Upload complete — assemble and store
  if (upload.offset >= upload.totalSize) {
    const { uploadFile } = await import("../lib/minio");

    const fullBuffer = Buffer.concat(upload.chunks);
    const ext = upload.fileName.split(".").pop() || "bin";
    const key = `uploads/${userId}/${Date.now()}-${id.slice(0, 8)}.${ext}`;
    const url = await uploadFile(key, fullBuffer, upload.mimeType);

    uploads.delete(id);

    return c.json({
      success: true,
      data: {
        url,
        name: upload.fileName,
        mimeType: upload.mimeType,
        size: upload.totalSize,
      },
    });
  }

  return c.body(null, 204);
});

function parseTusMetadata(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;

  for (const pair of header.split(",")) {
    const [key, b64Value] = pair.trim().split(" ");
    if (key && b64Value) {
      result[key] = atob(b64Value);
    }
  }
  return result;
}
