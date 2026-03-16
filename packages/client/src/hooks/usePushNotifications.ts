import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer;
}

export type PushPermission = "default" | "granted" | "denied" | "unsupported";

export function usePushNotifications(token: string | null) {
  const [permission, setPermission] = useState<PushPermission>("default");
  const [subscribed, setSubscribed] = useState(false);

  // Check current permission state on mount
  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as PushPermission);
  }, []);

  const subscribe = async () => {
    if (!token || !("serviceWorker" in navigator) || !("PushManager" in window)) return;

    try {
      // Request notification permission
      const result = await Notification.requestPermission();
      setPermission(result as PushPermission);
      if (result !== "granted") return;

      // Register Service Worker
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // Fetch VAPID public key
      const keyRes = await fetch("/api/push/vapid-public-key", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { key } = await keyRes.json();
      if (!key) return; // VAPID not configured

      // Subscribe
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });

      const subJson = sub.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
        }),
      });

      setSubscribed(true);
    } catch (err) {
      console.error("Push subscription failed:", err);
    }
  };

  const unsubscribe = async () => {
    if (!token || !("serviceWorker" in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;

      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });

      await sub.unsubscribe();
      setSubscribed(false);
    } catch (err) {
      console.error("Push unsubscription failed:", err);
    }
  };

  // Auto-subscribe when token is available and permission already granted
  useEffect(() => {
    if (!token || permission !== "granted" || subscribed) return;
    subscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, permission]);

  // Listen for SW navigation messages (notification click)
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "navigate" && event.data.channelId) {
        window.dispatchEvent(
          new CustomEvent("xeku:navigate-channel", { detail: { channelId: event.data.channelId } })
        );
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  return { permission, subscribed, subscribe, unsubscribe };
}
