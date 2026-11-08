# Integracion backend: pantallas, servicios y endpoints

Actualizado: 2026-11-07. Referencia: codigo del repositorio; las propuestas futuras se indican expresamente.

## Contexto actual

- La UI consume endpoints REST con `fetch`.
- El backend mock esta implementado en `server/api.ts` y se monta en Vite/dev, preview y produccion local.
- El patron comun en frontend es `service/*.api.ts` + `readJsonOrThrow`.
- Productos/precios/margenes e ingredientes incluyen fallback local con `VITE_USE_FAKE_API=false`; recetas y categorias actuales requieren HTTP.
- El resto de los modulos siempre usa rutas HTTP relativas.

## Rutas y consumo actual por modulo

### Acceso y shell

- `/login`
  - Servicios: `auth.fake.ts`, `user.api.ts`
  - Endpoints: `GET /users`
  - Notas: autenticacion demo. El frontend compara MD5 del password contra usuarios existentes.

- `/operation`
  - Servicios: `notification.api.ts` para alertas visibles en el menu
  - Endpoints: `GET /notifications`
  - Notas: no hace mutaciones; actua como hub operativo y administrativo.

- `/help`
  - Servicios: no consume backend
  - Endpoints: ninguno
  - Notas: el contenido sale de `help.content.ts`.

### Productos, precios y configuracion comercial

- `/products/new`
  - Servicios: `product.api.ts`
  - Endpoints:
    - `GET /products`
    - `POST /products`
    - `PUT /products/:id`
    - `DELETE /products/:id`
    - `POST /delete-requests`
    - `GET /product-prices`
    - `POST /product-prices`
    - `GET /price-margin-settings`
    - `PUT /price-margin-settings/category/:category`
    - `PUT /price-margin-settings/product/:productId`
    - `DELETE /price-margin-settings/product/:productId`
    - `POST /uploads/images`
  - Notas: admin elimina directo; operador genera solicitud de baja. Permite imagen, codigo de barras, precio/costo y margenes.

- `/prices`
  - Servicios: `product.api.ts`
  - Endpoints:
    - `GET /products`
    - `GET /product-prices`
    - `POST /product-prices`
    - `GET /price-margin-settings`
    - `PUT /price-margin-settings/category/:category`
    - `PUT /price-margin-settings/product/:productId`
    - `DELETE /price-margin-settings/product/:productId`
  - Notas: mezcla actualizacion de costo/venta con historial de cambios y overrides de margen.

- `/finances`
  - Servicios: `product.api.ts`, `sale.api.ts`
  - Endpoints:
    - `GET /price-margin-settings`
    - `PUT /price-margin-settings/category/:category`
    - `PUT /price-margin-settings/product/:productId`
    - `DELETE /price-margin-settings/product/:productId`
    - `GET /payment-method-settings`
    - `PUT /payment-method-settings/:method`
    - `GET /tax-settings`
    - `PUT /tax-settings`
  - Notas: es configuracion comercial/fiscal. Solo admin.

### Menu y categorias

- `/menu-products` (tambien `/crear-menu` y `/menu-products/manage`): `menu.api.ts` lee `GET /products`, `GET /recipes`, `GET /combos`, `GET /ingredients`; la gestion de categorias usa `GET/POST /categories` y `PUT/DELETE /categories/:id`.
- Crear/editar un menu escribe primero metadatos en `/products` si cambiaron, y su composicion en `/recipes` o `/combos`. No es una unica transaccion HTTP. Cambiar solamente obligatoriedad o cantidades no actualiza el precio.
- `recipes.ingredients[]`: `ingredientId`, `quantity` y `required`. Para peso, quantity siempre son gramos. La receta de un unico ingrediente obliga `required=true`.
- `categories.order` determina la ubicacion en Ventas; menor valor aparece primero. `ingredientCategories` pertenece a materia prima y no ordena las categorias comerciales.
- Los endpoints `/menu-products` y `/menu-categories` todavia existen por compatibilidad; ya no son la fuente que usa `menu.api.ts` para el CRUD actual.

### Usuarios, stock y ventas

- `/users`
  - Servicios: `user.api.ts`
  - Endpoints:
    - `GET /users`
    - `POST /users`
    - `PUT /users/:id`
    - `DELETE /users/:id`
  - Notas: alta, edicion y baja de usuarios con notificaciones automaticas.

- `/stock`
  - Servicios: `product.api.ts`, `stock.api.ts`, `supply.api.ts`
  - Endpoints:
    - `GET /products`
    - `POST /products`
    - `GET /price-margin-settings`
    - `PUT /price-margin-settings/category/:category`
    - `PUT /price-margin-settings/product/:productId`
    - `GET /stocks`
    - `POST /stocks`
    - `GET /supply-orders`
  - Notas: permite cargar stock sobre producto existente o crear producto nuevo e ingreso en el mismo flujo.

- `/sales`
  - Servicios: `product.api.ts`, `menu.api.ts`, `ingredient.api.ts`, `system.api.ts`, `sale.api.ts`, `cash.api.ts`
  - Endpoints:
    - `GET /products`
    - `GET /payment-method-settings`
    - `GET /tax-settings`
    - `GET /workdays/current`
    - `POST /orders`
    - `GET /orders`
    - `PUT /orders/:id/status`
    - `POST /invoices`
    - `POST /workdays/current/add-order`
  - Tambien lee `/recipes`, `/combos`, `/categories`, `/ingredients` y `/system-settings` para construir menu, opciones y disponibilidad.
  - Notas: requiere caja abierta. El servidor aplica el consumo al marcar pagada; el cliente solicita factura y asociacion a jornada por separado. `OrderItem.excludedIngredients` guarda producto, ingrediente y nombre. Solo se permite excluir ingredientes opcionales.

- `/sales/summary`
  - Servicios: `sale.api.ts`
  - Endpoints:
    - `POST /receipts`
  - Notas: genera HTML imprimible y guarda el recibo en el filesystem de la base activa.

- `/stock/ingredients`: `GET /ingredients`, `GET /ingredient-categories`, `POST /ingredient-stock-entries`. Cada entrada lleva `ingredientId`, `quantity`, `metric`, `expirationDate` y `purchaseTotal`. La UI manda kilos para peso y unit para unidades/paquetes. Valida el lote antes de modificar stock.
- `/ingredients`: CRUD `/ingredients` y `/ingredient-categories`. Define modalidad, categoria de materia prima, gramos por porcion y datos de conservacion.
- `/inventory`: consulta ingredientes/minimos y conserva un flujo anterior de ingreso con dos peticiones (`POST /stocks` y `PUT /ingredients/:id`). Preferir el ingreso atomico por lote.
- `/system`: `GET/PUT /system-settings`, administra `allowOutOfStockSales`.

### Caja, jornadas, balance y libro financiero

- `/cash`
  - Servicios: `cash.api.ts`, `cash.operation.ts`, `user.api.ts`, `expense.api.ts`, `sale.api.ts`, `supply.api.ts`
  - Endpoints:
    - `GET /workdays`
    - `GET /workdays/current`
    - `POST /workdays/open`
    - `PUT /workdays/:id/request-close`
    - `PUT /workdays/:id/admin-close`
    - `PUT /workdays/:id/close`
    - `GET /cash-opening-assignments`
    - `PUT /cash-opening-assignments/:operator`
    - `GET /orders`
    - `GET /expenses`
    - `GET /supply-orders`
    - `GET /users`
  - Notas: mezcla apertura operativa, solicitud de cierre, auditoria admin y gestion de asignaciones de apertura.

- `/workdays`
  - Servicios: `cash.api.ts`, `sale.api.ts`
  - Endpoints:
    - `GET /workdays`
    - `GET /orders`
  - Notas: historial de jornadas y ordenes ligadas a cada una. Solo admin.

- `/balance` y `/reports`
  - Servicios: `cash.api.ts`, `sale.api.ts`, `expense.api.ts`, `supply.api.ts`, `transaction.api.ts`
  - Endpoints:
    - `GET /workdays`
    - `GET /orders`
    - `GET /expenses`
    - `GET /supply-orders`
    - `GET /financial-accounts`
    - `GET /financial-transactions`
  - Notas: el alias `/reports` redirige a `/balance`.

- `/transactions`
  - Servicios: `transaction.api.ts`
  - Endpoints:
    - `GET /financial-accounts`
    - `GET /financial-transactions`
  - Notas: lectura pura del libro financiero derivado. Solo admin.

### Mercaderia, solicitudes y gastos

- `/supplies/orders`
  - Servicios: `supply.api.ts`, `product.api.ts`
  - Endpoints:
    - `GET /supply-orders`
    - `POST /supply-orders`
    - `PUT /supply-orders/:id`
    - `DELETE /supply-orders/:id`
    - `GET /products`
    - `POST /products`
  - Notas: admin puede generar pedidos con items de catalogo o crear producto inline. Operadores consumen el listado.

- `/supplies/receiving`
  - Servicios: `supply.api.ts`
  - Endpoints:
    - `GET /supply-orders`
    - `PUT /supply-orders/:id/receive`
    - `POST /uploads/images`
  - Notas: la recepcion exige imagen de factura y puede registrar faltantes por item.

- `/requests`
  - Servicios: `request.api.ts`, `product.api.ts`
  - Endpoints:
    - `GET /operation-requests`
    - `POST /operation-requests`
    - `PUT /operation-requests/:id`
    - `DELETE /operation-requests/:id`
    - `GET /products`
  - Notas: soporta solicitudes de mercaderia con items y solicitudes de permisos solo descriptivas.

- `/requests/approvals`
  - Servicios: `request.api.ts`, `supply.api.ts`
  - Endpoints:
    - `GET /operation-requests`
    - `PUT /operation-requests/:id/status`
    - `GET /supply-orders`
    - `POST /supply-orders`
  - Notas: admin puede editar items de una solicitud de mercaderia antes de aprobarla y generar pedido a proveedor asociado.

- `/expenses`
  - Servicios: `expense.api.ts`
  - Endpoints:
    - `GET /expenses`
    - `POST /expenses`
    - `PUT /expenses/:id/confirm`
    - `POST /uploads/images`
  - Notas: admin crea; admin u operador confirman. Si el monto final cambia, el comentario es obligatorio.

### Feedback, licencias, notificaciones y data

- `/feedback`
  - Servicios: `feedback.api.ts`
  - Endpoints:
    - `GET /feedback`
    - `POST /feedback`
  - Notas: todos pueden crear entradas; solo admin ve el libro completo.

- `/licenses`
  - Servicios: `license.api.ts`
  - Endpoints:
    - `GET /licenses`
    - `POST /licenses`
    - `PUT /licenses/:id`
    - `POST /licenses/:id/issuances`
  - Notas: controla permisos/licencias con historial de emisiones y renovaciones. Solo admin.

- `/notifications`
  - Servicios: `notification.api.ts`, `product.api.ts`
  - Endpoints:
    - `GET /notifications`
    - `POST /notifications`
    - `PUT /notifications/:id`
    - `GET /notification-settings`
    - `PUT /notification-settings/:type`
    - `GET /stock-threshold-settings`
    - `PUT /stock-threshold-settings/category/:category`
    - `PUT /stock-threshold-settings/product/:productId`
    - `DELETE /stock-threshold-settings/product/:productId`
    - `POST /notifications/generate-test-cases`
    - `GET /products`
  - Notas: operador ve solo lectura. Admin administra estados, configuraciones, minimos y altas manuales.

- `/data`
  - Servicios: `data.api.ts`
  - Endpoints:
    - `GET /admin/data/stores`
    - `POST /admin/data/stores`
    - `PUT /admin/data/stores/active`
    - `POST /admin/data/reset`
    - `POST /admin/data/stores/import`
    - `POST /admin/data/stores/backup`
    - `POST /admin/data/blocks`
  - Notas: solo admin; las escrituras verifican credenciales contra la base activa. DDBB gestiona bases completas y Bloques de datos permite exportar, revisar y reemplazar Catalogo/Operaciones/Stock sin activar otra base.

## Catalogo de endpoints por dominio

### Usuarios

- `GET /users`
- `POST /users`
- `PUT /users/:id`
- `DELETE /users/:id`

### Productos, precios y margenes

- `GET /products`
- `POST /products`
- `PUT /products/:id`
- `DELETE /products/:id`
- `GET /product-prices`
- `POST /product-prices`
- `GET /price-margin-settings`
- `PUT /price-margin-settings/category/:category`
- `PUT /price-margin-settings/product/:productId`
- `DELETE /price-margin-settings/product/:productId`
- `POST /delete-requests`
- `GET /delete-requests`
- `PUT /delete-requests/:id/status`

### Menu, ingredientes y categorias

- `GET/POST /ingredients`, `PUT/DELETE /ingredients/:id`
- `GET/POST /ingredient-categories`, `PUT/DELETE /ingredient-categories/:id`
- `GET/POST /recipes`, `PUT/DELETE /recipes/:id`
- `GET/POST /combos`, `PUT/DELETE /combos/:id`
- `GET/POST /categories`, `PUT/DELETE /categories/:id`
- `GET /menu-products`
- `POST /menu-products`
- `PUT /menu-products/:id`
- `DELETE /menu-products/:id`
- `GET /menu-categories`
- `POST /menu-categories`
- `PUT /menu-categories/:id`
- `DELETE /menu-categories/:id`

### Ventas y fiscal/comercial

- `GET /orders`
- `POST /orders`
- `PUT /orders/:id/status`
- `GET /invoices`
- `POST /invoices`
- `POST /receipts`
- `GET /payment-method-settings`
- `PUT /payment-method-settings/:method`
- `GET /tax-settings`
- `PUT /tax-settings`

### Stock y mercaderia

- `POST /ingredient-stock-entries`

- `GET /stocks`
- `POST /stocks`
- `GET /supply-orders`
- `POST /supply-orders`
- `PUT /supply-orders/:id`
- `DELETE /supply-orders/:id`
- `PUT /supply-orders/:id/receive`

### Caja y jornadas

- `GET /workdays`
- `GET /workdays/current`
- `POST /workdays/open`
- `PUT /workdays/:id/request-close`
- `PUT /workdays/:id/admin-close`
- `PUT /workdays/:id/close`
- `POST /workdays/current/add-order`
- `GET /cash-opening-assignments`
- `PUT /cash-opening-assignments/:operator`

### Solicitudes y gastos

- `GET /operation-requests`
- `POST /operation-requests`
- `PUT /operation-requests/:id`
- `DELETE /operation-requests/:id`
- `PUT /operation-requests/:id/status`
- `GET /expenses`
- `POST /expenses`
- `PUT /expenses/:id/confirm`

### Feedback, licencias y notificaciones

- `GET /feedback`
- `POST /feedback`
- `GET /licenses`
- `POST /licenses`
- `PUT /licenses/:id`
- `POST /licenses/:id/issuances`
- `GET /notifications`
- `POST /notifications`
- `PUT /notifications/:id`
- `GET /notification-settings`
- `PUT /notification-settings/:type`
- `GET /stock-threshold-settings`
- `PUT /stock-threshold-settings/category/:category`
- `PUT /stock-threshold-settings/product/:productId`
- `DELETE /stock-threshold-settings/product/:productId`
- `POST /notifications/generate-test-cases`

### Libro financiero y data

- `GET /financial-accounts`
- `GET /financial-transactions`
- `GET /admin/data/stores`
- `POST /admin/data/stores`
- `PUT /admin/data/stores/active`
- `POST /admin/data/reset`
- `POST /admin/data/stores/import`
- `POST /admin/data/stores/backup`
- `POST /admin/data/blocks`
- `GET/PUT /system-settings`

### Imagenes

- `POST /uploads/images`
- `GET /images/:filename`

## Puntos de integracion que hoy son importantes

1. El backend mock no es una referencia parcial: hoy define el contrato real de desarrollo.
2. Las mutaciones disparan efectos colaterales en notificaciones, stock, jornadas y libro financiero.
3. `POST /receipts` ya forma parte del flujo de ventas.
4. El modulo `Data` depende de credenciales admin hasheadas desde frontend.
5. Si se reemplaza el mock por backend real, conviene respetar los mismos paths y payloads para evitar una migracion innecesaria en la UI.

## Contratos ampliados

Los payloads de bloques, costos y propuesta relacional estan en [Diccionario de datos](data-dictionary.md). `purchaseTotal` genera `stock-purchase` una vez por movimiento positivo sin pedido proveedor. No representa una salida automatica de caja. Los importes derivados conservan hasta dos decimales.
