import { getStore, ENV } from "./store.mjs";
import { json, pinOk } from "./comun.mjs";

// Menú de las mesas en PDF: lo sube el dueño desde el panel y lo abre el QR / NFC de las mesas ("/").
// El archivo va en KV (FOTOS) y sus datos (fecha, tamaño) en D1, para que "/" sepa si hay PDF sin leer el archivo.
const MAX = 20 * 1024 * 1024; // 20 MB
const KEY = "menu-mesas.pdf";
const info = () => getStore({ name: "entrecausas", consistency: "strong" });

export default async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.has("info")) return json((await info().get("menupdf", { type: "json" })) || { ok: false });
  if (req.method === "GET") {
    const r = await ENV.FOTOS.getWithMetadata(KEY, { type: "arrayBuffer" });
    if (!r || !r.value) return json({ error: "Todavía no hay menú en PDF" }, 404);
    return new Response(r.value, { headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="Menu-Entre-Causas.pdf"', // se abre en el navegador, no se descarga
      "cache-control": "public, max-age=300",
    } });
  }
  if (!(await pinOk(req, ["dueno"]))) return json({ error: "PIN incorrecto" }, 401);
  if (req.method === "POST") {
    const buf = await req.arrayBuffer();
    if (!buf.byteLength) return json({ error: "Falta el archivo" }, 400);
    if (buf.byteLength > MAX) return json({ error: "El PDF pesa demasiado (máximo 20 MB)" }, 413);
    if (buf.byteLength < 5 || String.fromCharCode(...new Uint8Array(buf, 0, 5)) !== "%PDF-") return json({ error: "Ese archivo no es un PDF" }, 400);
    await ENV.FOTOS.put(KEY, buf, { metadata: { type: "application/pdf" } });
    const d = { ok: true, ts: new Date().toISOString(), size: buf.byteLength, nombre: String(url.searchParams.get("nombre") || "").slice(0, 80) };
    await info().setJSON("menupdf", d);
    return json(d);
  }
  if (req.method === "DELETE") {
    await info().delete("menupdf"); // sin datos, "/" vuelve a mostrar la carta de la app
    return json({ ok: true });
  }
  return json({ error: "Método no permitido" }, 405);
};
