# Casos de Prueba - Permisos/Licencias y Notificaciones

## Como generar ejemplos automaticamente

1. Ir a `Menu > Notificaciones`.
2. Pestaña `Crear`.
3. Click en `Generar casos de prueba y ejemplos`.
4. Validar que aparezcan notificaciones en `Listado`.

Tambien existe endpoint:

- `POST /notifications/generate-test-cases`

---

## Casos por tipo de notificacion

1. `license-required`
- Casuistica: crear licencia/permiso sin `expedicion` y `vencimiento` (estado pendiente por renovar).
- Resultado esperado: notificacion fija con accion para renovar.

2. `license-expiring`
- Casuistica: crear licencia con `vencimiento` cercano.
- Resultado esperado: notificacion con fecha usando anticipo configurable.

3. `product-expiring`
- Casuistica: registrar stock de producto perecedero con `expirationDate`.
- Resultado esperado: notificacion de producto por vencer (fecha = vencimiento - anticipo).

4. `product-low-stock`
- Casuistica: stock actual menor al umbral (por categoria o override por producto).
- Resultado esperado: notificacion fija con accion `Reponer stock`.

5. `expense-created`
- Casuistica: registrar un gasto.
- Resultado esperado: notificacion con duracion configurable (default 7 dias).

6. `sale-created`
- Casuistica: pagar una venta.
- Resultado esperado: notificacion diaria (default 1 dia).

7. `supply-requested`
- Casuistica: crear pedido a proveedor.
- Resultado esperado: notificacion de pedido solicitado.

8. `supply-pending-receive`
- Casuistica: pedido a proveedor pendiente.
- Resultado esperado: notificacion fija con accion hasta recepcion.

9. `supply-approved`
- Casuistica: aprobar solicitud de mercancia de operador.
- Resultado esperado: notificacion de solicitud aprobada.

10. `supply-received`
- Casuistica: recibir mercancia de un pedido.
- Resultado esperado: notificacion de recepcion y cierre de pendiente.

11. `cash-opened`
- Casuistica: abrir caja.
- Resultado esperado: notificacion con duracion configurable (default 1 dia).

12. `cash-closed`
- Casuistica: cerrar caja.
- Resultado esperado: notificacion con duracion configurable (default 1 dia).

13. `user-created`
- Casuistica: crear usuario.
- Resultado esperado: notificacion de alta de usuario (default 1 semana).

14. `user-updated`
- Casuistica: modificar usuario.
- Resultado esperado: notificacion de modificacion de usuario.

15. `user-deleted`
- Casuistica: eliminar usuario.
- Resultado esperado: notificacion de baja de usuario.

16. `price-changed`
- Casuistica: cambiar precio de producto.
- Resultado esperado: notificacion de precio actualizado.

17. `product-created`
- Casuistica: crear producto.
- Resultado esperado: notificacion de producto creado.

18. `stock-created`
- Casuistica: registrar ingreso/egreso de stock.
- Resultado esperado: notificacion de movimiento de stock.

19. `operation-request-merchandise`
- Casuistica: operador crea solicitud de mercancia.
- Resultado esperado: notificacion que requiere accion.

20. `operation-request-permissions`
- Casuistica: operador crea solicitud de permisos.
- Resultado esperado: notificacion que requiere accion.

21. `operation-request-reviewed`
- Casuistica: admin revisa solicitud (aprueba/rechaza).
- Resultado esperado: notificacion de solicitud revisada.

22. `manual-fixed`
- Casuistica: crear notificacion manual fija.
- Resultado esperado: notificacion fija activa.

23. `manual-action`
- Casuistica: crear notificacion manual con accion.
- Resultado esperado: notificacion activa con `requiresAction=true`.

24. `manual-due`
- Casuistica: crear notificacion manual con vencimiento.
- Resultado esperado: notificacion activa con `dueAt`.

---

## Casos especificos de stock configurable

1. Umbral por categoria
- Configurar `bebida = 10` en pestaña `Stock minimo`.
- Dejar stock de una bebida en `9`.
- Esperado: `product-low-stock`.

2. Override por producto
- Mantener `bebida = 10`.
- Configurar `Coca-Cola = 30`.
- Dejar stock de Coca-Cola en `29`.
- Esperado: `product-low-stock` para Coca-Cola aunque otras bebidas usen 10.

3. Recuperacion de stock
- Con notificacion activa de stock bajo, cargar stock y superar umbral.
- Esperado: notificacion de stock bajo pasa a `received`.

