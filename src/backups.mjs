import { getStore, exportarTodo } from "./store.mjs";
import { json, pinOk } from "./comun.mjs";

// Lista y devuelve las copias automáticas de la carta (las últimas 10 guardadas)
export default async (req) => {
  if (!(await pinOk(req, ["dueno"]))) return json({ error: "PIN incorrecto" }, 401);
  const store = getStore({ name: "entrecausas", consistency: "strong" });
  const url = new URL(req.url), key = url.searchParams.get("key");
  // copia completa de todo (pedidos, reservas, clientes, caja, carta...) para descargar
  if (url.searchParams.has("todo")) return new Response(JSON.stringify({ app: "entre-causas", fecha: new Date().toISOString(), datos: await exportarTodo() }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  if (key) {
    if (!key.startsWith("backup/")) return json({ error: "Clave inválida" }, 400);
    const m = await store.get(key, { type: "json" });
    return m ? json(m) : json({ error: "No encontrada" }, 404);
  }
  const { blobs } = await store.list({ prefix: "backup/" });
  return json({ copias: blobs.map((b) => b.key).sort().reverse() });
};

