import { getStore, ENV } from "./store.mjs";
// Utilidades compartidas por las funciones de Entre Causas
export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

// Comprueba el PIN. Tras 10 intentos fallidos desde la misma IP, bloquea 15 minutos.
const BLOQUEO = 15 * 60 * 1000, MAX_FALLOS = 10;
// Quién entra: el dueño (ADMIN_PIN) o una persona del equipo con su PIN (cocina, camarero)
export async function quien(req) {
  const real = ENV.ADMIN_PIN;
  if (!real) return null;
  const ip = (req.headers.get("cf-connecting-ip") || "desconocida").replace(/[^\w.:-]/g, "_");
  const st = getStore({ name: "entrecausas-seguridad", consistency: "strong" });
  const key = "fallos/" + ip, ahora = Date.now();
  let f = null;
  try { f = await st.get(key, { type: "json" }); } catch {}
  const vigente = f && ahora - f.t < BLOQUEO;
  if (vigente && f.n >= MAX_FALLOS) return null;
  const pin = req.headers.get("x-admin-pin") || "";
  let q = null;
  if (pin && pin === real) q = { rol: "dueno", nombre: "Dueño", id: "" };
  else if (pin.length >= 4) {
    try {
      const l = (await getStore({ name: "entrecausas-equipo", consistency: "strong" }).get("lista", { type: "json" }))?.personas || [];
      const p = l.find((x) => x.pin && x.pin === pin && x.rol !== "repartidor");
      if (p) q = { rol: p.rol, nombre: p.nombre, id: p.id };
    } catch {}
  }
  if (q) { if (f) { try { await st.delete(key); } catch {} } return q; }
  try { await st.setJSON(key, { n: (vigente ? f.n : 0) + 1, t: vigente ? f.t : ahora }); } catch {}
  return null;
}
// roles: si se indica, solo esos roles pueden pasar
export async function pinOk(req, roles) {
  const q = await quien(req);
  return !!q && (!roles || roles.includes(q.rol));
}

// Fecha y hora siempre en hora de Italia
export const fechaRoma = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
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
