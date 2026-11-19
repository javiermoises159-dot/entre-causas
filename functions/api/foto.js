import handler from "../../src/foto.mjs";
import { ruta } from "../../src/ruta.mjs";
export const onRequest = ruta(handler);
