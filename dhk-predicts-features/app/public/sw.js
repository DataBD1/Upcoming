// Offline shell: app files are served from cache and refreshed in the background.
// API reads fall back to the copy app.js keeps in localStorage, so nothing to do here for /api.
var C = 'dp-a-v4', SHELL = ['/', '/app.css', '/core.js', '/app.js', '/icon.svg', '/manifest.webmanifest', '/share.js'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(C).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== C; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.indexOf('/api/') === 0) return;
  var key = SHELL.indexOf(u.pathname) >= 0 ? u.pathname : '/';
  e.respondWith(caches.open(C).then(function (c) {
    return c.match(key).then(function (hit) {
      var net = fetch(e.request).then(function (r) { if (r.ok) c.put(key, r.clone()); return r; });
      return hit ? (net.catch(function () {}), hit) : net;
    });
  }));
});
