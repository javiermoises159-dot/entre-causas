import handler from "../../src/reservas.mjs";
import { ruta } from "../../src/ruta.mjs";
export const onRequest = ruta(handler);
