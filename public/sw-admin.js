// Avisos del panel de Entre Causas (pedidos y reservas nuevas)
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open('ec-panel-v2').then((k) => Promise.all(['/admin', '/admin.html', '/palmare', '/cocina', '/qr.js', '/logo-claro.png', '/icon-192.png', '/menu.json', '/admin.webmanifest'].map((u) => k.add(u).catch(() => {}))))); });
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
// El aviso llega vacío: el texto depende de la app instalada (panel, cocina o palmare)
const SC = () => new URL(self.registration.scope).pathname.replace(/\/$/, '');
const TXT = { '/cocina': ['🔥 Nueva comanda', 'Hay un pedido nuevo en cocina. Toca para verlo.'], '/palmare': ['🙋 Te llaman', 'Una mesa te llama o pide la cuenta.'] };
const TIPO = { prueba: ['🔔 Aviso de prueba', '¡Funciona! Así sonará cada pedido nuevo.'], reserva: ['📅 Nueva reserva', 'Toca para confirmarla.'], llamada: ['🙋 Te llaman', 'Una mesa te llama o pide la cuenta.'], sala: ['🔥 Nueva comanda', 'Comanda de sala en cocina.'] };
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let [title, body] = TXT[SC()] || ['Entre Causas', '🔔 Nuevo pedido o reserva. Toca para verlo.'];
    try {
      const u = await Promise.race([fetch('/api/push?ultimo', { cache: 'no-store' }).then((r) => r.json()), new Promise((r) => setTimeout(() => r({}), 2500))]);
      if (u.tipo && TIPO[u.tipo] && Date.now() - u.ts < 120000 && (u.tipo === 'prueba' || SC() !== '/cocina' || u.tipo === 'sala')) [title, body] = TIPO[u.tipo];
      else if (u.tipo === 'pedido' && SC() !== '/cocina') [title, body] = ['🛵 Nuevo pedido', 'Toca para aceptarlo.'];
    } catch {}
    await self.registration.showNotification(title, {
      body, icon: '/icon-192.png', badge: '/icon-192.png', tag: 'ec-nuevo', renotify: true,
      requireInteraction: true, vibrate: [400, 150, 400, 150, 400, 150, 400],
    });
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const sc = SC() || '/admin';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((l) => {
    for (const c of l) if (new URL(c.url).pathname.startsWith(sc)) { c.postMessage('recargar'); return c.focus(); }
    return self.clients.openWindow(sc);
  }));
});

// Sin internet: el panel se abre igual con lo último guardado (primero red, si falla caché)
const CACHE = 'ec-panel-v2';
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
