self.addEventListener('install', e => {
  e.waitUntil(caches.open('70hard-v1').then(c => c.addAll([
    '/', '/index.html', '/styles.css', '/app.js', '/bible.js', '/manifest.webmanifest'
  ])));
});
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
