import { getStore } from "./store.mjs";
import { pinOk } from "./comun.mjs";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });

const MAX = 4 * 1024 * 1024; // 4 MB

export default async (req) => {
  const store = getStore({ name: "entrecausas-fotos", consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "Falta id" }, 400);
    const entry = await store.getWithMetadata(id, { type: "arrayBuffer" });
    if (entry === null) return new Response("No encontrada", { status: 404 });
    return new Response(entry.data, {
      headers: {
        "content-type": entry.metadata?.type || "image/jpeg",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  }

  if (req.method === "POST") {
    if (!(await pinOk(req))) return json({ error: "PIN incorrecto" }, 401);
    const type = req.headers.get("content-type") || "image/jpeg";
    if (!type.startsWith("image/")) return json({ error: "Solo imágenes" }, 400);
    const buf = await req.arrayBuffer();
    if (buf.byteLength > MAX) return json({ error: "La foto pesa demasiado" }, 413);
    const id = crypto.randomUUID() + ".jpg";
    await store.set(id, buf, { metadata: { type } });
    return json({ id, url: "/api/foto?id=" + id });
  }

  return json({ error: "Método no permitido" }, 405);
};

