import { getStore } from "./store.mjs";
import { json, pinOk, modificar } from "./comun.mjs";

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

// Avisa a todos los dispositivos del local. Nunca lanza error.
export async function notificar() {
  try {
    const d = await st().get("subs", { type: "json" });
    const subs = d?.lista || [];
    if (!subs.length) return;
    const k = await claves(), muertos = [];
    await Promise.all(subs.map(async (s) => {
      try {
        const r = await fetch(s.endpoint, { method: "POST", headers: {
          TTL: "86400", Urgency: "high", "Content-Length": "0",
          Authorization: `vapid t=${await jwt(new URL(s.endpoint).origin, k)}, k=${k.pub}`,
        } });
        if (r.status === 404 || r.status === 410) muertos.push(s.endpoint);
      } catch {}
    }));
    if (muertos.length) await modificar(st(), "subs", { lista: [] }, (x) => { x.lista = x.lista.filter((s) => !muertos.includes(s.endpoint)); return true; });
  } catch {}
}
// Con tope de tiempo, para no retrasar la respuesta al cliente
export const avisar = () => Promise.race([notificar(), new Promise((r) => setTimeout(r, 4000))]);

export default async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") return json({ key: (await claves()).pub });
  if (!(await pinOk(req))) return json({ error: "PIN incorrecto" }, 401);
  if (req.method === "POST" && url.searchParams.has("prueba")) { await notificar(); return json({ ok: true }); }
  let b; try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const ep = String(b?.endpoint || b?.sub?.endpoint || "");
  if (!/^https:\/\//.test(ep)) return json({ error: "Suscripción inválida" }, 400);
  if (req.method === "POST") {
    await modificar(st(), "subs", { lista: [] }, (x) => {
      x.lista = x.lista.filter((s) => s.endpoint !== ep).concat({ endpoint: ep, nombre: String(b.nombre || "").slice(0, 40), alta: new Date().toISOString() }).slice(-30);
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
