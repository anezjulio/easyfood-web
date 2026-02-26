# Servicios Backend Para Operaciones Con DB

## Objetivo
Este documento lista todos los servicios que el frontend necesita consumir para cada operacion que lee o escribe datos en DB.

Base de referencia:
- Servicios frontend en `src/feature/**/service/*.ts`
- Contratos implementados en el mock server de `vite.config.ts`

## Convenciones generales de contrato
- Transporte: HTTP + JSON.
- Header para escrituras: `Content-Type: application/json`.
- Errores: respuesta no `2xx` con payload `{ "message": "..." }`.
- Formato de IDs de entidades (actual): `prefijo + ddMMyyyyHHmmss + 4 digitos`.
- Para imagenes: upload binario (`image/*`) y respuesta JSON con `path` y `url`.

## Entidades DB involucradas
- `products`
- `productPrices`
- `priceMarginSettings`
- `users`
- `deleteRequests`
- `requests` (operation requests)
- `supplyOrders`
- `stocks`
- `orders`
- `invoices`
- `workdays`
- `cashOpeningAssignments`
- `expenses`
- `licenses`
- `notifications`
- `notificationSettings`
- `stockThresholdSettings`
- `paymentMethodSettings`
- `taxSettings`

## 1) Productos, precios y margenes
Servicio frontend: `src/feature/product/service/product.api.ts`

| Operacion | Endpoint | Body request | Respuesta | Lee DB | Escribe DB |
|---|---|---|---|---|---|
| Listar productos | `GET /products` | - | `Product[]` (incluye `existencia` y `ultimoIngreso`) | `products`, `stocks` | - |
| Crear producto | `POST /products` | `name`, `price?`, `costPrice?`, `marginPercent?`, `imageUrl?`, `barcode?`, `category?`, `supplyOrderId?` | `Product` | `priceMarginSettings` | `products`, `productPrices`, `notifications` |
| Editar producto | `PUT /products/:id` | mismo draft de producto | `Product` | `products`, `priceMarginSettings` | `products` |
| Eliminar producto | `DELETE /products/:id` | - | `{ ok: boolean }` | `products` | `products`, `priceMarginSettings.productMargins`, `notifications` |
| Solicitar baja de producto | `POST /delete-requests` | `productId`, `productName`, `requestedBy` | `ProductDeleteRequest` | - | `deleteRequests` |
| Listar historial de precios | `GET /product-prices` | - | `ProductPrice[]` | `productPrices` | - |
| Registrar nuevo precio | `POST /product-prices` | `productId`, `newPrice`, `costPrice?`, `marginPercent?` | `ProductPrice` | `products`, `priceMarginSettings` | `products`, `productPrices`, `notifications` |
| Ver configuracion de margenes | `GET /price-margin-settings` | - | `PriceMarginSettings` | `priceMarginSettings` | - |
| Cambiar margen por categoria | `PUT /price-margin-settings/category/:category` | `marginPercent` | `PriceMarginSettings` | `priceMarginSettings` | `priceMarginSettings` (incluye history) |
| Upsert margen por producto | `PUT /price-margin-settings/product/:productId` | `marginPercent` | `PriceMarginSettings` | `priceMarginSettings` | `priceMarginSettings` (incluye history) |
| Quitar margen por producto | `DELETE /price-margin-settings/product/:productId` | - | `PriceMarginSettings` | `priceMarginSettings` | `priceMarginSettings` (incluye history) |

Nota importante:
- Si `VITE_USE_FAKE_API=false`, este modulo usa storage local para productos/precios/margenes y no backend.
- Para backend real, se recomienda `VITE_USE_FAKE_API=true` o remover ese fallback.

## 2) Usuarios
Servicio frontend: `src/feature/user/service/user.api.ts`

| Operacion | Endpoint | Body request | Respuesta | Lee DB | Escribe DB |
|---|---|---|---|---|---|
| Listar usuarios | `GET /users` | - | `AppUserRecord[]` | `users` | - |
| Crear usuario | `POST /users` | `name`, `email`, `username`, `password`, `startHour`, `endHour` | `AppUserRecord` | `users` | `users`, `notifications` |
| Editar usuario | `PUT /users/:id` | `name`, `email`, `username`, `password?`, `startHour`, `endHour` | `AppUserRecord` | `users` | `users`, `notifications` |
| Eliminar usuario | `DELETE /users/:id` | - | `{ ok: boolean, id: string }` | `users` | `users`, `notifications` |

## 3) Solicitudes operativas
Servicio frontend: `src/feature/request/service/request.api.ts`

| Operacion | Endpoint | Body request | Respuesta | Lee DB | Escribe DB |
|---|---|---|---|---|---|
| Listar solicitudes | `GET /operation-requests` | - | `OperationRequest[]` | `requests` | - |
| Crear solicitud | `POST /operation-requests` | `requestType`, `description`, `requestedBy` | `OperationRequest` | - | `requests`, `notifications` |
| Editar solicitud pendiente | `PUT /operation-requests/:id` | `requestType`, `description` | `OperationRequest` | `requests` | `requests` |
| Cancelar solicitud pendiente | `DELETE /operation-requests/:id` | - | `{ ok: boolean, id: string }` | `requests` | `requests` |
| Aprobar/Rechazar solicitud | `PUT /operation-requests/:id/status` | `status`, `reviewedBy`, `supplyOrderId?`, `supplierMessage?`, `reviewComment?` | `OperationRequest` | `requests` | `requests`, `notifications` |

## 4) Pedidos a proveedor
Servicio frontend: `src/feature/supply/service/supply.api.ts`

| Operacion | Endpoint | Body request | Respuesta | Lee DB | Escribe DB |
|---|---|---|---|---|---|
| Listar pedidos proveedor | `GET /supply-orders` | - | `SupplyOrder[]` | `supplyOrders` | - |
| Crear pedido proveedor | `POST /supply-orders` | `supplierName`, `description`, `expectedTotal`, `createdBy?` | `SupplyOrder` | - | `supplyOrders`, `notifications` |
| Editar pedido pendiente | `PUT /supply-orders/:id` | `supplierName`, `description`, `expectedTotal` | `SupplyOrder` | `supplyOrders` | `supplyOrders` |
| Cancelar pedido pendiente | `DELETE /supply-orders/:id` | - | `{ ok: boolean, id: string }` | `supplyOrders` | `supplyOrders` |
| Registrar recepcion | `PUT /supply-orders/:id/receive` | `actualTotal`, `isExactAmount`, `receivedBy?`, `invoiceImageUrl?`, `receiveComment?` | `SupplyOrder` | `supplyOrders` | `supplyOrders`, `notifications` |

## 5) Stock
Servicio frontend: `src/feature/stock/service/stock.api.ts`

| Operacion | Endpoint | Body request | Respuesta | Lee DB | Escribe DB |
|---|---|---|---|---|---|
| Listar ingresos de stock | `GET /stocks` | - | `StockEntry[]` | `stocks` | - |
| Crear ingreso de stock | `POST /stocks` | `productId`, `manufactureDate?`, `expirationDate?`, `quantity`, `description?`, `supplyOrderId?`, `costPrice?`, `salePrice?` | `StockEntry` | `products`, `supplyOrders`, `stockThresholdSettings` | `stocks`, `products` (si corresponde), `notifications` |

Reglas relevantes del mock:
- Si `quantity > 0`, exige `expirationDate`.
- Si llega `supplyOrderId`, debe existir y estar `received`.

## 6) Gastos
Servicio frontend: `src/feature/expense/service/expense.api.ts`

| Operacion | Endpoint | Body request | Respuesta | Lee DB | Escribe DB |
|---|---|---|---|---|---|
| Listar gastos | `GET /expenses` | - | `Expense[]` | `expenses` | - |
| Crear gasto | `POST /expenses` | `description`, `amount`, `expenseType`, `invoiceImageUrl?`, `unexpectedImageUrl?`, `createdBy?` | `Expense` | - | `expenses`, `notifications` |

## 7) Ventas, facturas y configuracion comercial/fiscal
Servicio frontend: `src/feature/sale/service/sale.api.ts`

| Operacion | Endpoint | Body request | Respuesta | Lee DB | Escribe DB |
|---|---|---|---|---|---|
| Crear orden | `POST /orders` | `items[]`, `operator` | `Order` | - | `orders` |
| Listar ordenes | `GET /orders` | - | `Order[]` | `orders` | puede escribir por expiracion automatica de pendientes |
| Actualizar estado de orden | `PUT /orders/:id/status` | `status`, `paymentMethod?`, `total?` | `Order` | `orders` | `orders`, `notifications` (si pagada) |
| Crear factura | `POST /invoices` | `orderId`, `total`, `paymentMethod`, `operator` | `Invoice` | `orders` | `invoices` |
| Ver config metodos de pago | `GET /payment-method-settings` | - | `PaymentMethodSettings` | `paymentMethodSettings` | - |
| Actualizar config metodo | `PUT /payment-method-settings/:method` | `discountPercent`, `surchargePercent` | `PaymentMethodSettings` | `paymentMethodSettings` | `paymentMethodSettings` |
| Ver config IVA | `GET /tax-settings` | - | `TaxSettings` | `taxSettings` | - |
| Actualizar config IVA | `PUT /tax-settings` | `ivaPercent?`, `mode?` | `TaxSettings` | `taxSettings` | `taxSettings` |

## 8) Caja y jornadas
Servicio frontend: `src/feature/cash/service/cash.api.ts`

| Operacion | Endpoint | Body request | Respuesta | Lee DB | Escribe DB |
|---|---|---|---|---|---|
| Listar jornadas | `GET /workdays` | - | `Workday[]` | `workdays` | - |
| Obtener jornada abierta por operador | `GET /workdays/current?operator=:operator` | query `operator` | `Workday` o `404` | `workdays` | - |
| Abrir jornada/caja | `POST /workdays/open` | `operator`, `openingAmount` | `Workday` | `workdays`, `cashOpeningAssignments` | `workdays`, `notifications` |
| Agregar orden a jornada actual | `POST /workdays/current/add-order` | `operator`, `orderId` | `Workday` | `workdays` | `workdays` |
| Solicitar cierre (operador) | `PUT /workdays/:id/request-close` | `operator`, `declaredClosingCash`, `orderIds[]` | `Workday` | `workdays`, `orders`, `expenses`, `supplyOrders` | `workdays`, `notifications` |
| Cerrar por auditoria admin | `PUT /workdays/:id/admin-close` | `reviewedBy`, `checks`, `notes?`, `mismatchReport?` | `Workday` | `workdays`, `orders`, `expenses`, `supplyOrders` | `workdays`, `notifications` |
| Cierre directo | `PUT /workdays/:id/close` | `endedAt?`, `orderIds[]` | `Workday` | `workdays`, `orders`, `expenses`, `supplyOrders` | `workdays`, `notifications` |
| Listar asignaciones apertura | `GET /cash-opening-assignments` | - | `CashOpeningAssignment[]` | `cashOpeningAssignments` | - |
| Crear/actualizar asignacion apertura | `PUT /cash-opening-assignments/:operator` | `amount`, `shift`, `updatedBy` | `CashOpeningAssignment` | `cashOpeningAssignments` | `cashOpeningAssignments` |

Operaciones compuestas en frontend (`cash.operation.ts`):
- `syncCashState(operator)` -> usa `GET /workdays/current`.
- `openCashWithAmount(operator, openingAmount)` -> usa `POST /workdays/open`.
- `requestCashCloseWithAmount(...)` -> usa `PUT /workdays/:id/request-close`.

## 9) Licencias
Servicio frontend: `src/feature/license/service/license.api.ts`

| Operacion | Endpoint | Body request | Respuesta | Lee DB | Escribe DB |
|---|---|---|---|---|---|
| Listar licencias | `GET /licenses` | - | `LicenseRecord[]` | `licenses` | - |
| Crear licencia | `POST /licenses` | `name`, `description`, `category?`, `issueDate?`, `expirationDate?`, `contactEmail?`, `contactPhone?`, `sourceAddress?` | `LicenseRecord` | - | `licenses`, `notifications` |
| Editar licencia | `PUT /licenses/:id` | mismo draft de licencia | `LicenseRecord` | `licenses` | `licenses`, `notifications` |
| Agregar emision/renovacion | `POST /licenses/:id/issuances` | `issuedAt`, `expiresAt`, `notes?` | `LicenseRecord` | `licenses` | `licenses`, `notifications` |

## 10) Notificaciones, settings y umbrales
Servicio frontend: `src/feature/notification/service/notification.api.ts`

| Operacion | Endpoint | Body request | Respuesta | Lee DB | Escribe DB |
|---|---|---|---|---|---|
| Listar notificaciones | `GET /notifications` | - | `AppNotification[]` | `notifications` | - |
| Crear notificacion manual | `POST /notifications` | `type`, `title`, `description`, `dueAt?`, `isFixed?`, `requiresAction?`, `actionLabel?`, `category?`, `entityType?`, `entityId?` | `AppNotification` | - | `notifications` |
| Actualizar notificacion | `PUT /notifications/:id` | `status?`, `isFixed?`, `requiresAction?`, `title?`, `description?`, `dueAt?` | `AppNotification` | `notifications` | `notifications` |
| Listar settings de notificacion | `GET /notification-settings` | - | `NotificationSetting[]` | `notificationSettings` | - |
| Actualizar setting por tipo | `PUT /notification-settings/:type` | `leadDays?`, `durationDays?` | `NotificationSetting` | `notificationSettings` | `notificationSettings` |
| Ver umbrales de stock | `GET /stock-threshold-settings` | - | `StockThresholdSettings` | `stockThresholdSettings` | - |
| Cambiar umbral por categoria | `PUT /stock-threshold-settings/category/:category` | `minUnits` | `StockThresholdSettings` | `stockThresholdSettings`, `products`, `stocks` | `stockThresholdSettings`, `notifications` |
| Upsert umbral por producto | `PUT /stock-threshold-settings/product/:productId` | `minUnits` | `StockThresholdSettings` | `stockThresholdSettings`, `products`, `stocks` | `stockThresholdSettings`, `notifications` |
| Quitar umbral por producto | `DELETE /stock-threshold-settings/product/:productId` | - | `StockThresholdSettings` | `stockThresholdSettings`, `products`, `stocks` | `stockThresholdSettings`, `notifications` |
| Generar casos de prueba | `POST /notifications/generate-test-cases` | - | `{ ok: boolean, createdCases: number }` | multiples colecciones para construir casos | `notifications` (y puede crear data de soporte) |

## 11) Imagenes usadas por operaciones con DB
Servicio frontend: `src/shared/image/image.service.ts`

| Operacion | Endpoint | Body request | Respuesta | Uso en DB |
|---|---|---|---|---|
| Subir imagen | `POST /uploads/images?name=:fileName` | binario `image/*` | `{ path, url }` | La URL/path se guarda luego en entidades (`products.imageUrl`, `expenses.invoiceImageUrl`, `expenses.unexpectedImageUrl`, `supplyOrders.invoiceImageUrl`) |

Tambien existe:
- `GET /images/:filename` para servir archivo (consumo directo por navegador en `<img>`).

## 12) Endpoints implementados en mock pero no consumidos hoy por servicios frontend
- `GET /delete-requests`
- `PUT /delete-requests/:id/status`
- `GET /invoices`

Si vas a hacer backend real 1:1 con el mock actual, conviene implementarlos igual.

## Checklist rapido para backend real
1. Mantener los paths exactamente como arriba para no romper frontend.
2. Mantener el contrato de error `{ message }` en no-2xx.
3. Respetar validaciones de negocio criticas (status transitions, campos requeridos, etc.).
4. Mantener efectos colaterales esperados (ej: notificaciones automaticas) o definir alternativa equivalente.
5. Confirmar que IDs siguen formato compacto actual.

