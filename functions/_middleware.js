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
  if (!SUSPENDIDO) return context.next();
  return new Response(PAGINA, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "86400" },
  });
}
