import handler from "../../src/stock.mjs";
import { ruta } from "../../src/ruta.mjs";
export const onRequest = ruta(handler);
