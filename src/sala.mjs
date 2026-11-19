import { getStore } from "./store.mjs";
import { json, pinOk, fechaRoma, esFecha, txt, modificar } from "./comun.mjs";
import { avisar } from "./push.mjs";

// Estado de las mesas y lista de espera del día (solo el panel)
const EST = ["libre", "ocupada", "cuenta"];
const id = () => Math.random().toString(36).slice(2, 8);

export default async (req) => {
  const store = getStore({ name: "entrecausas-sala", consistency: "strong" });
  const url = new URL(req.url);
  const vacio = { mesas: {}, espera: [], llamadas: [] };
  // ---- Cliente en la mesa: llamar al camarero o pedir la cuenta (público) ----
  if (req.method === "POST" && url.searchParams.has("llamada")) {
    let b; try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
    const mesa = String(b.mesa || "").replace(/\D/g, "").slice(0, 3), tipo = b.tipo === "cuenta" ? "cuenta" : "camarero";
    if (!mesa) return json({ error: "Falta la mesa" }, 400);
    let nueva = false;
    await modificar(store, "dia/" + fechaRoma(), vacio, (d) => {
      d.llamadas = (d.llamadas || []).filter((x) => x.estado === "activa" || Date.now() - Date.parse(x.ts) < 3600000).slice(-80);
      if (d.llamadas.some((x) => x.mesa === mesa && x.tipo === tipo && x.estado === "activa")) return true;
      d.llamadas.push({ id: id(), mesa, tipo, ts: new Date().toISOString(), estado: "activa" });
      if (tipo === "cuenta") { d.mesas = d.mesas || {}; if (d.mesas[mesa]) d.mesas[mesa].estado = "cuenta"; }
      nueva = true;
      return true;
    });
    if (nueva) await avisar();
    return json({ ok: true });
  }
  if (!(await pinOk(req))) return json({ error: "PIN incorrecto" }, 401);

  if (req.method === "GET") {
    const f = esFecha(url.searchParams.get("f")) ? url.searchParams.get("f") : fechaRoma();
    const d = (await store.get("dia/" + f, { type: "json" })) || vacio;
    return json({ f, mesas: d.mesas || {}, espera: d.espera || [], llamadas: (d.llamadas || []).filter((x) => x.estado === "activa") });
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
    if (req.method === "PATCH" && b.llamada) {
      const l = (d.llamadas || []).find((x) => x.id === b.llamada);
      if (!l) return false;
      l.estado = "atendida"; l.por = txt(b.por, 30);
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
  return out ? json({ ok: true, mesas: out.mesas, espera: out.espera, llamadas: (out.llamadas || []).filter((x) => x.estado === "activa") }) : json({ error: "Faltan datos" }, 400);
};
