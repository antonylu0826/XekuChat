// XekuChat Service Worker — App Shell + Web Push

const CACHE_NAME = "xekuchat-shell-v1";
const SHELL_ASSETS = ["/", "/manifest.json", "/icon-192.png"];

// ── Lifecycle ────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Remove outdated caches
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => clients.claim())
  );
});

// ── Fetch — App Shell strategy ───────────────────────────────────────────────
// Navigation requests: network-first, fall back to cached "/" so the app
// opens instead of a blank page when offline.

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/"))
    );
  }
  // All other requests (API, WS, assets) pass through unmodified.
});

// ── Push Notifications ───────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "XekuChat", body: event.data.text() };
  }

  const title = data.title || "XekuChat";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    data: data.data || {},
    tag: data.data?.channelId || "xekuchat",
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const channelId = event.notification.data?.channelId;
  const url = channelId ? `/?channel=${channelId}` : "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.focus();
          client.postMessage({ type: "navigate", channelId });
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
