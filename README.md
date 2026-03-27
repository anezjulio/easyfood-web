# EasyCommerce Web

EasyCommerce Web es el frontend React + TypeScript de una operacion comercial con ventas, caja, productos, stock, mercaderia, gastos, notificaciones y administracion. El repo incluye la UI y tambien un mock backend montado dentro de `vite.config.ts`, con persistencia en archivos, subida de imagenes, generacion de recibos HTML, libro financiero derivado y soporte de multiples bases.

## Stack

- React 19
- TypeScript 5.9
- Vite 7
- React Router 7
- CSS Modules
- Mock REST backend embebido en Vite

## Modulos principales

- Login y control de sesion
- Menu operativo con alertas
- Ventas, resumen e impresion de recibos
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

## Login demo

- La pantalla de login arranca en desarrollo con `admin / 1234` precargado.
- La autenticacion es de demo: consulta `GET /users` y compara el password hasheado con MD5 desde el frontend.
- Los roles actuales son `admin` y `operator`.

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
| `PORT` | `5173` en dev / `4173` en preview | Puerto de Vite. |

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

El backend real de desarrollo vive en `vite.config.ts` y no en un servicio aparte. Desde ahi se exponen, entre otros:

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
