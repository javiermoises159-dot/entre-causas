import handler from "../../src/sala.mjs";
import { ruta } from "../../src/ruta.mjs";
export const onRequest = ruta(handler);
