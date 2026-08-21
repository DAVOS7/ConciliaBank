/* ConciliaBanco — service worker
   Objetivo: que la app sea instalable como PWA y funcione sin conexión.
   Estrategia:
     - App shell (index + iconos + librería XLSX) cacheada.
     - Navegación: red primero, con vuelta al index cacheado si no hay conexión.
     - Google Drive / Identity: SIEMPRE red, nunca se cachea (requieren token y datos frescos).
   Sube la versión de CACHE para forzar actualización en los equipos. */
var CACHE = "conciliabanco-v4";

// Rutas relativas: funciona igual en la raíz o bajo /ConciliaBank/
var APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];
// La librería de Excel se cachea aparte (es CDN y podría no estar disponible al instalar)
var XLSX_CDN = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // addAll falla si algo no carga; precacheamos el shell propio y, aparte, intentamos el CDN sin bloquear
      return c.addAll(APP_SHELL).then(function () {
        return fetch(XLSX_CDN, { mode: "cors" }).then(function (r) {
          if (r && r.ok) return c.put(XLSX_CDN, r.clone());
        }).catch(function () {});
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isGoogle(url) {
  return url.indexOf("googleapis.com") !== -1 ||
         url.indexOf("accounts.google.com") !== -1 ||
         url.indexOf("google.com/gsi") !== -1;
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;                 // POST/PATCH (subidas a Drive) → directo a la red
  var url = req.url;

  if (isGoogle(url)) return;                         // Drive/Identity: siempre red, sin cachear

  // Navegación (abrir la app): red primero; si no hay conexión, index cacheado
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(function () {
        return caches.match("./index.html").then(function (r) { return r || caches.match("./"); });
      })
    );
    return;
  }

  // XLSX y demás recursos: cache primero, y si no está, red (y se guarda)
  e.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (resp) {
        if (resp && resp.ok && (url.indexOf(self.location.origin) === 0 || url === XLSX_CDN)) {
          var copy = resp.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return resp;
      }).catch(function () { return cached; });
    })
  );
});
