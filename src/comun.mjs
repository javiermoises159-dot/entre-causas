import { getStore, ENV } from "./store.mjs";
// Utilidades compartidas por las funciones de Entre Causas
export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

// Comprueba el PIN. Tras 10 intentos fallidos desde la misma IP, bloquea 15 minutos.
const BLOQUEO = 15 * 60 * 1000, MAX_FALLOS = 10;
export async function pinOk(req) {
  const real = ENV.ADMIN_PIN;
  if (!real) return false;
  const ip = (req.headers.get("cf-connecting-ip") || "desconocida").replace(/[^\w.:-]/g, "_");
  const st = getStore({ name: "entrecausas-seguridad", consistency: "strong" });
  const key = "fallos/" + ip, ahora = Date.now();
  let f = null;
  try { f = await st.get(key, { type: "json" }); } catch {}
  const vigente = f && ahora - f.t < BLOQUEO;
  if (vigente && f.n >= MAX_FALLOS) return false;
  if (req.headers.get("x-admin-pin") === real) {
    if (f) { try { await st.delete(key); } catch {} }
    return true;
  }
  try { await st.setJSON(key, { n: (vigente ? f.n : 0) + 1, t: vigente ? f.t : ahora }); } catch {}
  return false;
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
