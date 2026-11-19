import { getStore } from "./store.mjs";
import { json, pinOk, fechaRoma, esFecha, txt, num, modificar } from "./comun.mjs";

const CATS = ["Insumos", "Sueldos", "Alquiler", "Servicios", "Delivery", "Publicidad", "Impuestos", "Otros"];
function meses(desde, hasta) {
  const out = [];
  let [y, m] = desde.slice(0, 7).split("-").map(Number);
  const [y2, m2] = hasta.slice(0, 7).split("-").map(Number);
  while ((y < y2 || (y === y2 && m <= m2)) && out.length < 36) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

export default async (req) => {
  if (!(await pinOk(req, ["dueno"]))) return json({ error: "PIN incorrecto" }, 401);
  const store = getStore({ name: "entrecausas-cuentas", consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const desde = esFecha(url.searchParams.get("desde")) ? url.searchParams.get("desde") : fechaRoma().slice(0, 8) + "01";
    const hasta = esFecha(url.searchParams.get("hasta")) ? url.searchParams.get("hasta") : fechaRoma();
    const docs = await Promise.all(meses(desde, hasta).map((m) => store.get("gastos/" + m, { type: "json" })));
    const gastos = [];
    docs.forEach((d) => d && gastos.push(...d.gastos.filter((g) => g.fecha >= desde && g.fecha <= hasta)));
    return json({ desde, hasta, gastos, categorias: CATS });
  }

  if (req.method === "POST") {
    let b; try { b = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
    const fecha = esFecha(b.fecha) ? b.fecha : fechaRoma();
    const monto = num(b.monto);
    if (!(monto > 0)) return json({ error: "Monto inválido" }, 400);
    const g = { id: Math.random().toString(36).slice(2, 9), fecha, concepto: txt(b.concepto, 80) || "Gasto",
      cat: CATS.includes(b.cat) ? b.cat : "Otros", monto, pago: b.pago === "Tarjeta" ? "Tarjeta" : "Efectivo" };
    await modificar(store, "gastos/" + fecha.slice(0, 7), { gastos: [] }, (d) => { d.gastos.push(g); return true; });
    return json({ ok: true, gasto: g });
  }

  if (req.method === "DELETE") {
    const fecha = url.searchParams.get("fecha"), id = url.searchParams.get("id");
    if (!esFecha(fecha) || !id) return json({ error: "Faltan datos" }, 400);
    const ok = await modificar(store, "gastos/" + fecha.slice(0, 7), { gastos: [] }, (d) => {
      const n = d.gastos.length; d.gastos = d.gastos.filter((g) => g.id !== id); return d.gastos.length < n ? true : false;
    });
    return ok ? json({ ok: true }) : json({ error: "No encontrado" }, 404);
  }

  return json({ error: "Método no permitido" }, 405);
};

