# Arquitectura MVVM y organizacion real del frontend

Este proyecto usa una variante pragmatica de MVVM por `feature`. La idea general se mantiene, pero no todas las pantallas tienen un `viewmodel/` dedicado. En la practica hoy conviven dos patrones:

- features con `viewmodel/` cuando la logica de pantalla es reutilizable o merece separacion explicita
- pantallas que concentran el estado en `view/` cuando el flujo es muy local a esa UI

Eso hace que la arquitectura actual sea MVVM flexible, no un esquema rigido.

## Estructura actual

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
      viewmodel/   # solo donde aporta valor
      component/   # piezas reutilizables del modulo
  shared/
    format/
    http/
    image/
    product/
    search/
```

## Capas principales

### `app/`

Infraestructura transversal de la aplicacion:

- `router/routes.tsx`: mapa completo de rutas protegidas y publicas
- `router/RequireAuth.tsx`: guard de autenticacion
- `provider/AuthProvider.tsx`, `auth.context.ts`, `useAuth.ts`: estado de sesion
- `component/Breadcrumbs.tsx`: navegacion contextual
- `component/SessionStatusBar.tsx`: usuario actual, accesos rapidos y estado de sesion
- `component/HeaderOperationNotice.tsx`: aviso superior usado por el menu operativo

### `feature/<feature>/model`

Contiene tipos de dominio, enums, labels y helpers puros. Ejemplos:

- `request.types.ts`: solicitudes de mercaderia y permisos, con items
- `notification.types.ts`: tipos y estados de notificacion
- `sale.types.ts`: metodos de pago, ordenes, facturas
- `transaction.types.ts`: cuentas y transacciones derivadas

### `feature/<feature>/service`

Envuelve acceso a datos. La mayoria de los servicios son wrappers finos sobre `fetch` y usan `readJsonOrThrow` de `src/shared/http/http.ts`.

Ejemplos:

- `product.api.ts`
- `sale.api.ts`
- `cash.api.ts`
- `request.api.ts`
- `data.api.ts`

### `feature/<feature>/viewmodel`

Existe solo donde hoy aporta separacion clara:

- `auth/viewmodel/useLoginViewModel.ts`
- `product/viewmodel/useProductCrudViewModel.ts`

En estos casos el viewmodel concentra estado, validaciones, carga inicial y acciones principales.

### `feature/<feature>/view`

Pantallas React. Muchas features hoy resuelven directamente en esta capa su estado de UI, filtros, tabs y coordinacion entre servicios. Eso pasa sobre todo en modulos con mucha interaccion local:

- `CashScreen`
- `NotificationsScreen`
- `ExpensesScreen`
- `SupplyReceivingScreen`
- `TransactionsScreen`
- `OperationRequestsScreen`
- `ApproveRequestsScreen`

No es inconsistente con el repositorio actual: simplemente refleja que el desacople se aplico donde mas rendia.

### `feature/<feature>/component`

Piezas reutilizables dentro de una feature. Ejemplos reales:

- `product/component/ProductTable.tsx`
- `product/component/ProductRow.tsx`
- `request/component/MerchandiseRequestEditor.tsx`
- `request/component/RequestItemsTable.tsx`

## Reglas de capa que si se sostienen hoy

1. Las vistas no hacen `fetch` crudo; pasan por `service/`.
2. Los contratos de datos viven en `model/`.
3. Las utilidades compartidas van en `shared/`.
4. La navegacion y la sesion viven en `app/`, no en cada feature.

## Shared actual

`shared/` ya consolida varias piezas repetidas en la app:

- `http/http.ts`: parseo JSON y manejo uniforme de errores HTTP
- `image/image.service.ts`: upload y resolucion de URLs de imagen
- `format/locale.ts`: moneda, fecha, fecha-hora y tiempo restante
- `format/numeric.ts`: mascaras y parseos numericos
- `search/search.ts`: normalizacion para filtros de texto
- `product/product-filter.ts`: filtros reutilizables de producto

## Backend embebido y arquitectura de desarrollo

El frontend no corre contra un backend separado en desarrollo. El mock backend real vive dentro de `vite.config.ts` como middleware de Vite y maneja:

- persistencia en archivos
- multiples bases
- imagenes
- recibos HTML
- sincronizacion financiera derivada
- generacion automatica de notificaciones

Esto impacta la arquitectura del repo porque el contrato entre UI y backend queda versionado en el mismo proyecto.

## Particularidad del dominio de productos

Solo el dominio de productos/precios/margenes tiene fallback a `localStorage` cuando `VITE_USE_FAKE_API=false`.

En ese modo:

- productos, precios y margenes salen del mock backend
- el resto del sistema sigue usando endpoints HTTP relativos

Por eso, si se va a migrar a backend real, conviene unificar ese dominio y eliminar el fallback local.

## Lectura recomendada de la arquitectura actual

La forma mas fiel de entender el proyecto hoy es:

1. `app/` define sesion, proteccion y shell.
2. Cada `feature/` concentra un modulo funcional completo.
3. `service/` habla con el mock backend de `vite.config.ts`.
4. `shared/` evita duplicacion.
5. `viewmodel/` existe solo en features donde hoy se justifico.

## Deuda tecnica visible

- No todas las pantallas complejas tienen `viewmodel/`.
- El mock backend convive con el frontend y crecio bastante dentro de `vite.config.ts`.
- Algunos modulos dependen de coordinacion entre varias entidades sin una capa de orquestacion comun.

Nada de eso bloquea el trabajo actual, pero conviene tenerlo presente si se avanza hacia backend real o testeo automatizado por dominio.
