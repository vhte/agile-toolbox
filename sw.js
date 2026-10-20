/* ==========================================================================
   Service worker. The only reason this file exists is so the toolbox opens
   in a meeting room with bad wifi. It caches the app shell and nothing else;
   there is no user data here, and no network request to any third party.

   Bump CACHE when you change any asset, or returning users keep the old copy.
   ========================================================================== */
var CACHE = "agile-toolbox-v2";

var SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/css/app.css",
  "./assets/js/store.js",
  "./assets/js/ui.js",
  "./assets/icons/icon.svg",
  "./tools/retro/index.html",
  "./tools/retro/retro.js",
  "./tools/standup/index.html",
  "./tools/standup/standup.js",
  "./tools/health-radar/index.html",
  "./tools/health-radar/radar.js",
  "./tools/capacity/index.html",
  "./tools/capacity/capacity.js",
  "./tools/flow/index.html",
  "./tools/flow/flow.js",
  "./tools/agreements/index.html",
  "./tools/agreements/agreements.js",
  "./tools/delegation/index.html",
  "./tools/delegation/delegation.js",
  "./tools/brief/index.html",
  "./tools/brief/brief.js",
  "./tools/decisions/index.html",
  "./tools/decisions/decisions.js"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE)
      // addAll is all-or-nothing; a single 404 would leave the app uncached.
      .then(function (cache) {
        return Promise.all(SHELL.map(function (url) {
          return cache.add(new Request(url, { cache: "reload" })).catch(function () {
            console.warn("[sw] could not cache", url);
          });
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
          return caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // Network first, so a deployed update lands without a hard refresh;
  // cache is the fallback that makes the room-with-no-wifi case work.
  event.respondWith(
    fetch(request)
      .then(function (response) {
        if (response && response.ok && response.type === "basic") {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      })
      .catch(function () {
        return caches.match(request).then(function (hit) {
          return hit || caches.match("./index.html");
        });
      })
  );
});
