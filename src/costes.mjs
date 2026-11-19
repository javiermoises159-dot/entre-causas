import { getStore } from "./store.mjs";
import { json, pinOk, modificar } from "./comun.mjs";

// Coste de cada plato (solo el dueño; no va en la carta pública)
export default async (req) => {
  if (!(await pinOk(req, ["dueno"]))) return json({ error: "PIN incorrecto" }, 401);
  const store = getStore({ name: "entrecausas-costes", consistency: "strong" });
  if (req.method === "GET") return json({ costes: (await store.get("lista", { type: "json" }))?.costes || {} });
  if (req.method === "POST") {
    let b; try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
    const id = String(b.id || "").slice(0, 40);
    if (!id) return json({ error: "Falta el plato" }, 400);
    const v = Math.round((Number(b.coste) || 0) * 100) / 100;
    const out = await modificar(store, "lista", { costes: {} }, (d) => { if (v > 0) d.costes[id] = v; else delete d.costes[id]; return d; });
    return json({ ok: true, costes: out.costes });
  }
  return json({ error: "Método no permitido" }, 405);
};
