import { getStore } from "./store.mjs";
import { json, fechaRoma, esFecha, modificar } from "./comun.mjs";

// Link del repartidor: entra con su token, sin PIN ni app
export default async (req) => {
  const url = new URL(req.url), k = url.searchParams.get("k") || "";
  const l = (await getStore({ name: "entrecausas-equipo", consistency: "strong" }).get("lista", { type: "json" }))?.personas || [];
  const yo = k.length >= 12 && l.find((p) => p.rol === "repartidor" && p.token === k);
  if (!yo) return json({ error: "Link no válido" }, 401);
  const store = getStore({ name: "entrecausas-pedidos", consistency: "strong" });
  const f = fechaRoma();
  if (req.method === "GET") {
    const d = await store.get("dia/" + f, { type: "json" });
    const ps = (d?.pedidos || []).filter((p) => p.rep === yo.id && p.estado !== "cancelado")
      .map(({ id, fecha, hora, cliente, dir, comune, tel, lineas, total, pago, nota, estado, etaHora, prog, notaCli }) => ({ id, fecha, hora, cliente, dir, comune, tel, lineas: lineas.map((x) => ({ q: x.q, n: x.n })), total, pago, nota, estado, etaHora, prog, notaCli }));
    return json({ nombre: yo.nombre, pedidos: ps });
  }
  if (req.method === "PATCH") {
    let b; try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
    if (!esFecha(b.fecha) || !["encamino", "entregado"].includes(b.estado)) return json({ error: "Faltan datos" }, 400);
    const out = await modificar(store, "dia/" + b.fecha, { pedidos: [] }, (d) => {
      const p = d.pedidos.find((x) => x.id === b.id && x.rep === yo.id);
      if (!p || p.estado === "cancelado") return false;
      p.estado = b.estado; if (b.estado === "entregado") p.entregado = new Date().toISOString();
      return p;
    });
    return out ? json({ ok: true }) : json({ error: "No encontrado" }, 404);
  }
  return json({ error: "Método no permitido" }, 405);
};
