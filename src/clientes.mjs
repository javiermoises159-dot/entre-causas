import { getStore } from "./store.mjs";
import { json, pinOk, modificar, txt } from "./comun.mjs";

// Clientes que pidieron por la app con su teléfono (para fidelidad y promociones)
export default async (req) => {
  if (!(await pinOk(req))) return json({ error: "PIN incorrecto" }, 401);
  const store = getStore({ name: "entrecausas-clientes", consistency: "strong" });

  if (req.method === "GET") {
    const d = await store.get("todos", { type: "json" });
    return json({ clientes: Object.values(d?.lista || {}) });
  }

  // Guardar una nota del cliente (ej: "timbre roto, llamar")
  if (req.method === "PATCH") {
    let b; try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
    const out = await modificar(store, "todos", { lista: {} }, (d) => {
      const k = Object.keys(d.lista).find((k) => k === b.tel || d.lista[k].tel === b.tel);
      if (!k) return false;
      d.lista[k].nota = txt(b.nota, 200).trim();
      return d.lista[k];
    });
    return out ? json({ ok: true, cliente: out }) : json({ error: "No encontrado" }, 404);
  }

  // Borrar un cliente (si lo pide, por privacidad)
  if (req.method === "DELETE") {
    const tel = new URL(req.url).searchParams.get("tel") || "";
    const ok = await modificar(store, "todos", { lista: {} }, (d) => {
      const k = Object.keys(d.lista).find((k) => k === tel || d.lista[k].tel === tel);
      if (!k) return false;
      delete d.lista[k];
      return true;
    });
    return ok ? json({ ok: true }) : json({ error: "No encontrado" }, 404);
  }

  return json({ error: "Método no permitido" }, 405);
};

