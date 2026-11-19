import { getStore } from "./store.mjs";
import { json, pinOk, quien, modificar } from "./comun.mjs";

// Notificaciones push al panel del local (Android, PC e iPhone instalado en inicio).
// Se envían sin contenido: el aviso lo arma el propio panel (sw-admin.js).
const st = () => getStore({ name: "entrecausas-push", consistency: "strong" });
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = new TextEncoder();

async function claves() {
  let k = await st().get("vapid", { type: "json" });
  if (k) return k;
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pub = b64u(await crypto.subtle.exportKey("raw", par.publicKey));
  const priv = await crypto.subtle.exportKey("jwk", par.privateKey);
  k = { pub, priv };
  const r = await st().setJSON("vapid", k, { onlyIfNew: true });
  return r && r.modified === false ? await st().get("vapid", { type: "json" }) : k;
}

async function jwt(aud, k) {
  const h = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const p = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:info@entrecausas.app" })));
  const key = await crypto.subtle.importKey("jwk", k.priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(h + "." + p));
  return h + "." + p + "." + b64u(sig);
}

// A quién le llega cada aviso (el texto lo pone el service worker según la app: panel, cocina o palmare)
const PARA = {
  pedido: ["dueno", "cocina"],   // pedido de la app (delivery / retiro)
  sala: ["cocina"],              // comanda del palmare, segundos marchados o pedido por teléfono
  reserva: ["dueno"],
  llamada: ["camarero", "dueno"],
  servir: ["camarero"],           // platos de sala listos en cocina
  prueba: ["dueno", "cocina", "camarero"],
};
// Avisa a los dispositivos de esos roles. Nunca lanza error.
export async function notificar(tipo = "pedido", soloEp = "", soloRol = "") {
  try {
    const d = await st().get("subs", { type: "json" });
    const roles = PARA[tipo] || PARA.pedido;
    const subs = (d?.lista || []).filter((s) => soloEp ? s.endpoint === soloEp : soloRol ? (s.rol || "dueno") === soloRol : roles.includes(s.rol || "dueno"));
    if (!subs.length) return 0;
    // el texto del aviso lo elige el móvil leyendo esto: se guarda por rol, para que dos avisos seguidos no se pisen
    try {
      const u = { tipo, ts: Date.now() }, rs = [...new Set(subs.map((s) => s.rol || "dueno"))];
      await modificar(st(), "ultimo", {}, (d) => { Object.assign(d, u); d.por = d.por || {}; rs.forEach((r) => (d.por[r] = u)); return true; });
    } catch {}
    const k = await claves(), muertos = [];
    let enviados = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        const r = await fetch(s.endpoint, { method: "POST", headers: {
          TTL: "86400", Urgency: "high", "Content-Length": "0",
          Authorization: `vapid t=${await jwt(new URL(s.endpoint).origin, k)}, k=${k.pub}`,
        } });
        if (r.ok) enviados++;
        if (r.status === 404 || r.status === 410) muertos.push(s.endpoint);
      } catch {}
    }));
    if (muertos.length) await modificar(st(), "subs", { lista: [] }, (x) => { x.lista = x.lista.filter((s) => !muertos.includes(s.endpoint)); return true; });
    return enviados;
  } catch { return 0; }
}
// Con tope de tiempo, para no retrasar la respuesta al cliente
export const avisar = (tipo) => Promise.race([notificar(tipo), new Promise((r) => setTimeout(r, 4000))]);

export default async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.has("ultimo")) {
    const u = (await st().get("ultimo", { type: "json" })) || {}, r = url.searchParams.get("rol");
    return json(r && u.por && u.por[r] ? u.por[r] : { tipo: u.tipo, ts: u.ts });
  }
  if (req.method === "GET") return json({ key: (await claves()).pub });
  const q = await quien(req);
  if (!q) return json({ error: "PIN incorrecto" }, 401);
  // ¿Sigue registrado este dispositivo? + cuántos dispositivos con avisos tiene cada rol
  if (req.method === "PUT") {
    let b = {}; try { b = await req.json(); } catch {}
    const lista = (await st().get("subs", { type: "json" }))?.lista || [];
    const n = (r) => lista.filter((s) => (s.rol || "dueno") === r).length;
    return json({ registrado: !!lista.find((s) => s.endpoint === b.endpoint), dueno: n("dueno"), cocina: n("cocina"), camarero: n("camarero") });
  }
  if (req.method === "POST" && url.searchParams.has("prueba")) {
    let b = {}; try { b = await req.json(); } catch {}
    const rol = ["dueno", "cocina", "camarero"].includes(b.rol) ? b.rol : "";
    if (rol && q.rol !== "dueno") return json({ error: "Solo el dueño" }, 403);
    const n = await notificar("prueba", rol ? "" : String(b.endpoint || ""), rol);
    return json({ ok: true, enviados: n || 0 });
  }
  let b; try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const ep = String(b?.endpoint || b?.sub?.endpoint || "");
  if (!/^https:\/\//.test(ep)) return json({ error: "Suscripción inválida" }, 400);
  if (req.method === "POST") {
    await modificar(st(), "subs", { lista: [] }, (x) => {
      x.lista = x.lista.filter((s) => s.endpoint !== ep).concat({ endpoint: ep, rol: q.rol, pid: q.id || "", nombre: (q.nombre ? q.nombre + " · " : "") + String(b.nombre || "").slice(0, 40), alta: new Date().toISOString() }).slice(-40);
      return true;
    });
    return json({ ok: true });
  }
  if (req.method === "DELETE") {
    await modificar(st(), "subs", { lista: [] }, (x) => { x.lista = x.lista.filter((s) => s.endpoint !== ep); return true; });
    return json({ ok: true });
  }
  return json({ error: "Método no permitido" }, 405);
};
