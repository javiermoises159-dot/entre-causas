import handler from "../../src/equipo.mjs";
import { ruta } from "../../src/ruta.mjs";
export const onRequest = ruta(handler);
