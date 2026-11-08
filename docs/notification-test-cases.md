# Casos de prueba de notificaciones

Actualizado: 2026-11-07. Verificado contra el codigo actual del repositorio.

## Modelo actual

- Estados validos: `active`, `disabled`, `received`
- Vista operador: solo lectura, sin acciones de estado
- Vista admin: puede marcar `received`, `disabled` o volver a `active`
- Algunas notificaciones fijas se cierran solas cuando la entidad vinculada deja de requerir accion

Casos de autocierre ya presentes:

- `product-low-stock` pasa a `received` si el stock vuelve a quedar en el minimo configurado o por encima
- `supply-pending-receive` pasa a `received` al recepcionar el pedido proveedor
- la notificacion de accion ligada a una solicitud operativa se marca `received` al resolver la solicitud

## Como generar ejemplos automaticamente

### Desde la UI

1. Ir a `Menu > Notificaciones`
2. Pestaña `Crear`
3. Click en `Generar casos de prueba y ejemplos`
4. Revisar `Listado`, `Requieren accion` y `Vencimientos y fijas`

### Desde backend

- `POST /notifications/generate-test-cases`

## Casos por tipo

### Licencias

1. `license-required`
- Caso: crear o editar una licencia sin expedicion ni vencimiento valido, dejando el estado pendiente de regularizacion.
- Esperado: notificacion fija, normalmente con accion administrativa pendiente.

2. `license-expiring`
- Caso: crear o renovar una licencia con vencimiento cercano segun `leadDays`.
- Esperado: notificacion activa con `dueAt`.

### Productos y stock

3. `product-expiring`
- Caso: registrar stock con `expirationDate`.
- Esperado: notificacion activa con fecha calculada desde el vencimiento y el anticipo configurado.

4. `product-low-stock`
- Caso: dejar el stock total de un producto por debajo del minimo de categoria o del override por producto.
- Esperado: notificacion fija activa, normalmente con accion de reposicion.

5. `price-changed`
- Caso: registrar nuevo precio desde `Prices` o desde gestion de producto.
- Esperado: notificacion activa informativa.

6. `product-created`
- Caso: crear un producto.
- Esperado: notificacion activa informativa.

7. `stock-created`
- Caso: registrar ingreso o egreso de stock.
- Esperado: notificacion activa informativa.

### Gastos, ventas y caja

8. `expense-created`
- Caso: crear un gasto.
- Esperado: notificacion activa con duracion configurable.

9. `sale-created`
- Caso: completar una venta pagada.
- Esperado: notificacion activa con duracion configurable.

10. `cash-opened`
- Caso: abrir caja o jornada.
- Esperado: notificacion activa informativa.

11. `cash-closed`
- Caso: cerrar jornada.
- Esperado: notificacion activa informativa.

12. `cash`
- Caso: solicitar cierre con diferencias o dejar una revision pendiente.
- Esperado: notificacion activa que requiere accion y queda visible para admin.

### Pedidos a proveedor

13. `supply-requested`
- Caso: crear pedido a proveedor.
- Esperado: notificacion activa informativa.

14. `supply-approved`
- Caso: aprobar una solicitud de mercaderia y asociarla a un pedido proveedor.
- Esperado: notificacion activa informativa.

15. `supply-pending-receive`
- Caso: crear pedido proveedor pendiente de recepcion.
- Esperado: notificacion fija activa hasta que el pedido sea recibido.

16. `supply-received`
- Caso: recepcionar mercaderia.
- Esperado: notificacion activa informativa y cierre de la pendiente asociada.

### Usuarios

17. `user-created`
- Caso: alta de usuario.
- Esperado: notificacion activa informativa.

18. `user-updated`
- Caso: modificacion de usuario.
- Esperado: notificacion activa informativa.

19. `user-deleted`
- Caso: baja de usuario.
- Esperado: notificacion activa informativa.

### Solicitudes operativas

20. `operation-request-merchandise`
- Caso: operador crea una solicitud de mercaderia con items.
- Esperado: notificacion activa que requiere accion.

21. `operation-request-permissions`
- Caso: operador crea una solicitud de permisos.
- Esperado: notificacion activa que requiere accion.

22. `operation-request-reviewed`
- Caso: admin aprueba o rechaza una solicitud operativa.
- Esperado: notificacion activa informativa hacia el circuito de seguimiento.

### Manuales

23. `manual-fixed`
- Caso: crear una notificacion manual fija.
- Esperado: notificacion activa, `isFixed=true`.

24. `manual-action`
- Caso: crear una notificacion manual con accion.
- Esperado: notificacion activa, `requiresAction=true`.

25. `manual-due`
- Caso: crear una notificacion manual con vencimiento.
- Esperado: notificacion activa con `dueAt`.

## Casos de estado

### Marcar recibida

- Precondicion: entrar como admin y elegir una notificacion `active`
- Accion: `Marcar recibida`
- Esperado:
  - `status=received`
  - queda visible en el filtro de recibidas
  - la accion desaparece si se recarga la lista

### Deshabilitar

- Precondicion: entrar como admin y elegir una notificacion `active`
- Accion: `Deshabilitar`
- Esperado:
  - `status=disabled`
  - aparece badge de deshabilitada
  - sale de las listas que filtran solo activas

### Reactivar

- Precondicion: entrar como admin y elegir una notificacion `disabled`
- Accion: `Reactivar`
- Esperado:
  - `status=active`
  - vuelve a aparecer en las listas activas

## Casos especificos de minimo de stock

### Minimo por categoria

1. Configurar `bebida = 10` en `Stock minimo`
2. Dejar una bebida en `9`
3. Esperado: `product-low-stock`

### Override por producto

1. Mantener `bebida = 10`
2. Configurar un producto puntual en `30`
3. Dejar ese producto en `29`
4. Esperado: `product-low-stock` para ese producto aunque la categoria tenga otro minimo

### Recuperacion de stock

1. Tener una notificacion activa de stock bajo
2. Cargar stock hasta alcanzar o superar el minimo
3. Esperado: la notificacion pasa automaticamente a `received`

## Casos especificos de pedidos proveedor

### Pendiente de recepcion

1. Crear un pedido proveedor
2. Verificar que aparezca `supply-pending-receive`
3. Recepcionar el pedido
4. Esperado:
  - se crea `supply-received`
  - la pendiente previa pasa a `received`

## Casos especificos de solicitudes operativas

### Solicitud de mercaderia

1. Operador crea solicitud con items
2. Admin la aprueba o rechaza
3. Esperado:
  - la notificacion inicial de accion se resuelve
  - se crea `operation-request-reviewed`
  - si se aprueba con pedido asociado, aparece tambien `supply-approved`

## Tipos actuales soportados por el sistema

- `license-required`
- `license-expiring`
- `product-expiring`
- `product-low-stock`
- `expense-created`
- `sale-created`
- `supply-requested`
- `supply-approved`
- `supply-received`
- `supply-pending-receive`
- `cash-opened`
- `cash-closed`
- `cash`
- `user-created`
- `user-updated`
- `user-deleted`
- `price-changed`
- `product-created`
- `stock-created`
- `operation-request-merchandise`
- `operation-request-permissions`
- `operation-request-reviewed`
- `manual-fixed`
- `manual-action`
- `manual-due`

## Casos actuales de ingredientes, compras y respaldos

- Cargar ingredientes por `/ingredient-stock-entries`: se registran movimientos con vencimiento y se usa el generador existente stock-created/product-expiring. Cuando el identificador corresponde solo a un ingrediente, product-low-stock no se crea porque su sincronizador busca un registro de products.
- purchaseTotal genera una transaccion financiera stock-purchase, no un tipo nuevo de notificacion. Un costo negativo invalida el lote sin crear movimientos ni avisos parciales.
- minStockQuantity del ingrediente se usa para resaltar Inventario; no existe aun un aviso automatico que liste recetas afectadas por ese ingrediente.
- Un ingrediente opcional quitado no se consume: validar que no dispare por ese descuento un aviso de producto bajo. Los obligatorios no pueden excluirse mediante API.
- Los respaldos por bloques distribuyen notificaciones por entidad/tipo: producto en Catalogo, stock/ingrediente en Stock y restantes en Operaciones. Reemplazar un bloque reemplaza tambien sus avisos.
- Generar ejemplos modifica la base activa; usar una base de pruebas. La suite Playwright usa DATA_ROOT temporales y no necesita estos ejemplos para comprobar carga y ventas.

Relacion con entidades y futuras tablas: [Diccionario de datos](data-dictionary.md).
