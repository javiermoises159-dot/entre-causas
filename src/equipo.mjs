import { getStore, ENV } from "./store.mjs";
import { json, quien, txt, modificar } from "./comun.mjs";

// Equipo: PIN por persona (cocina, camarero) y link de reparto (repartidor)
const ROLES = ["cocina", "camarero", "repartidor"];
const rnd = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => "abcdefghjkmnpqrstuvwxyz23456789"[x % 31]).join("");

export default async (req) => {
  const q = await quien(req);
  if (!q) return json({ error: "PIN incorrecto" }, 401);
  const url = new URL(req.url);
  const store = getStore({ name: "entrecausas-equipo", consistency: "strong" });
  const leer = async () => (await store.get("lista", { type: "json" }))?.personas || [];
  if (req.method === "GET" && url.searchParams.has("yo")) return json(q);
  if (req.method === "GET" && url.searchParams.has("reps")) return json({ reps: (await leer()).filter((p) => p.rol === "repartidor").map((p) => ({ id: p.id, nombre: p.nombre })) });
  if (q.rol !== "dueno") return json({ error: "Solo el dueño" }, 403);
  if (req.method === "GET") return json({ personas: await leer() });
  if (req.method === "POST") {
    let b; try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
    const nombre = txt(b.nombre, 40).trim(), rol = ROLES.includes(b.rol) ? b.rol : "";
    const pin = String(b.pin || "").replace(/\D/g, "");
    if (!nombre || !rol) return json({ error: "Faltan datos" }, 400);
    if (rol !== "repartidor" && (pin.length < 4 || pin.length > 8)) return json({ error: "El PIN debe tener de 4 a 8 números" }, 400);
    if (pin && pin === ENV.ADMIN_PIN) return json({ error: "Ese PIN ya está en uso" }, 400);
    const out = await modificar(store, "lista", { personas: [] }, (d) => {
      if (pin && d.personas.some((x) => x.pin === pin)) return false;
      if (d.personas.length >= 40) return false;
      d.personas.push({ id: rnd(6), nombre, rol, pin: rol === "repartidor" ? "" : pin, token: rol === "repartidor" ? rnd(16) : "", alta: new Date().toISOString() });
      return d;
    });
    return out ? json({ ok: true, personas: out.personas }) : json({ error: "Ese PIN ya está en uso" }, 400);
  }
  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    const out = await modificar(store, "lista", { personas: [] }, (d) => { d.personas = d.personas.filter((x) => x.id !== id); return d; });
    return json({ ok: true, personas: out.personas });
  }
  return json({ error: "Método no permitido" }, 405);
};
