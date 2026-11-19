import { getStore } from "./store.mjs";
import { json, pinOk } from "./comun.mjs";

export default async (req) => {
  const store = getStore({ name: "entrecausas", consistency: "strong" });

  if (req.method === "GET") {
    const menu = await store.get("menu", { type: "json" });
    return menu ? json(menu) : json({ error: "sin-datos" }, 404);
  }

  if (req.method === "POST") {
    if (!(await pinOk(req))) return json({ error: "PIN incorrecto" }, 401);
    const url = new URL(req.url);
    if (url.searchParams.get("check")) return json({ ok: true });
    let body;
    try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
    if (!body || !Array.isArray(body.categorias) || !body.ajustes) return json({ error: "Formato inválido" }, 400);
    body.actualizado = new Date().toISOString();
    // copia de seguridad automática del estado anterior (se guardan las últimas 10)
    const prev = await store.get("menu", { type: "json" });
    if (prev) {
      await store.setJSON("backup/" + body.actualizado, prev);
      const { blobs } = await store.list({ prefix: "backup/" });
      const viejos = blobs.map((b) => b.key).sort().slice(0, -10);
      await Promise.all(viejos.map((k) => store.delete(k)));
    }
    await store.setJSON("menu", body);
    return json({ ok: true, actualizado: body.actualizado });
  }

  return json({ error: "Método no permitido" }, 405);
};

