import { setEnv } from "./store.mjs";
import { BLOQ } from "./comun.mjs";

// Envuelve cada ruta: conecta la base y, si la red está bloqueada por intentos de PIN,
// responde 429 (espera) en vez de 401 (PIN incorrecto), para que el panel no cierre la sesión.
export const envolver = (handler) => async (req) => {
  const res = await handler(req);
  if (res.status === 401 && BLOQ.has(req)) {
    return new Response(JSON.stringify({ error: "bloqueado", mensaje: "Demasiados intentos de PIN desde esta red. Espera 15 minutos." }), { status: 429, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "retry-after": "900" } });
  }
  return res;
};
export const ruta = (handler) => { const h = envolver(handler); return (ctx) => { setEnv(ctx.env); return h(ctx.request); }; };
