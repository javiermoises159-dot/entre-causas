import { getStore } from "./store.mjs";
import { json, pinOk, modificar, txt } from "./comun.mjs";

// Clientes que pidieron por la app con su teléfono (para fidelidad y promociones)
// Un registro por cliente ("c/<teléfono>"), para que la base no tenga un registro gigante
export function claveTel(t) {
  let d = String(t || "").replace(/\D/g, "");
  if (d.startsWith("0039")) d = d.slice(4);
  else if (d.length >= 11 && d.startsWith("39")) d = d.slice(2);
  return d.length >= 8 ? d : "";
}
export default async (req) => {
  const store = getStore({ name: "entrecausas-clientes", consistency: "strong" });
  // ---- Cliente: registro desde la app (nombre, teléfono, cumpleaños, permiso de promos) ----
  if (req.method === "POST" && new URL(req.url).searchParams.has("registro")) {
    let b; try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
    const tel = txt(String(b.tel || "").replace(/[^\d+]/g, ""), 20), k = claveTel(tel), nombre = txt(b.nombre, 60).trim();
    if (!k || !nombre) return json({ error: "Faltan nombre o teléfono" }, 400);
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
    await modificar(store, "c/" + k, { tel, nombre: "", n: 0, total: 0, primero: hoy }, (c) => {
      c.tel = tel; c.nombre = nombre; c.promos = b.promos === true; c.registro = c.registro || hoy;
      c.lang = ["it", "en"].includes(b.lang) ? b.lang : "es";
      if (/^\d\d-\d\d$/.test(String(b.cumple || ""))) c.cumple = b.cumple;
      return true;
    });
    return json({ ok: true });
  }
  if (!(await pinOk(req, req.method === "GET" ? ["dueno", "camarero"] : ["dueno"]))) return json({ error: "PIN incorrecto" }, 401);

  if (req.method === "GET") {
    return json({ clientes: await store.values("c/") });
  }

  // Guardar una nota del cliente (ej: "timbre roto, llamar")
  if (req.method === "PATCH") {
    let b; try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
    const k = claveTel(b.tel);
    if (!k || !(await store.get("c/" + k, { type: "json" }))) return json({ error: "No encontrado" }, 404);
    const out = await modificar(store, "c/" + k, {}, (c) => { c.nota = txt(b.nota, 200).trim(); return c; });
    return out ? json({ ok: true, cliente: out }) : json({ error: "No encontrado" }, 404);
  }

  // Borrar un cliente (si lo pide, por privacidad)
  if (req.method === "DELETE") {
    const tel = new URL(req.url).searchParams.get("tel") || "";
    const k = claveTel(tel), ok = k && (await store.get("c/" + k, { type: "json" }));
    if (ok) await store.delete("c/" + k);
    return ok ? json({ ok: true }) : json({ error: "No encontrado" }, 404);
  }

  return json({ error: "Método no permitido" }, 405);
};

