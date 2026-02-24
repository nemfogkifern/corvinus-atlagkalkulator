/**
 * service-worker.js
 * Caches core application files for offline use.
 * Strategy: stale-while-revalidate — serve from cache immediately,
 * then fetch a fresh copy in the background to update the cache.
 */

const CACHE_NAME = "corvinus-gpa-v1";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./data.js",
  "./translations.js",
  "./calculationEngine.js",
  "./courses.json",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

// Install: pre-cache core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  // Activate immediately without waiting for old SW to finish
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// Fetch: stale-while-revalidate
self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cachedResponse) => {
        // Fetch from network in the background to update cache
        const networkFetch = fetch(event.request)
          .then((networkResponse) => {
            // Only cache successful same-origin responses
            if (
              networkResponse &&
              networkResponse.status === 200 &&
              networkResponse.type === "basic"
            ) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => {
            // Network failed — return nothing (cachedResponse will be used)
            return undefined;
          });

        // Return cached response immediately, or wait for network
        return cachedResponse || networkFetch;
      })
    )
  );
});
