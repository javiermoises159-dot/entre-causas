import handler from "../../src/regalos.mjs";
import { ruta } from "../../src/ruta.mjs";
export const onRequest = ruta(handler);
