import { getStore, ENV } from "./store.mjs";
import { json, pinOk, fechaRoma, modificar } from "./comun.mjs";

// Stock del día: cada plato con "stockDia" empieza cada día con ese número
const st = () => getStore({ name: "entrecausas-stock", consistency: "strong" });
async function menuDe(req) {
  const m = await getStore({ name: "entrecausas", consistency: "strong" }).get("menu", { type: "json" });
  if (m) return m;
  try { const u = new URL("/menu.json", req.url), r = ENV.ASSETS ? await ENV.ASSETS.fetch(u) : await fetch(u); if (r.ok) return await r.json(); } catch {}
  return null;
}
const conStock = (menu) => {
  const o = {};
  (menu?.categorias || []).forEach((c) => (c.items || []).forEach((i) => { const n = parseInt(i.stockDia, 10); if (n > 0) o[i.id] = n; }));
  return o;
};
export async function restante(menu, fecha = fechaRoma()) {
  const base = conStock(menu), ids = Object.keys(base);
  if (!ids.length) return {};
  const d = (await st().get("dia/" + fecha, { type: "json" })) || {};
  const v = d.v || {}, aj = d.aj || {}, out = {};
  ids.forEach((id) => (out[id] = Math.max(0, base[id] - (v[id] || 0) + (aj[id] || 0))));
  return out;
}
// signo +1 al vender, -1 al cancelar
export async function contar(menu, fecha, lineas, signo) {
  const base = conStock(menu), ls = (lineas || []).filter((l) => base[l.id]);
  if (!ls.length) return;
  await modificar(st(), "dia/" + fecha, { v: {}, aj: {} }, (d) => {
    d.v = d.v || {};
    ls.forEach((l) => (d.v[l.id] = Math.max(0, (d.v[l.id] || 0) + signo * l.q)));
    return true;
  });
}

// Descuenta el stock solo si alcanza para todo el pedido (todo o nada, sin que dos pedidos a la vez se lleven el último).
// Devuelve null si se pudo, o la lista de platos que no alcanzan.
export async function reservar(menu, fecha, lineas) {
  const base = conStock(menu), pide = {};
  (lineas || []).forEach((l) => { if (base[l.id]) pide[l.id] = (pide[l.id] || 0) + l.q; });
  const ids = Object.keys(pide);
  if (!ids.length) return null;
  let falta = null;
  await modificar(st(), "dia/" + fecha, { v: {}, aj: {} }, (d) => {
    d.v = d.v || {}; const aj = d.aj || {};
    falta = ids.filter((id) => pide[id] > base[id] - (d.v[id] || 0) + (aj[id] || 0))
      .map((id) => ({ id, quedan: Math.max(0, base[id] - (d.v[id] || 0) + (aj[id] || 0)) }));
    if (falta.length) return false;
    falta = null;
    ids.forEach((id) => (d.v[id] = (d.v[id] || 0) + pide[id]));
    return true;
  });
  return falta;
}

export default async (req) => {
  const menu = await menuDe(req);
  if (req.method === "GET") return json(await restante(menu));
  if (req.method === "PATCH") {
    if (!(await pinOk(req))) return json({ error: "PIN incorrecto" }, 401);
    let b; try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
    const base = conStock(menu);
    if (!base[b.id]) return json({ error: "Ese plato no tiene stock" }, 400);
    const f = fechaRoma();
    await modificar(st(), "dia/" + f, { v: {}, aj: {} }, (d) => {
      d.aj = d.aj || {};
      if (b.poner !== undefined) { const actual = base[b.id] - ((d.v || {})[b.id] || 0); d.aj[b.id] = (parseInt(b.poner, 10) || 0) - actual; }
      else d.aj[b.id] = (d.aj[b.id] || 0) + (parseInt(b.delta, 10) || 0);
      return true;
    });
    return json(await restante(menu));
  }
  return json({ error: "Método no permitido" }, 405);
};
