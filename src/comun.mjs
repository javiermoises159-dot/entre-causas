import { getStore, ENV } from "./store.mjs";
// Utilidades compartidas por las funciones de Entre Causas
export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

// Comprueba el PIN. Tras 10 intentos fallidos desde la misma IP, esa red queda bloqueada 15 minutos
// para PIN nuevos; los PIN que ya entraron bien desde esa red (24 h) siguen funcionando, salvo que
// haya más de 100 fallos (alguien probando PIN a lo loco): entonces se bloquea todo.
const BLOQUEO = 15 * 60 * 1000, MAX_FALLOS = 10, MAX_TOTAL = 100, DIA = 864e5;
export const BLOQ = new WeakSet(); // peticiones rechazadas por bloqueo (se responden con 429, sin cerrar sesión)
const huella = async (pin) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("ec|" + pin)))].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
// PIN del dueño: si lo cambió desde el panel se guarda (solo su hash con sal) en entrecausas-seguridad/pin-dueno
// y manda sobre ADMIN_PIN. Para volver al de Cloudflare (si lo olvida): borrar esa fila en D1.
const sha = async (t) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, "0")).join("");
export const hashPin = (salt, pin) => sha("dueno|" + salt + "|" + pin);
export async function pinDuenoGuardado() {
  try { const d = await getStore({ name: "entrecausas-seguridad", consistency: "strong" }).get("pin-dueno", { type: "json" }); return d && d.h && d.salt ? d : null; } catch { return null; }
}
export async function esDueno(pin) {
  pin = String(pin || "");
  if (!pin) return false;
  const g = await pinDuenoGuardado();
  if (g) return (await hashPin(g.salt, pin)) === g.h;
  return !!ENV.ADMIN_PIN && pin === ENV.ADMIN_PIN;
}
// Quién entra: el dueño o una persona del equipo con su PIN (cocina, camarero)
export async function quien(req) {
  if (!ENV.ADMIN_PIN && !(await pinDuenoGuardado())) return null;
  const ip = (req.headers.get("cf-connecting-ip") || "desconocida").replace(/[^\w.:-]/g, "_");
  const st = getStore({ name: "entrecausas-seguridad", consistency: "strong" });
  const key = "fallos/" + ip, ahora = Date.now();
  let f = null;
  try { f = await st.get(key, { type: "json" }); } catch {}
  const vigente = f && ahora - f.t < BLOQUEO, bloqueada = vigente && f.n >= MAX_FALLOS;
  const pin = req.headers.get("x-admin-pin") || "";
  let q = null;
  if (pin && (await esDueno(pin))) q = { rol: "dueno", nombre: "Dueño", id: "" };
  else if (pin.length >= 4) {
    try {
      const l = (await getStore({ name: "entrecausas-equipo", consistency: "strong" }).get("lista", { type: "json" }))?.personas || [];
      const p = l.find((x) => x.pin && x.pin === pin && x.rol !== "repartidor");
      if (p) q = { rol: p.rol, nombre: p.nombre, id: p.id };
    } catch {}
  }
  if (q) {
    const hh = await huella(pin), ok = Object.fromEntries(Object.entries(f?.ok || {}).filter(([, t]) => ahora - t < DIA));
    if (bloqueada && (!ok[hh] || f.n >= MAX_TOTAL)) { BLOQ.add(req); return null; } // PIN bueno, pero la red está bloqueada
    if (!ok[hh] || ahora - ok[hh] > 36e5 || (f && f.n && !bloqueada)) { // se apunta como PIN conocido de esta red (como mucho una vez por hora)
      ok[hh] = ahora;
      try { await st.setJSON(key, bloqueada ? { ...f, ok } : { n: 0, t: ahora, ok }); } catch {}
    }
    return q;
  }
  try { await st.setJSON(key, { n: (vigente ? f.n : 0) + 1, t: vigente ? f.t : ahora, ok: f?.ok || {} }); } catch {}
  if (bloqueada) BLOQ.add(req);
  return null;
}
// roles: si se indica, solo esos roles pueden pasar
export async function pinOk(req, roles) {
  const q = await quien(req);
  return !!q && (!roles || roles.includes(q.rol));
}

// Fecha y hora siempre en hora de Italia.
// La jornada del local termina a las 5:00: lo que pasa a las 00:30 cuenta en el día del servicio
// (así la cocina y las mesas no se vacían a medianoche y la caja del día sale completa).
export const CORTE_JORNADA = 5 * 3600000;
export const fechaRoma = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d.getTime() - CORTE_JORNADA));
export const horaRoma = (d = new Date()) =>
  new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

export const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
export function rangoDias(desde, hasta, max = 400) {
  const out = [];
  let d = new Date(desde + "T12:00:00Z");
  const fin = new Date(hasta + "T12:00:00Z");
  while (d <= fin && out.length < max) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return out;
}
export const txt = (v, n) => String(v ?? "").slice(0, n);
export const num = (v) => Math.round((Number(v) || 0) * 100) / 100;

// Lee, modifica y guarda un documento evitando pisar cambios simultáneos
export async function modificar(store, key, inicial, fn) {
  for (let i = 0; i < 30; i++) {
    if (i) await new Promise((r) => setTimeout(r, 5 + Math.random() * 20 * Math.min(i, 6)));
    const cur = await store.getWithMetadata(key, { type: "json" });
    const data = cur ? cur.data : structuredClone(inicial);
    const res = fn(data);
    if (res === false) return null;
    const r = cur
      ? await store.setJSON(key, data, { onlyIfMatch: cur.etag })
      : await store.setJSON(key, data, { onlyIfNew: true });
    if (!r || r.modified !== false) return res;
  }
  throw new Error("conflicto");
}

// ---- Horario (mismas reglas que la app de clientes) ----
export const aMin = (s) => { const [a, b] = String(s || "0:0").split(":").map(Number); return a * 60 + (b || 0); };
// Día de la semana (0 = lunes) y minuto actual en Italia
export function ahoraRoma(d = new Date()) {
  const p = {};
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).forEach((x) => (p[x.type] = x.value));
  return { d: { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[p.weekday], m: (+p.hour) * 60 + (+p.minute) };
}
function franjaDia(AJ, d) {
  const h = AJ.horario?.[d];
  if (!h || h.cerrado || !h.abre || !h.cierra) return null;
  const a = aMin(h.abre); let c = aMin(h.cierra); if (c <= a) c += 1440;
  return [a, c];
}
// ¿Abierto el día d a los m minutos? (cuenta la noche anterior si cierra después de medianoche)
export function abiertoEn(AJ, d, m) {
  const s = franjaDia(AJ, d), y = franjaDia(AJ, (d + 6) % 7);
  return !!((s && m >= s[0] && m < s[1]) || (y && m + 1440 < y[1]));
}
export const enCierre = (AJ, f) => (AJ.cierres || []).find((c) => c && c.desde && f >= c.desde && f <= (c.hasta || c.desde));

// ---- Límite anti-spam por IP: como mucho `max` veces cada `min` minutos ----
export async function limite(req, tipo, max, min) {
  try {
    const ip = (req.headers.get("cf-connecting-ip") || "").replace(/[^\w.:-]/g, "_");
    if (!ip) return true;
    const st = getStore({ name: "entrecausas-limites", consistency: "strong" }), ahora = Date.now(), v = min * 60000;
    const ok = await modificar(st, tipo + "/" + ip, { t: ahora, n: 0 }, (d) => {
      if (ahora - d.t > v) { d.t = ahora; d.n = 0; }
      if (d.n >= max) return false;
      d.n++; return true;
    });
    return ok !== null;
  } catch { return true; } // si falla el contador, no se bloquea a nadie
}
export const demasiados = () => json({ error: "demasiados" }, 429);
