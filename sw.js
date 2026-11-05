const CACHE_NAME = "bingkai-bisu-scanner-v1";

const ASSETS_TO_CACHE = [
  "./scanner.html",
  "./manifest.json",
  "https://unpkg.com/html5-qrcode",
  "asset/LOGO_BINGKAI_BISU.png",
  "https://cdn.tailwindcss.com",
  "https://unpkg.com/lucide@latest"
];

// Install Event: Simpan aset penting ke cache
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Caching offline assets...");
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn("[Service Worker] Warning saat pre-cache beberapa aset:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Bersihkan cache versi lama
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("[Service Worker] Menghapus cache lama:", cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Cache-First Strategy
self.addEventListener("fetch", (event) => {
  // Hanya proses GET request untuk caching
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      // Jika belum ada di cache, ambil dari jaringan lalu simpan salinannya
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== "basic" && !event.request.url.startsWith("http")) {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Fallback jika offline dan membuka scanner.html
        if (event.request.mode === "navigate") {
          return caches.match("./scanner.html");
        }
      });
    })
  );
});
