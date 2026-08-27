/* Offline support: the shell is cached on install, hospital data is cached as
   it is visited so a state you already opened still works on a hospital's
   famously bad Wi-Fi. */
const SHELL = 'byt-shell-v1';
const DATA = 'byt-data-v1';
const SHELL_FILES = ['./', './index.html', './assets/styles.css', './assets/app.js', './manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // Data: network first (it is refreshed monthly), fall back to the last copy.
  if (url.pathname.includes('/data/')) {
    e.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone();
          caches.open(DATA).then(c => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Shell: cache first for instant loads.
  e.respondWith(
    caches.match(request).then(hit => hit || fetch(request).then(res => {
      const copy = res.clone();
      caches.open(SHELL).then(c => c.put(request, copy));
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
