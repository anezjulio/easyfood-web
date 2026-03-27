# Integracion backend: pantallas, servicios y endpoints

## Contexto actual

- La UI consume endpoints REST con `fetch`.
- El backend de desarrollo esta embebido en `vite.config.ts`.
- El patron comun en frontend es `service/*.api.ts` + `readJsonOrThrow`.
- Solo productos/precios/margenes pueden caer a `localStorage` cuando `VITE_USE_FAKE_API=false`.
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
  - Servicios: `product.api.ts`, `sale.api.ts`, `stock.api.ts`, `cash.api.ts`
  - Endpoints:
    - `GET /products`
    - `GET /payment-method-settings`
    - `GET /tax-settings`
    - `GET /workdays/current`
    - `POST /orders`
    - `GET /orders`
    - `PUT /orders/:id/status`
    - `POST /invoices`
    - `POST /stocks`
    - `POST /workdays/current/add-order`
  - Notas: requiere caja abierta. Al pagar, crea orden pagada, factura, salidas de stock y agrega la orden a la jornada actual.

- `/sales/summary`
  - Servicios: `sale.api.ts`
  - Endpoints:
    - `POST /receipts`
  - Notas: genera HTML imprimible y guarda el recibo en el filesystem de la base activa.

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
  - Notas: exige password admin y opera sobre multiples bases. Solo admin.

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

### Imagenes

- `POST /uploads/images`
- `GET /images/:filename`

## Puntos de integracion que hoy son importantes

1. El backend mock no es una referencia parcial: hoy define el contrato real de desarrollo.
2. Las mutaciones disparan efectos colaterales en notificaciones, stock, jornadas y libro financiero.
3. `POST /receipts` ya forma parte del flujo de ventas.
4. El modulo `Data` depende de credenciales admin hasheadas desde frontend.
5. Si se reemplaza el mock por backend real, conviene respetar los mismos paths y payloads para evitar una migracion innecesaria en la UI.
