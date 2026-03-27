# Servicios backend para operaciones con DB

## Objetivo

Este documento lista los servicios que hoy necesita el frontend para leer y escribir datos persistidos. La referencia real es:

- servicios frontend en `src/feature/**/service/*.ts`
- contratos implementados en el mock server de `vite.config.ts`

## Convenciones del contrato

- transporte: HTTP + JSON
- escrituras: `Content-Type: application/json`
- errores: respuesta no `2xx` con payload `{ "message": "..." }`
- upload de imagenes: `POST /uploads/images?name=:fileName` con binario `image/*`
- IDs: el mock sigue generando IDs compactos por prefijo + timestamp

## Root de datos y archivos por base

### Archivos de control

- `mock-api/data-stores.json`: define la base activa y el catalogo de bases
- `mock-api/db.json`: DB principal del repo
- `mock-api/data-stores/<id>/db.js`: DB de cada base adicional

### Medios por base

- principal:
  - `images/`
  - `mock-api/receipts/`
- bases adicionales:
  - `images/<id>/`
  - `mock-api/receipts/stores/<id>/`

### Variables de entorno relevantes

- `DATA_ROOT`: mueve `mock-api`, `images` y recibos a una raiz persistente externa
- `VITE_RECEIPTS_DIR` / `RECEIPTS_DIR`: carpeta base de recibos HTML

## Entidades actuales de la DB activa

Colecciones persistidas hoy en la base activa:

- `products`
- `productPrices`
- `users`
- `deleteRequests`
- `requests`
- `stocks`
- `orders`
- `invoices`
- `workdays`
- `cashOpeningAssignments`
- `supplyOrders`
- `expenses`
- `feedbackEntries`
- `financialAccounts`
- `financialTransactions`
- `licenses`
- `notifications`
- `notificationSettings`
- `stockThresholdSettings`
- `priceMarginSettings`
- `paymentMethodSettings`
- `taxSettings`

## Datos derivados y artefactos especiales

- `financialAccounts` y `financialTransactions` se recalculan desde la data operativa mediante sincronizacion interna. No son un libro editado manualmente desde UI.
- `POST /receipts` escribe un archivo HTML en la carpeta de recibos de la base activa y devuelve `filePath` mas `html`.
- `POST /uploads/images` escribe el archivo en la carpeta de imagenes de la base activa y devuelve `path` y `url`.

## Operaciones por dominio

### 1. Productos, precios y margenes

Servicio frontend: `src/feature/product/service/product.api.ts`

| Operacion | Endpoint | Lee DB | Escribe DB |
| --- | --- | --- | --- |
| Listar productos | `GET /products` | `products`, `stocks` | - |
| Crear producto | `POST /products` | `priceMarginSettings` | `products`, `productPrices`, `notifications` |
| Editar producto | `PUT /products/:id` | `products`, `priceMarginSettings` | `products` |
| Eliminar producto | `DELETE /products/:id` | `products` | `products`, `priceMarginSettings`, `notifications` |
| Solicitar baja | `POST /delete-requests` | - | `deleteRequests` |
| Listar historial de precios | `GET /product-prices` | `productPrices` | - |
| Registrar nuevo precio | `POST /product-prices` | `products`, `priceMarginSettings` | `products`, `productPrices`, `notifications` |
| Ver margenes | `GET /price-margin-settings` | `priceMarginSettings` | - |
| Cambiar margen por categoria | `PUT /price-margin-settings/category/:category` | `priceMarginSettings` | `priceMarginSettings` |
| Upsert margen por producto | `PUT /price-margin-settings/product/:productId` | `priceMarginSettings` | `priceMarginSettings` |
| Quitar margen por producto | `DELETE /price-margin-settings/product/:productId` | `priceMarginSettings` | `priceMarginSettings` |

Reglas importantes:

- `GET /products` devuelve stock enriquecido (`existencia`, `ultimoIngreso`).
- El backend valida unicidad de barcode en create/update.
- Si `VITE_USE_FAKE_API=false`, solo este dominio cae a `localStorage`.

### 2. Usuarios

Servicio frontend: `src/feature/user/service/user.api.ts`

| Operacion | Endpoint | Lee DB | Escribe DB |
| --- | --- | --- | --- |
| Listar usuarios | `GET /users` | `users` | - |
| Crear usuario | `POST /users` | `users` | `users`, `notifications` |
| Editar usuario | `PUT /users/:id` | `users` | `users`, `notifications` |
| Eliminar usuario | `DELETE /users/:id` | `users` | `users`, `notifications` |

### 3. Solicitudes operativas

Servicio frontend: `src/feature/request/service/request.api.ts`

| Operacion | Endpoint | Lee DB | Escribe DB |
| --- | --- | --- | --- |
| Listar solicitudes | `GET /operation-requests` | `requests` | - |
| Crear solicitud | `POST /operation-requests` | `products` si hay items | `requests`, `notifications` |
| Editar solicitud pendiente | `PUT /operation-requests/:id` | `requests`, `products` | `requests` |
| Cancelar solicitud pendiente | `DELETE /operation-requests/:id` | `requests` | `requests` |
| Aprobar o rechazar | `PUT /operation-requests/:id/status` | `requests`, `products` | `requests`, `notifications` |

Reglas importantes:

- `requestType=merchandise` admite `items[]`.
- `requestType=permissions` sigue siendo principalmente descriptiva.
- Al resolver una solicitud se marca como `received` la notificacion de accion original y se crea `operation-request-reviewed`.

### 4. Pedidos a proveedor

Servicio frontend: `src/feature/supply/service/supply.api.ts`

| Operacion | Endpoint | Lee DB | Escribe DB |
| --- | --- | --- | --- |
| Listar pedidos proveedor | `GET /supply-orders` | `supplyOrders` | - |
| Crear pedido proveedor | `POST /supply-orders` | `products` si hay items | `supplyOrders`, `notifications` |
| Editar pedido pendiente | `PUT /supply-orders/:id` | `supplyOrders`, `products` | `supplyOrders` |
| Cancelar pedido pendiente | `DELETE /supply-orders/:id` | `supplyOrders` | `supplyOrders` |
| Registrar recepcion | `PUT /supply-orders/:id/receive` | `supplyOrders`, `products`, `notifications` | `supplyOrders`, `stocks`, `notifications` |

Reglas importantes:

- el pedido puede tener `description`, `items` o ambos
- la recepcion exige `invoiceImageUrl`
- si el monto real es distinto al esperado, se valida comentario
- por cada item recibido se genera ingreso de stock automatico
- la notificacion fija `supply-pending-receive` pasa a `received` al completar la recepcion

### 5. Stock

Servicio frontend: `src/feature/stock/service/stock.api.ts`

| Operacion | Endpoint | Lee DB | Escribe DB |
| --- | --- | --- | --- |
| Listar ingresos de stock | `GET /stocks` | `stocks` | - |
| Crear ingreso de stock | `POST /stocks` | `products`, `supplyOrders`, `stockThresholdSettings` | `stocks`, `products`, `notifications` |

Reglas importantes:

- si `quantity > 0`, el mock exige `expirationDate`
- si llega `supplyOrderId`, el pedido debe existir y estar `received`
- el backend puede disparar notificaciones de stock bajo o resolverlas cuando el minimo deja de estar incumplido

### 6. Gastos

Servicio frontend: `src/feature/expense/service/expense.api.ts`

| Operacion | Endpoint | Lee DB | Escribe DB |
| --- | --- | --- | --- |
| Listar gastos | `GET /expenses` | `expenses` | - |
| Crear gasto | `POST /expenses` | - | `expenses`, `notifications` |
| Confirmar gasto | `PUT /expenses/:id/confirm` | `expenses` | `expenses`, `financialAccounts`, `financialTransactions` derivadas |

Reglas importantes:

- el gasto nace como `pending-confirmation`
- si el monto final cambia, `confirmationComment` es obligatorio
- al confirmar, el libro financiero derivado se recalcula

### 7. Ventas, facturas y recibos

Servicio frontend: `src/feature/sale/service/sale.api.ts`

| Operacion | Endpoint | Lee DB | Escribe DB |
| --- | --- | --- | --- |
| Crear orden | `POST /orders` | - | `orders` |
| Listar ordenes | `GET /orders` | `orders` | `orders` si expiran pendientes automaticamente |
| Actualizar estado de orden | `PUT /orders/:id/status` | `orders` | `orders`, `notifications`, `financialAccounts`, `financialTransactions` derivadas |
| Crear factura | `POST /invoices` | `orders` | `invoices` |
| Crear recibo HTML | `POST /receipts` | `orders`, `invoices` opcional | archivo HTML en recibos |
| Ver config metodos pago | `GET /payment-method-settings` | `paymentMethodSettings` | - |
| Actualizar config metodo | `PUT /payment-method-settings/:method` | `paymentMethodSettings` | `paymentMethodSettings` |
| Ver config IVA | `GET /tax-settings` | `taxSettings` | - |
| Actualizar config IVA | `PUT /tax-settings` | `taxSettings` | `taxSettings` |

Reglas importantes:

- `POST /receipts` solo opera sobre ordenes pagadas
- la venta pagada genera notificacion `sale-created`
- las transacciones financieras se recalculan segun forma de pago y categorias especiales

### 8. Caja y jornadas

Servicio frontend: `src/feature/cash/service/cash.api.ts`

| Operacion | Endpoint | Lee DB | Escribe DB |
| --- | --- | --- | --- |
| Listar jornadas | `GET /workdays` | `workdays` | - |
| Obtener jornada abierta | `GET /workdays/current` | `workdays` | - |
| Abrir jornada | `POST /workdays/open` | `workdays`, `cashOpeningAssignments` | `workdays`, `notifications`, libro financiero derivado |
| Agregar orden a jornada actual | `POST /workdays/current/add-order` | `workdays` | `workdays` |
| Solicitar cierre | `PUT /workdays/:id/request-close` | `workdays`, `orders`, `expenses`, `supplyOrders` | `workdays`, `notifications`, libro financiero derivado |
| Cerrar por auditoria admin | `PUT /workdays/:id/admin-close` | `workdays`, `orders`, `expenses`, `supplyOrders` | `workdays`, `notifications`, libro financiero derivado |
| Cierre directo | `PUT /workdays/:id/close` | `workdays`, `orders`, `expenses`, `supplyOrders` | `workdays`, `notifications`, libro financiero derivado |
| Listar asignaciones de apertura | `GET /cash-opening-assignments` | `cashOpeningAssignments` | - |
| Crear o actualizar asignacion | `PUT /cash-opening-assignments/:operator` | `cashOpeningAssignments` | `cashOpeningAssignments` |

Reglas importantes:

- para operadores no admin, la apertura valida horario asignado y monto configurado
- solicitar cierre crea una notificacion `cash` que requiere accion
- el cierre admin puede generar `cash-closed` y otra `cash` si hay diferencias

### 9. Feedback

Servicio frontend: `src/feature/feedback/service/feedback.api.ts`

| Operacion | Endpoint | Lee DB | Escribe DB |
| --- | --- | --- | --- |
| Listar feedback | `GET /feedback` | `feedbackEntries` | - |
| Crear entrada | `POST /feedback` | - | `feedbackEntries` |

### 10. Licencias

Servicio frontend: `src/feature/license/service/license.api.ts`

| Operacion | Endpoint | Lee DB | Escribe DB |
| --- | --- | --- | --- |
| Listar licencias | `GET /licenses` | `licenses` | - |
| Crear licencia | `POST /licenses` | - | `licenses`, `notifications` |
| Editar licencia | `PUT /licenses/:id` | `licenses` | `licenses`, `notifications` |
| Agregar emision o renovacion | `POST /licenses/:id/issuances` | `licenses` | `licenses`, `notifications` |

### 11. Notificaciones, settings y minimos de stock

Servicio frontend: `src/feature/notification/service/notification.api.ts`

| Operacion | Endpoint | Lee DB | Escribe DB |
| --- | --- | --- | --- |
| Listar notificaciones | `GET /notifications` | `notifications` | puede resolver estados fijos segun entidad relacionada |
| Crear notificacion manual | `POST /notifications` | - | `notifications` |
| Actualizar notificacion | `PUT /notifications/:id` | `notifications` | `notifications` |
| Listar configuraciones | `GET /notification-settings` | `notificationSettings` | - |
| Actualizar setting por tipo | `PUT /notification-settings/:type` | `notificationSettings` | `notificationSettings` |
| Ver minimos de stock | `GET /stock-threshold-settings` | `stockThresholdSettings` | - |
| Cambiar minimo por categoria | `PUT /stock-threshold-settings/category/:category` | `stockThresholdSettings`, `products`, `stocks` | `stockThresholdSettings`, `notifications` |
| Upsert minimo por producto | `PUT /stock-threshold-settings/product/:productId` | `stockThresholdSettings`, `products`, `stocks` | `stockThresholdSettings`, `notifications` |
| Quitar minimo por producto | `DELETE /stock-threshold-settings/product/:productId` | `stockThresholdSettings`, `products`, `stocks` | `stockThresholdSettings`, `notifications` |
| Generar casos de prueba | `POST /notifications/generate-test-cases` | multiples colecciones | `notifications` y soporte temporal si hace falta |

Reglas importantes:

- estados validos: `active`, `disabled`, `received`
- ciertas notificaciones fijas se autocorrigen a `received` cuando cambia el estado real de la entidad
- el admin puede marcar recibida, deshabilitar o reactivar

### 12. Libro financiero derivado

Servicio frontend: `src/feature/transaction/service/transaction.api.ts`

| Operacion | Endpoint | Lee DB | Escribe DB |
| --- | --- | --- | --- |
| Listar cuentas | `GET /financial-accounts` | `financialAccounts` | - |
| Listar transacciones | `GET /financial-transactions` | `financialTransactions` | - |

Notas:

- el modulo es de solo lectura
- los tipos actuales incluyen `sale-income`, `sale-cash`, `sale-tobacco`, `expense-payment`, `expense-cash`, `supply-payment`, `supply-cash`, `supply-return`, `cash-opening`, `cash-close`

### 13. Administracion de bases

Servicio frontend: `src/feature/data/service/data.api.ts`

| Operacion | Endpoint | Lee DB | Escribe DB |
| --- | --- | --- | --- |
| Listar bases | `GET /admin/data/stores` | `data-stores.json` | - |
| Crear base | `POST /admin/data/stores` | base activa y metadata | nuevo `db.js`, directorios de imagenes/recibos, `data-stores.json` |
| Cambiar base activa | `PUT /admin/data/stores/active` | `data-stores.json` | `data-stores.json` |
| Limpiar base activa | `POST /admin/data/reset` | base activa | base activa limpia + libro derivado recalculado |

Reglas importantes:

- el frontend manda `adminPasswordHash`, no password plano
- crear base copia usuarios y configuraciones, pero limpia lo operativo
- reset mantiene usuarios, asignaciones de apertura y configuraciones

## Operaciones implementadas en mock y poco o nada usadas por UI

- `GET /delete-requests`
- `PUT /delete-requests/:id/status`
- `GET /invoices`

Si el objetivo es backend real 1:1 con el mock actual, conviene implementarlas igual.

## Checklist para backend real

1. Mantener los mismos paths.
2. Mantener el shape de error `{ message }`.
3. Replicar efectos colaterales de notificaciones y libro financiero.
4. Respetar transiciones de estado y validaciones de negocio.
5. Mantener soporte para multiples bases si esa capacidad sigue siendo requerida.
