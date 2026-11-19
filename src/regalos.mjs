import { getStore } from "./store.mjs";
import { json, quien, txt, num, modificar, fechaRoma } from "./comun.mjs";

// Tarjetas regalo: el dueño las vende, el dueño o el camarero las cobran
const L = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const r = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => L[x % L.length]).join("");
const norm = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export default async (req) => {
  const q = await quien(req);
  if (!q || !["dueno", "camarero"].includes(q.rol)) return json({ error: "PIN incorrecto" }, 401);
  const url = new URL(req.url), store = getStore({ name: "entrecausas-regalos", consistency: "strong" });
  const vacio = { tarjetas: {} };
  if (req.method === "GET") {
    const d = (await store.get("lista", { type: "json" })) || vacio;
    const c = norm(url.searchParams.get("code"));
    if (c) { const t = d.tarjetas[c]; return t ? json({ tarjeta: t }) : json({ error: "No existe ese código" }, 404); }
    if (q.rol !== "dueno") return json({ error: "Solo el dueño" }, 403);
    return json({ tarjetas: Object.values(d.tarjetas).sort((a, b) => b.alta.localeCompare(a.alta)).slice(0, 40) });
  }
  let b; try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  if (req.method === "POST" && url.searchParams.has("usar")) {
    const c = norm(b.code), m = num(b.monto);
    let err = "";
    const out = await modificar(store, "lista", vacio, (d) => {
      const t = d.tarjetas[c];
      if (!t) { err = "No existe ese código"; return false; }
      if (t.vence && t.vence < fechaRoma()) { err = "Tarjeta vencida"; return false; }
      if (!(m > 0) || m > t.saldo + 0.001) { err = "El importe supera el saldo"; return false; }
      t.saldo = num(t.saldo - m);
      t.movs = [{ f: new Date().toISOString(), m: -m, nota: txt(b.nota, 40), por: q.nombre }, ...(t.movs || [])].slice(0, 30);
      return t;
    });
    return out ? json({ ok: true, tarjeta: out }) : json({ error: err || "No se pudo" }, 400);
  }
  if (req.method === "POST") {
    if (q.rol !== "dueno") return json({ error: "Solo el dueño" }, 403);
    const m = num(b.monto);
    if (!(m >= 5 && m <= 1000)) return json({ error: "Importe entre 5 y 1000 €" }, 400);
    const v = new Date(); v.setFullYear(v.getFullYear() + 1);
    const out = await modificar(store, "lista", vacio, (d) => {
      let c; do c = "EC" + r(4) + r(2); while (d.tarjetas[c]);
      const t = { code: c, ver: "EC-" + c.slice(2, 6) + "-" + c.slice(6), inicial: m, saldo: m, de: txt(b.de, 40), para: txt(b.para, 40), tel: txt(String(b.tel || "").replace(/[^\d+]/g, ""), 20), alta: new Date().toISOString(), vence: fechaRoma(v), movs: [{ f: new Date().toISOString(), m, nota: "Vendida", por: q.nombre }] };
      d.tarjetas[c] = t;
      return t;
    });
    return json({ ok: true, tarjeta: out });
  }
  return json({ error: "Método no permitido" }, 405);
};
