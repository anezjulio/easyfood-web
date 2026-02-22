# Arquitectura MVVM (Frontend)

Este proyecto está organizado con una variante de MVVM por `feature`:

- `model/`: tipos de dominio y helpers puros del dominio.
- `service/`: acceso a datos (HTTP/fake/local storage). No hay UI aquí.
- `viewmodel/`: estado y reglas de interacción de la pantalla.
- `view/`: componentes/pantallas React.

## Estructura base

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
      viewmodel/
  shared/
    format/
    http/
    image/
    product/
    search/
```

## Reglas de capa

1. `view` no hace `fetch` directo. Solo usa `viewmodel` o `service`.
2. `viewmodel` concentra validaciones, filtros, estado y flujo UI.
3. `service` expone funciones atómicas de backend.
4. utilidades transversales van en `shared/`.

## Refactor aplicado

Para preparar la conexión backend se consolidó lógica repetida:

- `src/shared/http/http.ts`
  - `readJsonOrThrow`: manejo uniforme de errores HTTP.
- `src/shared/format/locale.ts`
  - `formatMoneyARS`, `formatDateAR`, `formatDateTimeAR`.
- `src/shared/format/numeric.ts`
  - `keepOnlyDigits`, `formatIntegerTextMask`, `parsePositiveIntFromTextMask`.
- `src/shared/search/search.ts`
  - `normalizeForSearch` (lowercase + trim + sin diacríticos).
- `src/shared/product/product-filter.ts`
  - `matchesPriceFilter`, `matchesNumericContainsFilter`, utilidades de filtro por producto.

## Limpieza aplicada

- Eliminado código muerto:
  - `src/feature/product/viewmodel/useProductListViewModel.ts` (no tenía uso).
- Centralización de formato/filtros y reducción de duplicación en pantallas:
  - ventas, stock, precios, usuarios, caja, notificaciones, solicitudes, licencias, gastos, etc.
- Separación de auth context/hook para mantener capas claras:
  - `src/app/provider/AuthProvider.tsx` (solo provider)
  - `src/app/provider/auth.context.ts`
  - `src/app/provider/useAuth.ts`

## Recomendaciones para próxima fase (backend real)

1. Definir un `API_BASE_URL` único y cliente HTTP común (auth, headers, retries).
2. Mantener contratos request/response por endpoint en archivos de `model`.
3. Crear mapeadores DTO -> modelo de UI si backend difiere del shape actual.
4. Agregar tests de `service` y `viewmodel` por flujo crítico (ventas, caja, stock).
