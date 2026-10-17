// Octalve Edu Progressive Web App Service Worker
const CACHE_NAME = "octalve-edu-v1";

const PRECACHE_RESOURCES = [
  "/offline",
  "/brand.css",
  "/icon",
  "/apple-icon",
];

// Install: Cache offline shell and activate immediately
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_RESOURCES))
      .then(() => self.skipWaiting())
      .catch((err) => {
        // Silently continue if some precache items fail in development
        console.warn("[SW] Precache incomplete:", err);
      }),
  );
});

// Activate: Clean up stale caches and claim clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Fetch: Strategy depending on request type
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Never cache API routes or mutations (preserve tenant RLS & fresh data)
  if (url.pathname.startsWith("/api/") || request.method !== "GET") {
    return;
  }

  // 2. Navigation requests: Network-first, fallback to /offline page if disconnected
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedOffline = await cache.match("/offline");
        return (
          cachedOffline ||
          new Response("You are offline. Please reconnect to internet.", {
            headers: { "Content-Type": "text/plain" },
          })
        );
      }),
    );
    return;
  }

  // 3. Static assets (images, fonts, stylesheets): Cache-first with network fallback
  if (
    request.destination === "image" ||
    request.destination === "font" ||
    request.destination === "style"
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        });
      }),
    );
  }
});

// Background Sync Event: notify clients to flush offline payments queue
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-pending-payments") {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "SYNC_PENDING_PAYMENTS" });
        });
      }),
    );
  }
});
