// Sitio suspendido temporalmente (pendiente de pago).
// Para reactivar: poner SUSPENDIDO = false o borrar este archivo y hacer push.
const SUSPENDIDO = false;

const PAGINA = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Sitio no disponible</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#111;color:#eee;text-align:center;padding:24px}h1{font-size:1.4rem;margin:0 0 8px}p{opacity:.7;margin:0}</style>
</head><body><div><h1>Sitio temporalmente no disponible</h1><p>Vuelve a intentarlo más tarde.</p></div></body></html>`;

export async function onRequest(context) {
  if (!SUSPENDIDO) return menuMesas(context);
  return new Response(PAGINA, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "86400" },
  });
}

// QR / NFC de las mesas: "/mesa" (y "/?mesa=N") abre el menú en PDF que el dueño subió desde el panel.
// Si todavía no hay PDF, se muestra la carta de la app sin pedidos. "/" es la app de delivery.
async function menuMesas(context) {
  const { request, env } = context;
  const u = new URL(request.url);
  // Links viejos de clientes (entre-causas.pages.dev) → dominio propio. El panel, la cocina, el palmare
  // y las APK siguen funcionando en pages.dev (no se redirigen).
  if (request.method === "GET" && u.hostname === "entre-causas.pages.dev" && /^\/(pedir\/?|mesa\/?|index\.html)?$/.test(u.pathname)) {
    return new Response(null, { status: 301, headers: { location: "https://entrecausas.app" + (u.pathname === "/index.html" ? "/" : u.pathname) + u.search } });
  }
  const esMesa = /^\/mesa\/?$/.test(u.pathname) || (u.pathname === "/" && u.searchParams.has("mesa"));
  if (request.method === "GET" && esMesa && env.DB) {
    try {
      const r = await env.DB.prepare("SELECT v FROM blobs WHERE s = ? AND k = ?").bind("entrecausas", "menupdf").first();
      const d = r && JSON.parse(r.v);
      if (d && d.ok) return new Response(null, { status: 302, headers: { location: "/api/menupdf?v=" + encodeURIComponent(d.ts), "cache-control": "no-store" } });
    } catch {}
  }
  return context.next();
}
