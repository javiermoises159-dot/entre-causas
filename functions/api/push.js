import handler from "../../src/push.mjs";
import { ruta } from "../../src/ruta.mjs";
export const onRequest = ruta(handler);
