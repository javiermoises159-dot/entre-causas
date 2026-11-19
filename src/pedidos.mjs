import { getStore, ENV } from "./store.mjs";
import { avisar } from "./push.mjs";
import { restante, contar, reservar } from "./stock.mjs";
import { json, pinOk, fechaRoma, horaRoma, esFecha, rangoDias, txt, num, modificar, aMin, ahoraRoma, abiertoEn, enCierre, limite, demasiados } from "./comun.mjs";

// Misma persona aunque escriba +39, 0039 o espacios
function claveTel(t) {
  let d = String(t || "").replace(/\D/g, "");
  if (d.startsWith("0039")) d = d.slice(4);
  else if (d.length >= 11 && d.startsWith("39")) d = d.slice(2);
  return d.length >= 8 ? d : "";
}
const ESTADOS = ["espera", "nuevo", "preparando", "encamino", "listo", "entregado", "cancelado"];
const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const codigo = () => Array.from({ length: 4 }, () => LETRAS[Math.floor(Math.random() * LETRAS.length)]).join("");

async function leerMenu(req) {
  const m = await getStore({ name: "entrecausas", consistency: "strong" }).get("menu", { type: "json" });
  if (m) return m;
  try { const u = new URL("/menu.json", req.url), r = ENV.ASSETS ? await ENV.ASSETS.fetch(u) : await fetch(u); if (r.ok) return await r.json(); } catch {}
  return null;
}

// Recalcula precios con la carta guardada: el total no depende de lo que mande el navegador
const DOWR = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const diaRoma = (d = new Date()) => DOWR[new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", weekday: "short" }).format(d)];
// Día del que sale el stock: el de la entrega si el pedido es programado
const diaStock = (p) => (p.prog && p.prog.fecha) || p.fecha;
// Platos que hoy no se pueden pedir (agotados o fuera de sus días)
function noDisponibles(menu, lineas, dia = new Date()) {
  const items = {}, hoy = diaRoma(dia), out = [];
  (menu.categorias || []).forEach((c) => (c.items || []).forEach((i) => (items[i.id] = i)));
  for (const l of Array.isArray(lineas) ? lineas : []) {
    const it = items[l?.id];
    if (it && (it.agotado || (Array.isArray(it.dias) && it.dias.length && !it.dias.includes(hoy)))) out.push({ id: it.id, n: it.nombre });
  }
  return out;
}
// Grupo de opciones del combo (si el plato lo tiene activo)
const gruposDe = (it) => [...(it.opciones || []), ...(it.combo && it.combo.activo && String(it.combo.texto || "").trim()
  ? [{ nombre: "Combo", valores: [{ nombre: it.combo.texto.trim(), precio: Number(it.combo.precio) || 0 }] }] : [])];
function armar(menu, lineas) {
  const items = {};
  (menu.categorias || []).forEach((c) => (c.items || []).forEach((i) => (items[i.id] = i)));
  const out = [];
  for (const l of (Array.isArray(lineas) ? lineas : []).slice(0, 40)) {
    const it = items[l?.id];
    const q = Math.min(50, Math.max(1, parseInt(l?.q, 10) || 1));
    if (!it || it.oculto) continue;
    let extra = 0;
    const o = [];
    for (const s of Array.isArray(l.o) ? l.o.slice(0, 10) : []) {
      const g = gruposDe(it).find((g) => g.nombre === s?.g);
      if (!g) continue;
      const v = (Array.isArray(s.v) ? s.v : []).filter((x) => g.valores.some((z) => z.nombre === x)).slice(0, 15);
      v.forEach((x) => (extra += Number(g.valores.find((z) => z.nombre === x).precio) || 0));
      if (v.length) o.push({ g: g.nombre, v });
    }
    const unit = num(Number(it.precio) + extra);
    out.push({ id: it.id, n: it.nombre, q, o, unit, total: num(unit * q) });
  }
  return out;
}

// Minutos de espera según los platos que hay ahora en cocina
export function espera(pedidos, modo = "Delivery") {
  const platos = (pedidos || []).filter((p) => ["nuevo", "preparando"].includes(p.estado))
    .reduce((a, p) => a + (p.lineas || []).filter((l) => !l.anulado && !l.listo).reduce((b, l) => b + (l.q || 0), 0), 0);
  const base = modo === "Delivery" ? 25 : 10, min = Math.round((base + Math.max(0, platos - 3) * 2.5) / 5) * 5;
  return { platos, min: Math.min(modo === "Delivery" ? 90 : 60, Math.max(base, min)) };
}

export default async (req) => {
  const store = getStore({ name: "entrecausas-pedidos", consistency: "strong" });
  const url = new URL(req.url);

  // ---- Público: tiempo de espera estimado ahora (para la app de clientes) ----
  if (req.method === "GET" && url.searchParams.has("espera")) {
    const d = await store.get("dia/" + fechaRoma(), { type: "json" });
    return json({ delivery: espera(d?.pedidos, "Delivery").min, retiro: espera(d?.pedidos, "Retiro en local").min });
  }

  // ---- Cliente: ver el estado de su pedido ----
  if (req.method === "GET" && url.searchParams.has("ver")) {
    const f = url.searchParams.get("f"), id = url.searchParams.get("ver");
    if (!esFecha(f)) return json({ error: "Faltan datos" }, 400);
    const d = await store.get("dia/" + f, { type: "json" });
    const p = (d?.pedidos || []).find((x) => x.id === id);
    return p ? json({ estado: p.estado, modo: p.modo, eta: p.etaHora || "", motivo: p.motivo || "" }) : json({ error: "No encontrado" }, 404);
  }

  // ---- Cliente envía un pedido (público) ----
  if (req.method === "POST" && !url.searchParams.has("manual")) {
    let b; try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
    const menu = await leerMenu(req);
    if (!menu) return json({ error: "Carta no disponible" }, 503);
    // pausa de la cocina (salvo pedidos programados)
    // pedido apuntado por el local (teléfono): con PIN, sin pausa ni límite de franja
    const porTel = (b.origen === "tel" || b.origen === "palmare") && (await pinOk(req));
    const palmare = porTel && b.origen === "palmare";
    if (!porTel && !(await limite(req, "pedido", 6, 10))) return demasiados();
    const pz = menu.ajustes?.pausa ? Date.parse(menu.ajustes.pausa) : 0;
    if (!porTel && pz > Date.now() && !(b.prog && b.prog.hora)) return json({ error: "pausa", hasta: horaRoma(new Date(pz)) }, 423);
    // pedido programado para mañana: disponibilidad y stock de mañana
    const manana = !!(b.prog && /^\d\d:\d\d$/.test(String(b.prog.hora || "")) && Number(b.prog.dia) === 1);
    const diaEntrega = new Date(Date.now() + (manana ? 86400000 : 0)), fStock = fechaRoma(diaEntrega);
    // horario: el servidor no acepta pedidos con el local cerrado (los del local por teléfono o palmare, sí)
    if (!porTel) {
      const AJh = menu.ajustes || {}, n = ahoraRoma(), prgOk = !!(b.prog && /^\d\d:\d\d$/.test(String(b.prog.hora || "")));
      if (enCierre(AJh, fStock)) return json({ error: "cerrado" }, 423);
      if (!prgOk) {
        if (AJh.modo === "cerrado" || (AJh.modo !== "abierto" && !abiertoEn(AJh, n.d, n.m))) return json({ error: "cerrado" }, 423);
      } else {
        const m = aMin(b.prog.hora);
        if ((!manana && m < n.m - 5) || (AJh.modo !== "abierto" && !abiertoEn(AJh, (n.d + (manana ? 1 : 0)) % 7, m))) return json({ error: "hora" }, 423);
      }
      const D = AJh.horaDel;
      if (D && D.abre && D.cierra && b.modo !== "Retiro en local" && !String(b.mesa || "").replace(/\D/g, "")) {
        const m = prgOk ? aMin(b.prog.hora) : n.m;
        if (!(m >= aMin(D.abre) && m < aMin(D.cierra))) return json({ error: "horaDel", abre: D.abre, cierra: D.cierra }, 423);
      }
    }
    const nd = noDisponibles(menu, b.lineas, diaEntrega);
    if (nd.length) return json({ error: "no-disponible", items: nd }, 409);
    const lineas = armar(menu, b.lineas);
    if (!lineas.length) return json({ error: "Pedido vacío" }, 400);
    // stock del día
    const rest = await restante(menu, fStock);
    const pide = {};
    lineas.forEach((l) => { if (rest[l.id] !== undefined) pide[l.id] = (pide[l.id] || 0) + l.q; });
    const sinStock = Object.keys(pide).filter((k) => pide[k] > rest[k]);
    if (sinStock.length) return json({ error: "no-disponible", items: sinStock.map((k) => ({ id: k, n: lineas.find((l) => l.id === k).n, quedan: rest[k] })) }, 409);
    const mesa = txt(String(b.mesa || "").replace(/\D/g, ""), 3);
    // en la mesa pide el camarero (palmare), no el cliente desde el QR
    if (mesa && !porTel) return json({ error: "mesa-camarero" }, 403);
    const modo = mesa ? "Mesa" : b.modo === "Retiro en local" ? "Retiro en local" : "Delivery";
    const sub = num(lineas.reduce((a, l) => a + l.total, 0));
    const AJ = menu.ajustes || {}, E = AJ.envio || {};
    const coms = (E.comunes || []).filter((c) => c && c.n);
    const com = modo === "Delivery" && coms.length ? coms.find((c) => c.n === b.comune) : null;
    let envio = 0;
    if (modo === "Delivery") {
      const gr = (com && com.gratisDesde) || E.gratisDesde;
      if (gr && sub >= gr) envio = 0;
      else if (coms.length) envio = com && com.costo != null && com.costo !== "" ? num(com.costo) : null;
      else if (E.costo == null || E.costo === "") envio = null;
      else envio = num(E.costo);
    }
    // cupón de descuento (se valida con la carta guardada)
    let cupon = "", desc = 0;
    const code = String(b.cupon || "").trim().toUpperCase();
    const cu = code && (AJ.cupones || []).find((x) => x && x.activo !== false && String(x.codigo || "").trim().toUpperCase() === code);
    if (cu && !(cu.minimo && sub < cu.minimo)) {
      const d = cu.tipo === "%" ? (sub * (Number(cu.valor) || 0)) / 100 : Number(cu.valor) || 0;
      desc = num(Math.min(sub, Math.max(0, d)));
      cupon = code;
    }
    const ahora = new Date(), fecha = fechaRoma(ahora);
    // pedido programado
    let prog = null;
    if (b.prog && /^\d\d:\d\d$/.test(String(b.prog.hora || ""))) {
      prog = { fecha: fStock, hora: b.prog.hora };
    }
    // límite de deliveries por franja de 30 min
    const FR = AJ.franja || {};
    const maxF = parseInt(FR.max, 10) || 0;
    if (!porTel && FR.activo && maxF > 0 && modo === "Delivery") {
      const fF = prog ? prog.fecha : fecha, hF = prog ? prog.hora : horaRoma(ahora);
      const slot = (h) => { const [a, m] = String(h).split(":").map(Number); return a * 2 + (m >= 30 ? 1 : 0); };
      const dd = await store.get("dia/" + fF, { type: "json" });
      const cnt = {};
      (dd?.pedidos || []).filter((x) => x.modo === "Delivery" && x.estado !== "cancelado")
        .forEach((x) => { const s = slot(x.prog && x.prog.fecha === fF ? x.prog.hora : x.hora); cnt[s] = (cnt[s] || 0) + 1; });
      let s = slot(hF);
      if ((cnt[s] || 0) >= maxF) {
        let k = s + 1; while (k < s + 8 && (cnt[k] || 0) >= maxF) k++;
        const hh = String(Math.floor(k / 2) % 24).padStart(2, "0") + ":" + (k % 2 ? "30" : "00");
        return json({ error: "franja", siguiente: hh }, 409);
      }
    }
    // stock: se reserva aquí, ya validado todo lo demás
    let falta;
    try { falta = await reservar(menu, fStock, lineas); } catch { return json({ error: "Inténtalo de nuevo" }, 503); }
    if (falta) return json({ error: "no-disponible", items: falta.map((x) => ({ id: x.id, n: lineas.find((l) => l.id === x.id).n, quedan: x.quedan })) }, 409);
    const devolver = () => contar(menu, fStock, lineas, -1).catch(() => {});
    // teléfono y fidelidad
    const tel = txt(String(b.tel || "").replace(/[^\d+]/g, ""), 20);
    const telKey = claveTel(tel);
    let fid = null, notaCli = "", nCli = 0;
    if (telKey) {
      try {
        const F = AJ.fidelidad || {}, cada = parseInt(F.cada, 10) || 0;
        const cs = getStore({ name: "entrecausas-clientes", consistency: "strong" });
        const r = await modificar(cs, "c/" + telKey, { tel, nombre: "", n: 0, total: 0, primero: fecha }, (c) => {
          c.tel = tel; c.nombre = txt(b.cliente?.nombre, 60) || c.nombre; c.n++;
          // el cupón de primera compra no vale si ya había pedido antes: se suma lo que de verdad paga
          const total = num(sub - (cu && cu.primera && c.n > 1 ? 0 : desc) + (envio || 0));
          c.total = num(c.total + total);
          c.ultimo = fecha; c.promos = b.promos === true; c.lang = ["it", "en"].includes(b.lang) ? b.lang : "es";
          // lo que más pide y sus últimos pedidos (para la ficha del cliente)
          c.fav = c.fav || {};
          lineas.forEach((l) => (c.fav[l.n] = (c.fav[l.n] || 0) + l.q));
          c.hist = [{ f: fecha, t: total, d: txt(lineas.map((l) => l.q + "× " + l.n).join(", "), 160) }, ...(c.hist || [])].slice(0, 8);
          return { n: c.n, nota: c.nota || "" };
        });
        notaCli = r?.nota || "";
        const n = r?.n;
        nCli = n || 0;
        if (F.activo && cada >= 2 && n) {
          const k = ((n - 1) % cada) + 1;
          fid = { n: k, cada, toca: k === cada, premio: txt(F.premio, 60) || "premio" };
        }
      } catch {}
    }
    // cupón de primera compra: solo si es de verdad el primer pedido de ese teléfono
    if (cu && cu.primera && (!telKey || nCli > 1)) { desc = 0; cupon = ""; }
    const p = {
      id: codigo(), fecha, hora: horaRoma(ahora), ts: ahora.toISOString(), origen: palmare ? "palmare" : porTel ? "tel" : "app", estado: palmare && b.espera === true ? "espera" : porTel && !palmare ? "preparando" : "nuevo",
      cliente: txt(b.cliente?.nombre, 60), dir: modo === "Delivery" ? txt(b.cliente?.dir, 160) : "",
      modo, mesa, pago: b.pago === "Tarjeta" ? "Tarjeta" : "Efectivo", nota: txt(b.nota, 300), lang: ["it", "en"].includes(b.lang) ? b.lang : "es",
      lineas, subtotal: sub, envio, total: num(sub - desc + (envio || 0)),
      tel, comune: com ? com.n : "", cupon, desc, prog, fid, notaCli, nCli,
    };
    if (palmare) {
      // comensal y nota de cada línea (misma posición que las líneas)
      const ok = Array.isArray(b.lineas) && b.lineas.length === lineas.length;
      p.asientos = lineas.map((_, i) => (ok ? Math.max(0, Math.min(30, parseInt(b.lineas[i].c, 10) || 0)) : 0));
      p.notasL = lineas.map((_, i) => (ok ? txt(b.lineas[i].nt, 60) : ""));
      p.salida = Math.max(0, Math.min(3, Number.isInteger(+b.salida) ? +b.salida : 1));
      p.mozo = txt(b.mozo, 30);
    }
    if (porTel) { const m = parseInt(b.eta, 10); if (m >= 5 && m <= 120) { p.eta = m; p.etaHora = horaRoma(new Date(Date.now() + m * 60000)); } }
    try {
      const ok = await modificar(store, "dia/" + fecha, { pedidos: [] }, (d) => {
        if (d.pedidos.length >= 800) return false;
        while (d.pedidos.some((x) => x.id === p.id)) p.id = codigo();
        d.pedidos.push(p);
        return true;
      });
      if (!ok) { await devolver(); return json({ error: "Límite diario alcanzado" }, 429); }
    } catch { await devolver(); return json({ error: "Inténtalo de nuevo" }, 503); }
    // aviso al móvil: pedido de la app → dueño y cocina; comanda de sala / teléfono → cocina
    if (!porTel) await avisar("pedido"); else if (p.estado !== "espera") await avisar("sala");
    return json({ ok: true, id: p.id, fecha: p.fecha, total: p.total, envio: p.envio, fid });
  }

  if (!(await pinOk(req))) return json({ error: "PIN incorrecto" }, 401);

  // ---- Panel: venta manual (en el local, por teléfono, etc.) ----
  if (req.method === "POST") {
    let b; try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
    const fecha = esFecha(b.fecha) ? b.fecha : fechaRoma();
    const total = num(b.total);
    if (!(total > 0)) return json({ error: "Monto inválido" }, 400);
    const p = { id: "L" + codigo().slice(1), fecha, hora: txt(b.hora, 5) || horaRoma(), ts: new Date().toISOString(), origen: "local",
      estado: "entregado", cliente: txt(b.cliente, 60), dir: "", modo: txt(b.modo, 30) || "En el local",
      pago: b.pago === "Tarjeta" ? "Tarjeta" : "Efectivo", nota: txt(b.nota, 300), lineas: [], subtotal: total, envio: 0, total };
    await modificar(store, "dia/" + fecha, { pedidos: [] }, (d) => { d.pedidos.push(p); return true; });
    return json({ ok: true, pedido: p });
  }

  // ---- Panel: lista de pedidos ----
  if (req.method === "GET") {
    const desde = esFecha(url.searchParams.get("desde")) ? url.searchParams.get("desde") : fechaRoma();
    const hasta = esFecha(url.searchParams.get("hasta")) ? url.searchParams.get("hasta") : desde;
    const dias = rangoDias(desde, hasta, 400);
    const res = await store.getMany(dias.map((f) => "dia/" + f));
    const pedidos = [];
    res.forEach((d) => d && pedidos.push(...d.pedidos));
    return json({ desde, hasta, hoy: fechaRoma(), pedidos });
  }

  // ---- Panel: cambiar estado, pago o envío ----
  if (req.method === "PATCH") {
    let b; try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
    if (!esFecha(b.fecha) || !b.id) return json({ error: "Faltan datos" }, 400);
    let antes = "", quitar = null, servir = false;
    const out = await modificar(store, "dia/" + b.fecha, { pedidos: [] }, (d) => {
      const p = d.pedidos.find((x) => x.id === b.id);
      if (!p) return false;
      antes = p.estado;
      if (b.rep !== undefined) p.rep = txt(String(b.rep || ""), 10);
      if (ESTADOS.includes(b.estado)) { if (p.estado === "espera" && b.estado === "nuevo") p.marchado = new Date().toISOString(); p.estado = b.estado; }
      // cocina: plato listo uno a uno; si están todos, la comanda queda lista
      if (Number.isInteger(b.listoL) && p.lineas[b.listoL] && !p.lineas[b.listoL].anulado) {
        const l = p.lineas[b.listoL]; l.listo = !l.listo; if (l.listo) { l.listoTs = new Date().toISOString(); servir = true; } else delete l.listoTs;
        const vivas = p.lineas.filter((x) => !x.anulado);
        if (vivas.length && vivas.every((x) => x.listo) && ["nuevo", "preparando"].includes(p.estado)) p.estado = p.modo === "Delivery" ? p.estado : "listo";
      }
      if (b.pago === "Efectivo" || b.pago === "Tarjeta") p.pago = b.pago;
      if (b.eta !== undefined) { const m = parseInt(b.eta, 10); if (m >= 5 && m <= 120) { p.eta = m; p.etaHora = horaRoma(new Date(Date.now() + m * 60000)); } }
      if (b.resena === true) p.resena = true;
      if (b.cuenta !== undefined) p.cuenta = txt(String(b.cuenta || ""), 24);
      // anular un plato ya enviado (palmare): no se cobra y la cocina lo ve tachado
      if (b.anular && Number.isInteger(b.anular.i) && p.lineas[b.anular.i] && !p.lineas[b.anular.i].anulado) {
        const l = p.lineas[b.anular.i];
        l.anulado = true; l.motivo = txt(b.anular.motivo, 40); quitar = [{ id: l.id, q: l.q }];
        p.subtotal = num(p.lineas.filter((x) => !x.anulado).reduce((a, x) => a + x.total, 0));
        p.total = num(p.subtotal - (p.desc || 0) + (p.envio || 0));
        if (p.lineas.every((x) => x.anulado)) p.estado = "cancelado";
      }
      if (b.motivo !== undefined) p.motivo = ["llena", "zona", "agotado", "cierre"].includes(b.motivo) ? b.motivo : "";
      if (b.envio !== undefined) { p.envio = b.envio === null ? null : num(b.envio); p.total = num(p.subtotal - (p.desc || 0) + (p.envio || 0)); }
      return p;
    });
    // stock: el plato anulado se devuelve una vez; al cancelar o reactivar solo cuentan los platos no anulados
    if (out && quitar) { try { await contar(await leerMenu(req), diaStock(out), quitar, -1); } catch {} }
    if (out && (antes === "cancelado") !== (out.estado === "cancelado") && out.origen !== "local") {
      const activas = (out.lineas || []).filter((x) => !x.anulado);
      if (activas.length) { try { await contar(await leerMenu(req), diaStock(out), activas, out.estado === "cancelado" ? -1 : 1); } catch {} }
    }
    if (out && antes === "espera" && out.estado === "nuevo") await avisar("sala"); // segundos marchados
    // platos de sala listos: aviso al camarero para que los sirva
    if (out && out.mesa && (servir || (antes !== "listo" && out.estado === "listo"))) await avisar("servir");
    return out ? json({ ok: true, pedido: out }) : json({ error: "No encontrado" }, 404);
  }

  return json({ error: "Método no permitido" }, 405);
};

