import handler from "../../src/menu.mjs";
import { setEnv } from "../../src/store.mjs";
export const onRequest = (ctx) => { setEnv(ctx.env); return handler(ctx.request); };
