import { createHmac } from "crypto";
import { prisma } from "../lib/prisma";

/**
 * Enqueue a webhook event for all integrations that are:
 * 1. Active
 * 2. Have a webhookUrl configured
 * 3. Have "webhook" permission for the channel (or no scoped channels)
 */
export async function enqueueWebhookEvent(
  orgId: string,
  channelId: string,
  event: string,
  payload: Record<string, unknown>,
) {
  const integrations = await prisma.integration.findMany({
    where: {
      orgId,
      isActive: true,
      webhookUrl: { not: null },
    },
    select: { id: true, channels: { select: { channelId: true, permissions: true } } },
  });

  for (const integration of integrations) {
    // Check channel scope
    if (integration.channels.length > 0) {
      const channelEntry = integration.channels.find((ch) => ch.channelId === channelId);
      if (!channelEntry?.permissions.includes("webhook")) continue;
    }

    await prisma.webhookDelivery.create({
      data: {
        integrationId: integration.id,
        event,
        payload: payload as object,
        status: "pending",
      },
    });
  }

  // Trigger processing (non-blocking)
  processWebhookQueue().catch((err) =>
    console.error("Webhook queue processing error:", err),
  );
}

/**
 * Process pending webhook deliveries.
 * Called after enqueue and also periodically.
 */
export async function processWebhookQueue() {
  const deliveries = await prisma.webhookDelivery.findMany({
    where: {
      status: "pending",
      attempts: { lt: 3 },
    },
    include: {
      integration: {
        select: { webhookUrl: true, webhookSecret: true },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  for (const delivery of deliveries) {
    if (!delivery.integration.webhookUrl) continue;

    try {
      const body = JSON.stringify({
        event: delivery.event,
        ...delivery.payload as object,
        timestamp: new Date().toISOString(),
      });

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-XekuChat-Event": delivery.event,
      };

      // HMAC signature
      if (delivery.integration.webhookSecret) {
        const signature = createHmac("sha256", delivery.integration.webhookSecret)
          .update(body)
          .digest("hex");
        headers["X-XekuChat-Signature"] = `sha256=${signature}`;
      }

      const res = await fetch(delivery.integration.webhookUrl, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(10_000), // 10s timeout
      });

      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: res.ok ? "success" : "failed",
          attempts: delivery.attempts + 1,
          lastAttemptAt: new Date(),
          responseCode: res.status,
        },
      });
    } catch {
      const nextAttempt = delivery.attempts + 1;
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: nextAttempt >= 3 ? "failed" : "pending",
          attempts: nextAttempt,
          lastAttemptAt: new Date(),
        },
      });
    }
  }
}

/** Retry interval ID for periodic queue processing */
let retryIntervalId: ReturnType<typeof setInterval> | null = null;

/** Start periodic retry processing (every 30s) */
export function startWebhookRetryWorker() {
  retryIntervalId = setInterval(() => {
    processWebhookQueue().catch((err) =>
      console.error("Webhook retry error:", err),
    );
  }, 30_000);
  console.log("Webhook retry worker started (30s interval)");
}

/** Stop periodic retry processing */
export function stopWebhookRetryWorker() {
  if (retryIntervalId) {
    clearInterval(retryIntervalId);
    retryIntervalId = null;
  }
}
