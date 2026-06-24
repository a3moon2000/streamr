/* Streamr service worker - app shell cache for installability + offline shell */
var CACHE = 'streamr-v64';
var SHELL = ['./', './index.html', './icon.svg', './manifest.json',
             './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(SHELL); }));
  // Do NOT call skipWaiting here; wait for explicit page signal (two-stage update).
});

self.addEventListener('message', function(e) {
  if (e.data === 'skipWaiting' || (e.data && e.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});

self.addEventListener('activate', function(e) {
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

var NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);
  // Only handle same-origin GET (never cache TMDB, VidKing, YouTube, fonts)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  e.respondWith(
    new Promise(function(resolve) {
      var timer = setTimeout(function() { resolve(null); }, NETWORK_TIMEOUT_MS);
      fetch(e.request).then(function(res) {
        clearTimeout(timer);
        if (res.ok && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
        }
        resolve(res);
      }, function() {
        clearTimeout(timer);
        resolve(null);
      });
    }).then(function(res) {
      if (res) return res;
      return caches.match(e.request).then(function(r) {
        if (r) return r;
        if (e.request.mode === 'navigate') {
          // NOTE: the old `caches.match(a) || caches.match(b)` returned the FIRST
          // promise even when it resolved undefined; chain properly instead.
          return caches.match('./index.html').then(function(shell) {
            if (shell) return shell;
            return caches.match('./').then(function(root) {
              return root || new Response(
                '<h1 style="font-family:sans-serif;color:#ccc;background:#141414;padding:40px">Offline - reconnect and reload.</h1>',
                { status: 503, headers: { 'Content-Type': 'text/html' } });
            });
          });
        }
        return new Response('', { status: 504 });
      });
    })
  );
});
