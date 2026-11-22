// Nätet först, förbi webbläsarens HTTP-cache (GitHub Pages cachar annars i 10 min),
// så att nya versioner syns direkt. Sparad kopia används bara offline.
const CACHE = "ohuhupaletten-v11";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./css/style.css", "./js/app.js", "./js/blend.js", "./js/palette.js",
  "./js/color.js", "./js/registry.js", "./js/i18n.js", "./data/pens.json", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: "reload" })))));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith(fetch(req.url, { cache: "no-cache", credentials: "same-origin" })
    .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./index.html"))));
});
