import { getStore, ENV } from "./store.mjs";
import { json, quien, txt, modificar, esDueno, hashPin } from "./comun.mjs";

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
  // Cambiar el PIN del dueño desde el panel: pide el actual y el nuevo (6 a 8 números, que no sea fácil ni de nadie del equipo)
  if (req.method === "POST" && url.searchParams.has("pindueno")) {
    let b; try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
    const actual = String(b.actual || ""), nuevo = String(b.nuevo || "");
    if (!(await esDueno(actual))) return json({ error: "El PIN actual no es correcto" }, 400);
    if (!/^\d{6,8}$/.test(nuevo)) return json({ error: "El PIN nuevo debe tener de 6 a 8 números" }, 400);
    const fac = /^(\d)\1+$/.test(nuevo) || "01234567890123456789".includes(nuevo) || "98765432109876543210".includes(nuevo) || /^(\d\d)\1+$/.test(nuevo) || /^(\d\d\d)\1+$/.test(nuevo);
    if (fac) return json({ error: "Ese PIN es muy fácil de adivinar. Elige otro." }, 400);
    if (nuevo === actual) return json({ error: "El PIN nuevo es igual al actual" }, 400);
    if ((await leer()).some((p) => p.pin === nuevo)) return json({ error: "Ese PIN ya lo usa alguien del equipo" }, 400);
    const salt = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");
    await getStore({ name: "entrecausas-seguridad", consistency: "strong" }).setJSON("pin-dueno", { h: await hashPin(salt, nuevo), salt, ts: new Date().toISOString() });
    return json({ ok: true });
  }
  if (req.method === "POST") {
    let b; try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
    const nombre = txt(b.nombre, 40).trim(), rol = ROLES.includes(b.rol) ? b.rol : "";
    const pin = String(b.pin || "").replace(/\D/g, "");
    if (!nombre || !rol) return json({ error: "Faltan datos" }, 400);
    if (rol !== "repartidor" && (pin.length < 4 || pin.length > 8)) return json({ error: "El PIN debe tener de 4 a 8 números" }, 400);
    if (pin && (await esDueno(pin))) return json({ error: "Ese PIN ya está en uso" }, 400);
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
    let borrada = null;
    const out = await modificar(store, "lista", { personas: [] }, (d) => { borrada = d.personas.find((x) => x.id === id) || null; d.personas = d.personas.filter((x) => x.id !== id); return d; });
    // sus móviles dejan de recibir avisos
    if (borrada) {
      try {
        await modificar(getStore({ name: "entrecausas-push", consistency: "strong" }), "subs", { lista: [] }, (x) => {
          x.lista = x.lista.filter((s) => !(s.pid === borrada.id || (!s.pid && s.rol === borrada.rol && String(s.nombre || "").startsWith(borrada.nombre + " · "))));
          return true;
        });
      } catch {}
    }
    return json({ ok: true, personas: out.personas });
  }
  return json({ error: "Método no permitido" }, 405);
};
