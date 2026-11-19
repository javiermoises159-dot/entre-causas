import handler from "../../src/clientes.mjs";
import { ruta } from "../../src/ruta.mjs";
export const onRequest = ruta(handler);
