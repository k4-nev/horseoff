const VERSION = 'horseoff-v2.258';
const CACHE = VERSION;

self.addEventListener('install', e => { self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
      .then(() => self.clients.matchAll({type: 'window'}))
      .then(clients => clients.forEach(c => c.postMessage({type: 'sw-activated', version: VERSION})))
  );
});

self.addEventListener('fetch', e => {
  var url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return;
  e.respondWith(
    fetch(e.request, {cache: 'no-cache'}).then(r => {
      if (r.ok && e.request.method === 'GET') {
        var clone = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return r;
    }).catch(() => caches.match(e.request))
  );
});

self.addEventListener('push', e => {
  var data = {title: 'Horseoff', body: 'Новое сообщение', url: '/', sender_id: '', icon: '/pwa/icon-192.png'};
  try { data = Object.assign(data, e.data.json()); } catch(ex) {}
  var tag = data.sender_id ? 'horseoff-' + data.sender_id : 'horseoff-msg';
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: '/pwa/badge-96.png',
      data: {url: data.url},
      vibrate: [200, 100, 200],
      tag: tag,
      renotify: true
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
      for (var c of list) {
        if (c.url.includes(self.location.origin)) return c.focus();
      }
      return clients.openWindow(e.notification.data.url || '/');
    })
  );
});
