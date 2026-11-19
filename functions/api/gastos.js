import handler from "../../src/gastos.mjs";
import { ruta } from "../../src/ruta.mjs";
export const onRequest = ruta(handler);
