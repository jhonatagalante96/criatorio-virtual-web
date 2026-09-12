const CACHE_NAME = "criatorio-virtual-static-v3";
const STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/icons/icon-192-v2.png",
  "/icons/icon-512-v2.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (!["font", "image", "script", "style"].includes(event.request.destination)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response.ok) return response;
        return caches.open(CACHE_NAME).then((cache) =>
          cache.put(event.request, response.clone()).then(() => response)
        );
      })
      .catch(() => caches.match(event.request))
  );
});
