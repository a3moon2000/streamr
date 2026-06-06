/* Streamr service worker - app shell cache for installability + offline shell */
var CACHE = 'streamr-v24';
var SHELL = ['./', './index.html', './icon.svg', './manifest.json'];

self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(SHELL); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('message', function(e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);
  // Only handle same-origin GET (never cache TMDB, VidKing, YouTube, fonts)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Network-first for the app shell, fall back to cache when offline
  e.respondWith(
    fetch(e.request).then(function(res) {
      var copy = res.clone();
      caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
      return res;
    }).catch(function(){ return caches.match(e.request).then(function(r){ return r || caches.match('./index.html'); }); })
  );
});
