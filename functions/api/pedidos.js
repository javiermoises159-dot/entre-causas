import handler from "../../src/pedidos.mjs";
import { ruta } from "../../src/ruta.mjs";
export const onRequest = ruta(handler);
