/*
  PersianMine Service Worker
  - Updates cached pages when a new deployment is available.
  - Tries common filename casing variants for the site's images and music.
*/

const CACHE_NAME = "persian-mine-v10";
const ROOT_FILES = ["./", "./index.html", "./ranks.html"];

const ASSET_CANDIDATES = {
  "clan.jpg": ["CLAN.jpg", "Clan.jpg", "clan.jpg", "CLAN.JPG", "clan.JPG"],
  "leader.jpg": ["Leader.jpg", "LEADER.jpg", "leader.jpg", "LEADER.JPG", "leader.JPG"],
  "server.jpg": ["Server.jpg", "SERVER.jpg", "server.jpg", "SERVER.JPG", "server.JPG"],
  "arzda.jpg": ["Arzda.jpg", "ARZDA.jpg", "arzda.jpg", "ARZDA.JPG", "arzda.JPG"],
  "music.mp3": ["music.mp3", "Music.mp3", "MUSIC.mp3", "MUSIC.MP3"]
};

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(ROOT_FILES).catch(() => {})
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("persian-mine-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function fetchCaseInsensitiveAsset(request, url) {
  const requestedName = decodeURIComponent(url.pathname.split("/").pop() || "").toLowerCase();
  const candidates = ASSET_CANDIDATES[requestedName];

  if (!candidates) return fetch(request);

  const folder = url.pathname.slice(0, url.pathname.lastIndexOf("/") + 1);
  const cache = await caches.open(CACHE_NAME);

  for (const filename of candidates) {
    const candidateUrl = new URL(folder + filename, url.origin);
    try {
      const response = await fetch(candidateUrl.href, { cache: "no-store" });
      if (response.ok) {
        await cache.put(request, response.clone());
        return response;
      }
    } catch (_) {
      // Try the next capitalization.
    }
  }

  return (await cache.match(request)) || new Response("Asset not found", {
    status: 404,
    statusText: "Not Found"
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin || request.method !== "GET") return;

  const filename = decodeURIComponent(url.pathname.split("/").pop() || "").toLowerCase();

  // HTML: network first, so visitors receive the latest published page.
  if (request.mode === "navigate" ||
      filename.endsWith(".html") ||
      url.pathname.endsWith("/")) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          }
          return response;
        })
        .catch(async () =>
          (await caches.match(request)) ||
          (await caches.match("./index.html")) ||
          Response.error()
        )
    );
    return;
  }

  // Image/audio filenames: try known capitalization variants.
  if (ASSET_CANDIDATES[filename]) {
    event.respondWith(fetchCaseInsensitiveAsset(request, url));
    return;
  }

  // Other static files: network first, cached fallback when offline.
  event.respondWith(
    fetch(request, { cache: "no-store" })
      .then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      })
      .catch(async () => (await caches.match(request)) || Response.error())
  );
});
