// Offline-Modus: Erst das Netz fragen (damit Updates sofort da sind), ohne Netz kommt die gespeicherte Version.
// Neue Dateien unten in FILES eintragen, damit sie auch ohne Internet da sind.
const CACHE = "saufomat-v42";
const FILES = [
  "./",
  "index.html",
  "info.html",
  "flunky.html",
  "style.css",
  "design.css",
  "figur.css",
  "figur.js",
  "figur-3d.js",
  "icons.js",
  "i18n.js",
  "vendor/fonts/bricolage-grotesque.woff2",
  "vendor/fonts/fraunces.woff2",
  "vendor/fonts/pacifico.woff2",
  "flunky.css",
  "boot.js",
  "games.js",
  "cards.js",
  "busfahrer.js",
  "triade.js",
  "dealer.js",
  "fenster.js",
  "randvoll.js",
  "duell.js",
  "eher.js",
  "luegen.js",
  "schiffe.js",
  "kistenturm.js",
  "kistenturm-3d.js",
  "deckel.js",
  "flasche.js",
  "flasche-3d.js",
  "flasche.css",
  "hodenritter.js",
  "hodenritter-3d.js",
  "flunky.js",
  "flunky-game.js",
  "net.js",
  "room.js",
  "app.js",
  "stats.js",
  "freunde.js",
  "profil.js",
  "profil.css",
  "vendor/mqtt.min.js",
  "vendor/qrcode.js",
  "vendor/three.min.js",
  "vendor/three-gltf.js",
  "figuren/personen.js",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Schlechtes Netz auf der Party: Antwortet das Netz nicht in 3 Sekunden, kommt die gespeicherte Version.
const SLOW_MS = 3000;

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  // ?spiel=…&raum=… usw.: gespeichert ist die Seite ohne Zusätze
  const cached = caches.match(req, { ignoreSearch: true });
  const net = fetch(req).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  });
  e.respondWith(
    new Promise((resolve) => {
      let done = false;
      const finish = (res) => {
        if (done || !res) return false;
        done = true;
        resolve(res);
        return true;
      };
      const timer = setTimeout(() => cached.then(finish), SLOW_MS);
      net.then((res) => {
        clearTimeout(timer);
        finish(res);
      }).catch(async () => {
        clearTimeout(timer);
        finish((await cached) ?? (await caches.match("index.html")) ?? Response.error());
      });
    })
  );
});
