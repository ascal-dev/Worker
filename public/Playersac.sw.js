const CACHE_NAME = "playersac-v1";
const PRECACHE = [
  "./Playersac.html",
  "./Playersac.manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isHTML = request.headers.get("accept")?.includes("text/html");

  if (isHTML) {
    event.respondWith(
      caches.match("./Playersac.html").then(cached => cached || fetch(request))
    );
    return;
  }

  if (!isSameOrigin) return;

  event.respondWith(
    caches.match(request).then(cached =>
      cached || fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return response;
      })
    )
  );
});
