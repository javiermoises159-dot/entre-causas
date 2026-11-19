# Entre Causas · App de pedidos y reservas + Panel del local

Proyecto independiente: Cloudflare Pages + Functions + base de datos D1 y fotos en KV propias.

- `public/index.html` → app de clientes (Inicio, Carta, Reservar, Perfil · ES/IT/EN)
- `public/admin.html` → panel del dueño (PIN = variable secreta `ADMIN_PIN`)
- `public/menu.json` → carta inicial (se usa hasta el primer "Guardar" del panel)
- `functions/api/` → rutas /api/… · `src/` → lógica del servidor (datos en D1, fotos en KV)

## Puesta en marcha (Cloudflare)
1. Workers & Pages → Create → Pages → conectar el repo `entre-causas` (rama `main`, sin build, carpeta `public`).
2. Crear base D1 `entrecausas` y ejecutar `schema.sql`; crear KV `FOTOS`.
3. En el proyecto → Settings → Bindings: D1 `DB` y KV `FOTOS`. Variables: `ADMIN_PIN`.
4. Dominio: cuando `entrecausas.app` esté pagado, Custom domains → añadirlo.

## Pendiente (fase 2)
- Reservas guardadas en el servidor y visibles en el panel.
- Pedidos y reservas sin salir de la app + pantalla de estado para el cliente.
- Notificaciones push al panel (Android, PC, iPhone) y APK del panel.
