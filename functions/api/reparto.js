import handler from "../../src/reparto.mjs";
import { ruta } from "../../src/ruta.mjs";
export const onRequest = ruta(handler);
