// Avisos del panel de Entre Causas (pedidos y reservas nuevas)
self.addEventListener('install', () => self.skipWaiting());
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
