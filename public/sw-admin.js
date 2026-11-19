// Avisos del panel de Entre Causas (pedidos y reservas nuevas)
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open('ec-panel-v1').then((k) => Promise.all(['/admin', '/admin.html', '/palmare', '/cocina', '/qr.js', '/logo-claro.png', '/icon-192.png', '/menu.json', '/admin.webmanifest'].map((u) => k.add(u).catch(() => {}))))); });
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let body = '🔔 Nuevo pedido o reserva. Toca para verlo.';
  try { if (e.data) body = e.data.text() || body; } catch {}
  e.waitUntil(self.registration.showNotification('Entre Causas', {
    body, icon: '/icon-192.png', badge: '/icon-192.png', tag: 'ec-nuevo', renotify: true,
    requireInteraction: true, vibrate: [300, 120, 300, 120, 300],
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((l) => {
    for (const c of l) if (c.url.includes('/admin')) { c.postMessage('recargar'); return c.focus(); }
    return self.clients.openWindow('/admin.html');
  }));
});

// Sin internet: el panel se abre igual con lo último guardado (primero red, si falla caché)
const CACHE = 'ec-panel-v1';
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  const api = u.pathname.startsWith('/api/');
  if (api && u.pathname !== '/api/menu') return;
  e.respondWith(fetch(r).then((res) => {
    if (res.ok) { const c = res.clone(); caches.open(CACHE).then((k) => k.put(r, c)); }
    return res;
  }).catch(() => caches.match(r, { ignoreSearch: !api }).then((m) => m || (r.mode === 'navigate' ? caches.match('/admin').then((x) => x || caches.match('/admin.html')) : Response.error()))));
});
