# EasyFood Web

Actualizado: 2026-11-07. Referencia: codigo del repositorio; las propuestas futuras se indican expresamente.

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
| `VITE_USE_FAKE_API` | `true` | Activa HTTP para productos/precios/margenes e ingredientes. En `false` esos servicios tienen fallback local; recetas, categorias y otros modulos siguen necesitando HTTP. No es un modo offline completo. |
| `VITE_FAKE_API_URL` | vacio | Permite apuntar productos e imagenes a otra base URL si no se usa la ruta relativa del mismo servidor Vite. |
| `VITE_IMAGE_BASE_URL` | vacio | Base URL explicita para servir imagenes. |
| `VITE_IMAGE_UPLOAD_URL` | vacio | URL explicita para subir imagenes. |
| `VITE_ORDER_PENDING_TIMEOUT_MINUTES` | `15` | Tiempo maximo para aprobar o rechazar un pago pendiente en ventas. |
| `DATA_ROOT` | vacio | Si se define, mueve `mock-api`, `images` y `receipts` a una raiz persistente externa al repo. |
| `VITE_RECEIPTS_DIR` / `RECEIPTS_DIR` | `mock-api/receipts` | Carpeta base para los recibos HTML generados. |
| `PORT` | `8080` en produccion | Puerto del servidor Node. Compose local publica `8080`; el Compose del NAS publica `3000`. |

## Persistencia y multiples bases

La base activa se registra en `mock-api/data-stores.json`. El archivo `db.js` de una base adicional contiene JSON, no codigo ejecutable. `DATA_ROOT` permite alojar los datos fuera del checkout; modificar los archivos del repositorio no actualiza un volumen Docker existente.

- Principal: `mock-api/db.json`, `images/`, `mock-api/receipts/`.
- Adicionales: `mock-api/data-stores/<id>/db.js`, `images/<id>/`, `mock-api/receipts/stores/<id>/`.
- Data / **DDBB**: crear, importar un respaldo completo, activar, descargar y limpiar bases. Crear o importar desde esta pestana activa la nueva base.
- Data / **Bloques de datos**: exportar Catalogo (rotulado Productos), Operaciones o Stock; combinar bloques de bases existentes y archivos completos o parciales; revisar y aplicar a una base nueva o existente.
- Aplicar bloques reemplaza cada bloque seleccionado y conserva los demas; no suma registros ni existencias. Conserva identificadores y rechaza referencias incompatibles. No cambia la base activa.
- Se guarda un respaldo previo al reemplazar bloques de una base existente. Los respaldos parciales nuevos pueden incluir imagenes y recibos; el backup completo antiguo de DDBB solo descarga el JSON de la base.
- El catalogo exportado excluye saldos, minimos y vencimientos de ingredientes. Esos valores viajan en Stock como `ingredientBalances`; no es una coleccion permanente de la DB.
- Crear una base vacia desde DDBB limpia tambien productos, ingredientes, recetas y combos: no significa conservar el catalogo. El reset mantiene usuarios, categorias, asignaciones de apertura y ajustes; no elimina automaticamente archivos de medios.

Detalle de entidades y reparto exacto de bloques: [Diccionario de datos](docs/data-dictionary.md).

## Ventas, recetas y carga de stock

- Ventas muestra el pedido a la izquierda y tarjetas agrupadas por categoria a la derecha. Seis columnas en escritorio, cuatro en anchos intermedios y dos en movil.
- Orden inicial de categorias: Combos, Hamburguesas, Panchos, Bebidas, Extras y restantes. `categories.order` es editable; los valores menores aparecen primero.
- El recorte de la palabra inicial Hamburguesa es visual y esta hardcodeado en Ventas. Panchos conserva el nombre completo. No se renombra el catalogo ni el detalle de la orden.
- Doble clic y + agregan la cantidad indicada sin perder seleccion, ingredientes ni opciones; - resta la configuracion seleccionada. Editar permite cambiar cantidad y opciones; guardar conserva la seleccion.
- Cada ingrediente de receta tiene `required`: sin configuracion se considera obligatorio; una receta de un solo ingrediente siempre es obligatoria. Solo los opcionales muestran casilla en Ventas. El servidor rechaza exclusiones obligatorias.
- Recetas por peso expresan gramos directos. `portionSizeGrams` sirve para mostrar porciones y como paso sugerido del editor, nunca como multiplicador del consumo.
- `/stock/ingredients`: filtros por nombre, categoria de ingrediente, unidad y peso. La categoria corresponde a materia prima, no a categorias comerciales; registros sin `categoryId` valido aparecen Sin categoria.
- La tabla muestra ingrediente, costo total de compra en ARS, vencimiento, cantidad, stock actual y porciones. No muestra selector de unidad: peso se ingresa en kg y se convierte a g; unidades/paquetes usan enteros. Un filtro activo se desactiva al pulsarlo otra vez.
- Porciones = parte entera de stock en gramos / gramos por porcion; sin configuracion aparece Sin configurar. Las unidades muestran un guion.
- El lote completo de ingresos se valida antes de aplicar cambios. Filtrar filas no elimina ingresos ya preparados: Guardar procesa todas las filas con cantidad.
- `stocks.purchaseTotal` es el costo total del ingreso, distinto de `costPrice`. Genera un egreso `stock-purchase` en la cuenta Gastos; no descuenta efectivo de caja. Los ingresos ligados a pedidos proveedor no duplican ese egreso.
- La orden pendiente no descuenta stock; el descuento ocurre al pagar. Volver desde el cobro cancela la orden pendiente y conserva el carrito para editar.
- `systemSettings.allowOutOfStockSales` regula el bloqueo por falta de stock. Se siguen validando recetas, opciones y obligatoriedad incluso si se permiten ventas sin existencias.

## Validacion

`npm run build` verifica TypeScript y genera cliente y servidor. `npm run test:e2e` ejecuta Playwright contra produccion y desarrollo, con raices de datos temporales independientes. Cubre sesion, API, respaldos por bloques, carga atomica, costos, kg/g, consumo, opciones y configuracion de categorias. `npm run lint` es un control separado; no equivale al build.

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

- [Diccionario de datos y propuesta de tablas](docs/data-dictionary.md)
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
