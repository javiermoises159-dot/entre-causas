import handler from "../../src/menupdf.mjs";
import { ruta } from "../../src/ruta.mjs";
export const onRequest = ruta(handler);
