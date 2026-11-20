# Entre Causas · App de pedidos y reservas + Panel del local

Proyecto independiente: Cloudflare Pages + Functions + base de datos D1 y fotos en KV propias.

- `public/index.html` → app de clientes (app completa en `/`, carta de las mesas en `/mesa` · ES/IT/EN)
- `public/admin.html` → panel del dueño (PIN = variable secreta `ADMIN_PIN`)
- `public/menu.json` → carta inicial (se usa hasta el primer "Guardar" del panel)
- `functions/api/` → rutas /api/… · `src/` → lógica del servidor (datos en D1, fotos en KV)

## Puesta en marcha (Cloudflare)
1. Workers & Pages → Create → Pages → conectar el repo `entre-causas` (rama `main`, sin build, carpeta `public`).
2. Crear base D1 `entrecausas` y ejecutar `schema.sql`; crear KV `FOTOS`.
3. En el proyecto → Settings → Bindings: D1 `DB` y KV `FOTOS`. Variables: `ADMIN_PIN`.
4. Dominio: la app va en el dominio del local, `www.entrecausasrestaurant.com` (Aruba).
   - Primero en Cloudflare: proyecto → Custom domains → `www.entrecausasrestaurant.com`.
   - Después en Aruba → Gestione DNS: borrar el registro `www` y crear un CNAME `www` → `entre-causas.pages.dev` (no tocar los MX del correo).
   - `entre-causas.pages.dev` sigue funcionando: las APK del equipo (panel, cocina, palmare) usan esa dirección.

## Direcciones
- `/mesa` → **menú de las mesas** (es lo que abre el QR / NFC de los posavasos): el PDF que el dueño sube en el panel (Más → 📄 Menú de las mesas). Si no hay PDF, muestra la carta de la app sin pedidos.
- `/api/menupdf` → el PDF (se abre en el navegador, no se descarga).
- `/` → la app completa: pedidos a domicilio, retiro, reservas, perfil. `/pedir` sigue funcionando igual (links antiguos de WhatsApp y campañas).
- `/admin`, `/cocina`, `/palmare`, `/reparto.html?k=…` → equipo.

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

## Fase 3 · panel completo

- **Equipo** (Más → Equipo y accesos): PIN propio para cocina y camareros. La cocina solo ve el modo cocina y el camarero ve Ahora y Reservas. El repartidor no tiene PIN: recibe un link personal (`/reparto.html?k=…`).
- **Repartidor**: se asigna desde el pedido (botón 🛵). Él toca "Salgo" (el cliente ve "En camino") y luego "Entregado".
- **Mesa**: con el QR `/?mesa=N`, el cliente puede llamar al camarero o pedir la cuenta. Suena en el panel y la mesa sale en dorado en el plano.
- **Stock del día**: se pone en cada plato ("Stock diario"). Cuando llega a 0 el plato sale agotado, y cada mañana vuelve a empezar.
- **Tarjetas regalo**: desde Ahora → 🎁 Regalo se buscan por código, se cobran (cuenta − saldo) y el dueño vende tarjetas nuevas.
- No hace falta configurar nada más en Cloudflare: todo se guarda en la misma base D1.
