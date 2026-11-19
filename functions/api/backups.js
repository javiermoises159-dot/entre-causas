import handler from "../../src/backups.mjs";
import { ruta } from "../../src/ruta.mjs";
export const onRequest = ruta(handler);
