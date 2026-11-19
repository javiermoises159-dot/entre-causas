import { getStore } from "./store.mjs";
import { json, pinOk, fechaRoma, esFecha, txt, modificar } from "./comun.mjs";

// Estado de las mesas y lista de espera del día (solo el panel)
const EST = ["libre", "ocupada", "cuenta"];
const id = () => Math.random().toString(36).slice(2, 8);

export default async (req) => {
  if (!(await pinOk(req))) return json({ error: "PIN incorrecto" }, 401);
  const store = getStore({ name: "entrecausas-sala", consistency: "strong" });
  const url = new URL(req.url);
  const vacio = { mesas: {}, espera: [] };

  if (req.method === "GET") {
    const f = esFecha(url.searchParams.get("f")) ? url.searchParams.get("f") : fechaRoma();
    const d = (await store.get("dia/" + f, { type: "json" })) || vacio;
    return json({ f, mesas: d.mesas || {}, espera: d.espera || [] });
  }

  let b; try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const f = esFecha(b.f) ? b.f : fechaRoma();
  const out = await modificar(store, "dia/" + f, vacio, (d) => {
    d.mesas = d.mesas || {}; d.espera = d.espera || [];
    if (req.method === "POST") {
      const nombre = txt(b.nombre, 50).trim();
      if (!nombre) return false;
      d.espera = d.espera.filter((x) => x.estado === "espera" || x.estado === "avisado").slice(-60);
      d.espera.push({ id: id(), nombre, tel: txt(String(b.tel || "").replace(/[^\d+]/g, ""), 20), personas: Math.min(40, Math.max(1, parseInt(b.personas, 10) || 2)), ts: new Date().toISOString(), estado: "espera" });
      return d;
    }
    if (req.method === "PATCH" && b.mesa) {
      const m = txt(String(b.mesa), 4);
      if (!EST.includes(b.estado)) return false;
      if (b.estado === "libre") delete d.mesas[m];
      else d.mesas[m] = { estado: b.estado, desde: d.mesas[m]?.desde || new Date().toISOString(), personas: parseInt(b.personas, 10) || d.mesas[m]?.personas || 0, nombre: txt(b.nombre, 50) || d.mesas[m]?.nombre || "" };
      return d;
    }
    if (req.method === "PATCH" && b.espera) {
      const e = d.espera.find((x) => x.id === b.espera);
      if (!e || !["espera", "avisado", "sentado", "fuera"].includes(b.estado)) return false;
      e.estado = b.estado; if (b.estado === "avisado") e.avisado = new Date().toISOString();
      return d;
    }
    return false;
  });
  return out ? json({ ok: true, mesas: out.mesas, espera: out.espera }) : json({ error: "Faltan datos" }, 400);
};
