import { getStore } from "./store.mjs";
import { json, pinOk } from "./comun.mjs";

// Lista y devuelve las copias automáticas de la carta (las últimas 10 guardadas)
export default async (req) => {
  if (!(await pinOk(req))) return json({ error: "PIN incorrecto" }, 401);
  const store = getStore({ name: "entrecausas", consistency: "strong" });
  const key = new URL(req.url).searchParams.get("key");
  if (key) {
    if (!key.startsWith("backup/")) return json({ error: "Clave inválida" }, 400);
    const m = await store.get(key, { type: "json" });
    return m ? json(m) : json({ error: "No encontrada" }, 404);
  }
  const { blobs } = await store.list({ prefix: "backup/" });
  return json({ copias: blobs.map((b) => b.key).sort().reverse() });
};

