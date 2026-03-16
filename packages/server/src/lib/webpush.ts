import webpush from "web-push";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY!;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY!;
const vapidMailto = process.env.VAPID_MAILTO || "mailto:admin@example.com";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidMailto, vapidPublicKey, vapidPrivateKey);
}

export { webpush, vapidPublicKey };

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
}

export async function sendPushNotification(
  endpoint: string,
  keys: { p256dh: string; auth: string },
  payload: PushPayload
) {
  if (!vapidPublicKey || !vapidPrivateKey) return;
  try {
    await webpush.sendNotification(
      { endpoint, keys },
      JSON.stringify(payload),
      { TTL: 3600 }
    );
  } catch (err: unknown) {
    // 410 Gone = subscription expired, caller should delete it
    throw err;
  }
}
