# EasyFood Web

EasyFood Web es el frontend React + TypeScript de una operacion comercial con ventas, caja, productos, stock, mercaderia, gastos, notificaciones y administracion. El repo incluye la UI y tambien una fake API compartida por Vite y el servidor Node de produccion, con persistencia en archivos, subida de imagenes, generacion de recibos HTML, libro financiero derivado y soporte de multiples bases.

## Stack

- React 19
- TypeScript 5.9
- Vite 7
- React Router 7
- CSS Modules
- Fake API REST en `server/api.ts`

## Modulos principales

- Login y control de sesion
- Menu operativo con alertas
- Ventas, resumen e impresion de recibos
- Autoventa para terminales
- Caja, cierre y auditoria administrativa
- Jornadas, balance y transacciones
- Productos, precios, finanzas y carga de stock
- Pedidos a proveedor y recepcion de mercaderia
- Solicitudes operativas y aprobacion administrativa
- Gastos, sugerencias/reclamos, licencias y notificaciones
- Administracion de bases de datos y ayuda funcional

## Ejecucion local

```bash
npm install
npm run dev
```

La app levanta por defecto en `http://localhost:5173`.

## Docker local y NAS (frontend y fake API)

La imagen construye el frontend y el servidor Node de produccion. Ambos se sirven desde el mismo puerto, incluyendo la fake API, imagenes, subidas y recibos. No necesita Nginx, Railway ni un contenedor `fake-api` separado; `nginx.conf` no se utiliza en esta imagen.

```bash
docker compose up -d --build
```

La interfaz queda disponible en `http://localhost:8080` y, desde otro equipo de la red local, en `http://IP_DEL_HOST:8080`.

Comandos habituales:

```bash
# Ver estado y logs
docker compose ps
docker compose logs -f

# Detener el contenedor
docker compose down

# Reconstruir luego de cambiar el codigo o una variable VITE_*
docker compose up -d --build

# Comprobar la respuesta HTTP localmente
curl http://localhost:8080
```

El servidor aplica el fallback SPA para las rutas de React Router. `/health` responde `OK`; `/products` y `/users` deben responder JSON, sin 404.

El volumen `easyfood-data` se monta en `/data` y conserva bases, imagenes y recibos al recrear el contenedor. La primera vez, la fake API copia los datos iniciales incluidos en la imagen; una reconstruccion no sobrescribe los datos persistidos. No uses `docker compose down -v` si quieres conservarlos. Haz copias de seguridad del volumen antes de actualizar.

Para cambiar el puerto del host, define `EASYFOOD_PORT=8080` en `.env`. Las URL de API e imagenes se construyen relativas al mismo servidor; no debes usar `localhost` ni el nombre Docker `fake-api` como URL del navegador. Las variables `VITE_*` se fijan al construir la imagen; cambiar el entorno del contenedor no recompila el frontend.

### Llevar la imagen al NAS sin compilar alli

```bash
# En el equipo local, despues de construir
docker save -o easyfood-web.tar easyfood-web:latest

# Copiar easyfood-web.tar y docker-compose.nas.yml al NAS; ejecutar alli
docker load -i easyfood-web.tar
docker compose -f docker-compose.nas.yml up -d
docker compose -f docker-compose.nas.yml ps
curl http://localhost:3000/health
curl http://localhost:3000/products
```

Abre `http://IP_DEL_NAS:3000`. La imagen exportada debe corresponder a la arquitectura del NAS. Para un NAS ARM64, construye primero con `docker buildx build --platform linux/arm64 --load -t easyfood-web:latest .`; para x86-64 utiliza `linux/amd64`. Tambien puedes copiar el proyecto al NAS y ejecutar `docker compose up -d --build` para construir en su arquitectura.

La exportacion de la imagen incluye los datos iniciales del proyecto, pero no el volumen de un contenedor ya usado. Para migrar datos posteriores, respalda y restaura todo el contenido de `/data` en el volumen del NAS con la aplicacion detenida. Un directorio del NAS montado manualmente en `/data` debe permitir escritura al usuario `node` (UID/GID 1000).

### Variables de build

`docker-compose.yml` recibe las variables `VITE_*` desde el entorno o desde el archivo `.env` del proyecto. Se incorporan al JavaScript durante el build, asi que nunca deben contener secretos. Para cambiar una variable, actualiza `.env` o expórtala antes de reconstruir la imagen.

Compose permite configurar `VITE_USE_FAKE_API` y `VITE_ORDER_PENDING_TIMEOUT_MINUTES`. La imagen fija las URL de API e imagenes al mismo origen para funcionar con la IP local o la del NAS.

## Login demo

- La pantalla de login arranca en desarrollo con `admin / 1234` precargado.
- La autenticacion es de demo: consulta `GET /users` y compara el password hasheado con MD5 desde el frontend.
- Los roles actuales son `admin`, `operator` y `terminal`.
- El rol `terminal` entra al flujo de autoventa y tiene ocultos los modulos operativos y administrativos generales.

## Variables de entorno relevantes

| Variable | Default | Uso |
| --- | --- | --- |
| `VITE_USE_FAKE_API` | `true` | Cuando esta en `true`, el dominio de productos/precios/margenes usa HTTP contra el mock backend. Cuando esta en `false`, solo ese dominio cae a `localStorage`; el resto de modulos sigue usando endpoints HTTP relativos. |
| `VITE_FAKE_API_URL` | vacio | Permite apuntar productos e imagenes a otra base URL si no se usa la ruta relativa del mismo servidor Vite. |
| `VITE_IMAGE_BASE_URL` | vacio | Base URL explicita para servir imagenes. |
| `VITE_IMAGE_UPLOAD_URL` | vacio | URL explicita para subir imagenes. |
| `VITE_ORDER_PENDING_TIMEOUT_MINUTES` | `15` | Tiempo maximo para aprobar o rechazar un pago pendiente en ventas. |
| `DATA_ROOT` | vacio | Si se define, mueve `mock-api`, `images` y `receipts` a una raiz persistente externa al repo. |
| `VITE_RECEIPTS_DIR` / `RECEIPTS_DIR` | `mock-api/receipts` | Carpeta base para los recibos HTML generados. |
| `PORT` | `8080` en produccion | Puerto del servidor Node; Docker publica `3000` por defecto en el host. |

## Persistencia y multiples bases

- La base activa se define en `mock-api/data-stores.json`.
- La base principal usa los paths del repo: `mock-api/db.json`, `images/` y `mock-api/receipts/`.
- Las bases adicionales viven en:
  - `mock-api/data-stores/<id>/db.js`
  - `images/<id>/`
  - `mock-api/receipts/stores/<id>/`
- La pantalla `Data` permite:
  - crear una nueva base
  - cambiar la base activa
  - limpiar la base activa
- Al crear una base nueva se copian usuarios y configuraciones de la base activa, pero sin datos operativos.
- Al limpiar una base activa se vacian colecciones operativas como productos, stock, ventas, pedidos, gastos, feedback, licencias, notificaciones y libro financiero derivado. Se conservan usuarios, asignaciones de apertura y configuraciones globales.

## Backend mock incluido

La fake API vive en `server/api.ts`. Vite la monta en desarrollo y `server/index.ts` la monta en produccion dentro de la misma imagen. Expone, entre otros:

- CRUD de productos, precios, margenes, usuarios y licencias
- Ventas, facturas, recibos y stock
- Caja, jornadas y asignaciones de apertura
- Pedidos a proveedor, recepcion y solicitudes operativas
- Gastos, feedback y notificaciones
- Cuentas y transacciones financieras derivadas
- Administracion de bases (`/admin/data/*`)

## Archivos y medios

- Las imagenes suben por `POST /uploads/images` y se sirven por `GET /images/:filename`.
- Los recibos de venta se generan por `POST /receipts` y se guardan como HTML en la carpeta de recibos de la base activa.
- El frontend resuelve rutas de imagen con `src/shared/image/image.service.ts`.

## Estructura general

```text
src/
  app/
    component/
    provider/
    router/
  feature/
    <feature>/
      model/
      service/
      view/
      viewmodel/   # solo donde hace falta
      component/   # componentes reutilizables por feature
  shared/
    format/
    http/
    image/
    product/
    search/
mock-api/
docs/
```

## Documentacion del repo

- `docs/architecture-mvvm.md`
- `docs/backend-integration.md`
- `docs/backend-services-db-operations.md`
- `docs/notification-test-cases.md`
- `docs/notification-channels-roadmap.md`
- `docs/functional-flows-by-module.md`

## Notas operativas

### Scanner en Chrome

Si la pistola de scanner dispara `Ctrl+J` y Chrome abre `chrome://downloads/`, la salida practica sigue siendo bloquear ese atajo con AutoHotkey solo para Chrome.

Script recomendado:

```ahk
#Requires AutoHotkey v2.0
#SingleInstance Force

#HotIf WinActive("ahk_exe chrome.exe")
^j::return
#HotIf
```

### Demo o stage con datos persistentes

Para demos o validaciones rapidas se puede montar `DATA_ROOT` en un volumen persistente y dejar base activa, imagenes y recibos fuera del repo. Eso sirve para stage, pero no reemplaza una arquitectura separada de frontend y backend para produccion.
