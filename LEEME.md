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

## Qué hace (fase 2)
- **Pedidos y reservas dentro de la app**: se guardan en el servidor y el cliente ve el estado (recibido → en cocina → en camino / listo → entregado; reserva por confirmar → confirmada). Si el servidor falla, la app cae a WhatsApp como respaldo.
- **Reservas** (`/api/reservas`): -20% lun–jue solo en la primera reserva de cada teléfono (se controla en el servidor). Pestaña 📅 Reservas en el panel con ocupación sobre 32 plazas, confirmar / rechazar / recordar por WhatsApp con un toque, "llegó" y "no vino".
- **Avisos push** (`/api/push`, `public/sw-admin.js`): en el panel → Pedidos → "Activar avisos". Funciona en Android (Chrome), PC (Chrome/Edge) e iPhone (iOS 16.4+, instalando el panel con Compartir → Añadir a inicio). Las claves VAPID se crean solas la primera vez.
- **Registro de clientes** (`/api/clientes?registro`): nombre, teléfono, cumpleaños y permiso de promos.
- **Mesas (QR)**: `/?mesa=5` → el pedido llega al panel como "MESA 5".

## APK del panel para Android
1. Entra en https://www.pwabuilder.com y pega `https://<tu-dominio>/admin.html`.
2. Package for stores → Android → Generate → descarga el `.apk` (o `.aab` para Play Store).
3. Instálalo en el móvil del dueño, entra con el PIN y toca "Activar avisos".
