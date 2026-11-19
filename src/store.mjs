// Almacenamiento en Cloudflare: imita la API de Netlify Blobs (getStore) sobre D1.
// Las fotos (binarias) van a KV. ENV se fija en cada petición desde functions/.
export const ENV = {};
export const setEnv = (env) => Object.assign(ENV, env);

const nuevaEtag = () => crypto.randomUUID();
const enc = new TextEncoder(), dec = new TextDecoder();

export function getStore({ name }) {
  if (name === "entrecausas-fotos") return fotos();
  const db = () => ENV.DB;
  const leer = (key) => db().prepare("SELECT v, etag, meta FROM blobs WHERE s = ? AND k = ?").bind(name, key).first();
  return {
    async get(key, o = {}) {
      const r = await leer(key);
      if (!r) return null;
      return o.type === "json" ? JSON.parse(r.v) : r.v;
    },
    async getWithMetadata(key, o = {}) {
      const r = await leer(key);
      if (!r) return null;
      return { data: o.type === "json" ? JSON.parse(r.v) : r.v, etag: r.etag, metadata: r.meta ? JSON.parse(r.meta) : {} };
    },
    async setJSON(key, data, o = {}) {
      const v = JSON.stringify(data), e = nuevaEtag();
      let res;
      if (o.onlyIfMatch) res = await db().prepare("UPDATE blobs SET v = ?, etag = ? WHERE s = ? AND k = ? AND etag = ?").bind(v, e, name, key, o.onlyIfMatch).run();
      else if (o.onlyIfNew) res = await db().prepare("INSERT OR IGNORE INTO blobs (s, k, v, etag) VALUES (?, ?, ?, ?)").bind(name, key, v, e).run();
      else res = await db().prepare("INSERT INTO blobs (s, k, v, etag) VALUES (?, ?, ?, ?) ON CONFLICT (s, k) DO UPDATE SET v = excluded.v, etag = excluded.etag").bind(name, key, v, e).run();
      return { modified: (res.meta?.changes || 0) > 0, etag: e };
    },
    async delete(key) { await db().prepare("DELETE FROM blobs WHERE s = ? AND k = ?").bind(name, key).run(); },
    async list({ prefix = "" } = {}) {
      const { results } = await db().prepare("SELECT k FROM blobs WHERE s = ? AND substr(k, 1, ?) = ?").bind(name, prefix.length, prefix).all();
      return { blobs: results.map((r) => ({ key: r.k })) };
    },
  };
}

function fotos() {
  const kv = () => ENV.FOTOS;
  return {
    async getWithMetadata(key) {
      const r = await kv().getWithMetadata(key, { type: "arrayBuffer" });
      return r && r.value ? { data: r.value, metadata: r.metadata || {} } : null;
    },
    async set(key, buf, o = {}) { await kv().put(key, buf, { metadata: o.metadata || {} }); return { modified: true }; },
  };
}
