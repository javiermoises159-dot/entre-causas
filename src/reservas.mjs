import { getStore, ENV } from "./store.mjs";
import { json, pinOk, fechaRoma, esFecha, rangoDias, txt, modificar, limite, demasiados } from "./comun.mjs";
import { avisar } from "./push.mjs";

// Reservas de mesa: las hace el cliente en la app y el local las confirma desde el panel
const ESTADOS = ["pendiente", "confirmada", "rechazada", "llego", "noshow"];
const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const codigo = () => "R" + Array.from({ length: 3 }, () => LETRAS[Math.floor(Math.random() * LETRAS.length)]).join("");
function claveTel(t) {
  let d = String(t || "").replace(/\D/g, "");
  if (d.startsWith("0039")) d = d.slice(4);
  else if (d.length >= 11 && d.startsWith("39")) d = d.slice(2);
  return d.length >= 8 ? d : "";
}
// Libera la promo solo si la marca es la de esta reserva (no la de otra posterior)
const liberarPromo = (store, tk, marca) => modificar(store, "usadas", { tels: {} }, (d) => { if (d.tels[tk] !== marca) return false; delete d.tels[tk]; return true; });
const dow = (f) => (new Date(f + "T12:00:00Z").getUTCDay() + 6) % 7;
async function ajustes(req) {
  const m = await getStore({ name: "entrecausas", consistency: "strong" }).get("menu", { type: "json" });
  if (m) return m.ajustes || {};
  try { const u = new URL("/menu.json", req.url), r = ENV.ASSETS ? await ENV.ASSETS.fetch(u) : await fetch(u); if (r.ok) return (await r.json()).ajustes || {}; } catch {}
  return {};
}

export default async (req) => {
  const store = getStore({ name: "entrecausas-reservas", consistency: "strong" });
  const url = new URL(req.url);

  // ---- Cliente: ver el estado de su reserva ----
  if (req.method === "GET" && url.searchParams.has("ver")) {
    const f = url.searchParams.get("f"), id = url.searchParams.get("ver");
    if (!esFecha(f)) return json({ error: "Faltan datos" }, 400);
    const d = await store.get("dia/" + f, { type: "json" });
    const r = (d?.reservas || []).find((x) => x.id === id);
    return r ? json({ estado: r.estado }) : json({ error: "No encontrada" }, 404);
  }

  // ---- Cliente: nueva reserva ----
  if (req.method === "POST" && !url.searchParams.has("manual")) {
    let b; try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
    const hoy = fechaRoma(), max = fechaRoma(new Date(Date.now() + 31 * 86400000));
    if (!esFecha(b.fecha) || b.fecha < hoy || b.fecha > max) return json({ error: "Fecha no válida" }, 400);
    if (!/^\d\d:\d\d$/.test(String(b.hora || ""))) return json({ error: "Hora no válida" }, 400);
    const personas = Math.min(18, Math.max(1, parseInt(b.personas, 10) || 0));
    const nombre = txt(b.nombre, 60).trim(), tel = txt(String(b.tel || "").replace(/[^\d+]/g, ""), 20), tk = claveTel(tel);
    if (!nombre || !tk) return json({ error: "Faltan nombre o teléfono" }, 400);
    if (!(await limite(req, "reserva", 5, 30))) return demasiados();
    const AJ = await ajustes(req), P = AJ.resPromo || {};
    const r = { id: codigo(), fecha: b.fecha, hora: b.hora, personas, nombre, tel, nota: txt(b.nota, 300),
      lang: ["it", "en"].includes(b.lang) ? b.lang : "es", desc: 0, estado: "pendiente", origen: "app", ts: new Date().toISOString() };
    let marca = "";
    if (P.activo && (P.dias || []).includes(dow(b.fecha))) {
      if (!P.primera) r.desc = Number(P.pct) || 0;
      else {
        // el teléfono queda apuntado con una marca propia; si la reserva no se guarda o se rechaza, se libera
        marca = crypto.randomUUID();
        const ok = await modificar(store, "usadas", { tels: {} }, (d) => { if (d.tels[tk]) return false; d.tels[tk] = marca; return true; });
        if (ok) { r.desc = Number(P.pct) || 0; r.promo = marca; } else marca = "";
      }
    }
    const desc = r.desc;
    // señal para grupos grandes o para quien ya faltó alguna vez
    const SE = AJ.senal || {};
    if (SE.activo && Number(SE.monto) > 0) {
      const falto = ((await store.get("faltas", { type: "json" }))?.tels || {})[tk] > 0;
      if (personas >= (parseInt(SE.desde, 10) || 8) || (SE.faltas !== false && falto)) r.senal = Math.round(Number(SE.monto) * personas * 100) / 100;
    }
    const liberar = () => (marca ? liberarPromo(store, tk, marca).catch(() => {}) : null);
    try {
      const ok = await modificar(store, "dia/" + b.fecha, { reservas: [] }, (d) => {
        if (d.reservas.length >= 300) return false;
        while (d.reservas.some((x) => x.id === r.id)) r.id = codigo();
        d.reservas.push(r);
        return true;
      });
      if (!ok) { await liberar(); return json({ error: "Día completo" }, 429); }
    } catch { await liberar(); return json({ error: "Inténtalo de nuevo" }, 503); }
    await avisar("reserva");
    return json({ ok: true, id: r.id, fecha: r.fecha, desc, senal: r.senal || 0 });
  }

  if (!(await pinOk(req))) return json({ error: "PIN incorrecto" }, 401);

  // ---- Panel: reserva hecha por teléfono o en el local ----
  if (req.method === "POST") {
    let b; try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
    if (!esFecha(b.fecha) || !/^\d\d:\d\d$/.test(String(b.hora || ""))) return json({ error: "Faltan día u hora" }, 400);
    const r = { id: codigo(), fecha: b.fecha, hora: b.hora, personas: Math.min(40, Math.max(1, parseInt(b.personas, 10) || 1)),
      nombre: txt(b.nombre, 60), tel: txt(String(b.tel || "").replace(/[^\d+]/g, ""), 20), nota: txt(b.nota, 300), lang: "es",
      desc: 0, estado: "confirmada", origen: "local", ts: new Date().toISOString() };
    await modificar(store, "dia/" + b.fecha, { reservas: [] }, (d) => { d.reservas.push(r); return true; });
    return json({ ok: true, reserva: r });
  }

  // ---- Panel: lista ----
  if (req.method === "GET") {
    const desde = esFecha(url.searchParams.get("desde")) ? url.searchParams.get("desde") : fechaRoma();
    const hasta = esFecha(url.searchParams.get("hasta")) ? url.searchParams.get("hasta") : desde;
    const res = await store.getMany(rangoDias(desde, hasta, 62).map((f) => "dia/" + f));
    const reservas = [];
    res.forEach((d) => d && reservas.push(...d.reservas));
    const fl = (await store.get("faltas", { type: "json" }))?.tels || {};
    reservas.forEach((r) => { const k = claveTel(r.tel); if (k && fl[k]) r.faltas = fl[k]; });
    return json({ desde, hasta, hoy: fechaRoma(), reservas });
  }

  // ---- Panel: cambiar estado ----
  if (req.method === "PATCH") {
    let b; try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
    if (!esFecha(b.fecha) || !b.id || (b.estado !== undefined && !ESTADOS.includes(b.estado))) return json({ error: "Faltan datos" }, 400);
    let antes = "";
    const out = await modificar(store, "dia/" + b.fecha, { reservas: [] }, (d) => {
      const r = d.reservas.find((x) => x.id === b.id);
      if (!r) return false;
      antes = r.estado;
      if (b.estado) r.estado = b.estado;
      if (b.mesa !== undefined) r.mesa = txt(String(b.mesa || ""), 4);
      if (b.recordado === true) r.recordado = true;
      if (b.senalPagada !== undefined) r.senalPagada = !!b.senalPagada;
      if (b.senal !== undefined) { const m = Math.round((Number(b.senal) || 0) * 100) / 100; if (m > 0) r.senal = m; else { delete r.senal; delete r.senalPagada; } }
      return r;
    });
    const tk = out && claveTel(out.tel);
    // promo de primera reserva: si se rechaza, el cliente la recupera; si se vuelve a aceptar, se gasta de nuevo
    if (tk && out.promo && (b.estado === "rechazada") !== (antes === "rechazada")) {
      try {
        if (b.estado === "rechazada") await liberarPromo(store, tk, out.promo);
        else await modificar(store, "usadas", { tels: {} }, (d) => { if (d.tels[tk] && d.tels[tk] !== out.promo) return false; d.tels[tk] = out.promo; return true; });
      } catch {}
    }
    // quien no viene: se cuenta por teléfono
    if (tk && (b.estado === "noshow") !== (antes === "noshow") && (b.estado === "noshow" || antes === "noshow")) {
      await modificar(store, "faltas", { tels: {} }, (d) => { d.tels[tk] = Math.max(0, (d.tels[tk] || 0) + (b.estado === "noshow" ? 1 : -1)); return true; });
    }
    return out ? json({ ok: true, reserva: out }) : json({ error: "No encontrada" }, 404);
  }

  return json({ error: "Método no permitido" }, 405);
};
