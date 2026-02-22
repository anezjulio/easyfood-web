# Integración Backend: Páginas, Servicios y Endpoints

## Entorno

- Front llama endpoints REST con `fetch`.
- Modo productos:
  - `VITE_USE_FAKE_API=true`: usa `VITE_FAKE_API_URL`.
  - `VITE_USE_FAKE_API=false`: usa storage local para productos/precios/márgenes.
- El resto de módulos ya consume rutas HTTP relativas (`/orders`, `/workdays`, etc.).

## Mapa página -> servicios -> endpoints

| Ruta | Funcionalidad principal | Servicios frontend | Endpoints backend |
|---|---|---|---|
| `/login` | autenticación demo | `auth.fake.ts`, `user.api.ts` | `GET /users` |
| `/operation` | menú operativo | - | - |
| `/products/new` | ABM productos, imagen, margen | `product.api.ts` | `GET/POST/PUT/DELETE /products`, `POST /delete-requests`, `GET/POST /product-prices`, `GET /price-margin-settings`, `PUT /price-margin-settings/category/:category`, `PUT/DELETE /price-margin-settings/product/:productId` |
| `/prices` | actualización de costo/venta + historial de márgenes | `product.api.ts` | mismos endpoints de productos/precios/márgenes |
| `/finances` | márgenes + métodos de pago + IVA | `product.api.ts`, `sale.api.ts` | endpoints de márgenes + `GET /payment-method-settings`, `PUT /payment-method-settings/:method`, `GET /tax-settings`, `PUT /tax-settings` |
| `/users` | ABM usuarios | `user.api.ts` | `GET/POST /users`, `PUT/DELETE /users/:id` |
| `/stock` | ingreso stock para existente/nuevo | `product.api.ts`, `stock.api.ts`, `supply.api.ts` | endpoints de productos/márgenes + `POST/GET /stocks`, `GET /supply-orders` |
| `/cash` | apertura/cierre/auditoría de caja | `cash.api.ts`, `sale.api.ts`, `expense.api.ts`, `supply.api.ts`, `user.api.ts` | `GET /workdays`, `GET /workdays/current`, `POST /workdays/open`, `PUT /workdays/:id/request-close`, `PUT /workdays/:id/admin-close`, `PUT /workdays/:id/close`, `POST /workdays/current/add-order`, `GET/PUT /cash-opening-assignments`, `GET /orders`, `GET /expenses`, `GET /supply-orders`, `GET /users` |
| `/workdays` | historial de jornadas y órdenes | `cash.api.ts`, `sale.api.ts` | `GET /workdays`, `GET /orders` |
| `/balance` | reportes diarios/semanales/mensuales | `cash.api.ts`, `sale.api.ts`, `expense.api.ts`, `supply.api.ts` | `GET /workdays`, `GET /orders`, `GET /expenses`, `GET /supply-orders` |
| `/sales` | carrito, orden, pago, facturación | `product.api.ts`, `sale.api.ts`, `stock.api.ts`, `cash.api.ts` | `GET /products`, `POST /orders`, `GET /orders`, `PUT /orders/:id/status`, `POST /invoices`, `GET /payment-method-settings`, `GET /tax-settings`, `POST /stocks`, `GET /workdays/current`, `POST /workdays/current/add-order` |
| `/sales/summary` | resumen de venta | (usa state de navegación) | - |
| `/supplies/orders` | pedidos a proveedor | `supply.api.ts` | `GET/POST /supply-orders`, `PUT/DELETE /supply-orders/:id` |
| `/supplies/receiving` | recepción de pedido | `supply.api.ts` | `GET /supply-orders`, `PUT /supply-orders/:id/receive` |
| `/requests` | solicitudes de operación | `request.api.ts` | `GET/POST /operation-requests`, `PUT/DELETE /operation-requests/:id` |
| `/requests/approvals` | aprobación/rechazo solicitudes | `request.api.ts`, `supply.api.ts` | `GET /operation-requests`, `PUT /operation-requests/:id/status`, `GET/POST /supply-orders` |
| `/expenses` | carga y listado de gastos | `expense.api.ts` | `GET/POST /expenses` |
| `/licenses` | licencias/permisos y renovaciones | `license.api.ts` | `GET/POST /licenses`, `PUT /licenses/:id`, `POST /licenses/:id/issuances` |
| `/notifications` | notificaciones + settings + stock mínimo | `notification.api.ts`, `product.api.ts` | `GET/POST /notifications`, `PUT /notifications/:id`, `GET /notification-settings`, `PUT /notification-settings/:type`, `GET /stock-threshold-settings`, `PUT /stock-threshold-settings/category/:category`, `PUT/DELETE /stock-threshold-settings/product/:productId`, `POST /notifications/generate-test-cases`, `GET /products` |

## Catálogo de endpoints por dominio

### Usuarios

- `GET /users`
- `POST /users`
- `PUT /users/:id`
- `DELETE /users/:id`

### Productos, precios y márgenes

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

### Ventas y configuración comercial

- `GET /orders`
- `POST /orders`
- `PUT /orders/:id/status`
- `POST /invoices`
- `GET /payment-method-settings`
- `PUT /payment-method-settings/:method`
- `GET /tax-settings`
- `PUT /tax-settings`

### Stock

- `GET /stocks`
- `POST /stocks`

### Caja/Jornadas

- `GET /workdays`
- `GET /workdays/current?operator=:operator`
- `POST /workdays/open`
- `PUT /workdays/:id/close`
- `PUT /workdays/:id/request-close`
- `PUT /workdays/:id/admin-close`
- `POST /workdays/current/add-order`
- `GET /cash-opening-assignments`
- `PUT /cash-opening-assignments/:operator`

### Pedidos a proveedor

- `GET /supply-orders`
- `POST /supply-orders`
- `PUT /supply-orders/:id`
- `DELETE /supply-orders/:id`
- `PUT /supply-orders/:id/receive`

### Solicitudes operativas

- `GET /operation-requests`
- `POST /operation-requests`
- `PUT /operation-requests/:id`
- `DELETE /operation-requests/:id`
- `PUT /operation-requests/:id/status`

### Gastos

- `GET /expenses`
- `POST /expenses`

### Licencias

- `GET /licenses`
- `POST /licenses`
- `PUT /licenses/:id`
- `POST /licenses/:id/issuances`

### Notificaciones

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

## Siguiente paso recomendado

Antes de conectar backend real:

1. Confirmar contrato JSON de cada endpoint (request/response y códigos HTTP).
2. Definir estrategia de autenticación (token, refresh, roles).
3. Acordar paginación/filtros server-side para listados grandes.
4. Versionar APIs (`/v1/...`) para evitar breaking changes.
