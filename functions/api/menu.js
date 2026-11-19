import handler from "../../src/menu.mjs";
import { ruta } from "../../src/ruta.mjs";
export const onRequest = ruta(handler);
