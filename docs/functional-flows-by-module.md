# Flujos funcionales y casos de uso por modulo

Actualizado: 2026-11-07. Verificado contra el codigo actual del repositorio.

## Objetivo

Este documento resume lo que hoy cubre la aplicacion desde el punto de vista funcional. La referencia es el comportamiento actual del frontend y del mock backend en `server/api.ts`.

## Roles actuales

- `admin`
- `operator`
- `terminal`

La mayoria de los modulos operativos pueden ser usados por `admin` y `operator`, pero varias pantallas administrativas filtran o amplian capacidades cuando el usuario es `admin`. El rol `terminal` queda acotado al flujo de autoventa y a la salida controlada de la terminal.

## Mapa general de modulos

- Acceso y sesion
- Menu operativo
- Creacion de menu
- Productos
- Precios
- Finanzas
- Usuarios
- Stock
- Ventas y resumen
- Autoventa
- Caja
- Jornadas
- Balance y reportes
- Transacciones
- Pedidos a proveedor
- Recepcion de mercaderia
- Solicitudes operativas
- Aprobacion de solicitudes
- Gastos
- Feedback
- Licencias
- Notificaciones
- Data
- Ayuda

## Acceso y sesion

Ruta: `/login`

Flujos cubiertos:

- ingreso con usuario y contrasena contra la base activa
- resolucion de rol `admin` u `operator`
- sesion protegida para el resto de las rutas
- cierre de sesion y reseteo del estado de caja por usuario

Casos de uso:

- login rapido de desarrollo con `admin / 1234`
- rechazo por credenciales invalidas
- proteccion de rutas via `RequireAuth`

## Menu operativo

Ruta: `/operation`

Flujos cubiertos:

- entrada principal luego del login
- acceso a modulos por bloques operativos y administrativos
- visualizacion de alertas/notificaciones relevantes en portada
- ocultamiento de accesos administrativos para operadores

Casos de uso:

- operador navega a ventas, stock, caja, pedidos, solicitudes y gastos
- admin navega ademas a usuarios, finanzas, aprobaciones, licencias, data, transacciones y notificaciones

## Creacion de menu

Ruta: `/menu-products`

Flujos cubiertos:

- alta y edicion de productos vendibles con receta
- alta y edicion de combos con productos fijos o categoria a eleccion
- creacion, renombrado, orden numerico y baja de categorias comerciales de menu
- edicion directa de gramos/unidades por receta y obligatoriedad por ingrediente
- un unico ingrediente es obligatorio; en recetas multiples solo los opcionales pueden quitarse en la venta
- visualizacion de productos y combos por categoria seleccionada
- reasignacion de productos/combos a otra categoria o asignacion directa desde disponibles

Casos de uso:

- admin agrega una categoria nueva para organizar la venta
- admin selecciona una categoria y mueve productos o combos entre categorias
- el sistema bloquea eliminar una categoria que todavia tiene productos, combos o elecciones de combo vinculadas

## Productos

Ruta: `/products/new`

Flujos cubiertos:

- alta de producto
- edicion de producto existente
- carga de imagen
- generacion o ingreso manual de codigo de barras
- asignacion de categoria
- calculo y ajuste de precio, costo y margen
- filtrado, orden y consulta de stock actual
- baja directa o solicitud de baja segun rol

Casos de uso:

- admin crea producto con margen por categoria o override por producto
- admin elimina producto directamente
- operador edita informacion permitida y solicita baja si corresponde
- usuario consulta existencia y ultimo ingreso desde la tabla

## Precios

Ruta: `/prices`

Flujos cubiertos:

- actualizacion de costo y precio de venta
- historial de cambios de precio
- configuracion de margenes por categoria
- configuracion de margen especifico por producto

Casos de uso:

- ajustar precios por inflacion o costo proveedor
- revisar cambios historicos
- dejar una categoria con margen base y excepciones puntuales

## Finanzas

Ruta: `/finances`

Flujos cubiertos:

- ajuste de margenes comerciales
- configuracion de descuento o recargo por metodo de pago
- configuracion de IVA y su modo de aplicacion

Casos de uso:

- admin modifica descuento por efectivo
- admin agrega recargo a tarjeta
- admin cambia modo de IVA para ventas

## Usuarios

Ruta: `/users`

Flujos cubiertos:

- alta de usuario
- edicion de datos y password
- definicion de horario operativo
- baja de usuario

Casos de uso:

- crear operador con rango horario habilitado
- corregir password o email
- desactivar personal que ya no opera

## Ingredientes, inventario y carga de stock

Rutas: `/ingredients`, `/inventory`, `/stock/ingredients` y `/stock`.

- Ingredientes define nombre, modalidad (unidad, peso o paquete), categoria de materia prima, conservacion y gramos por porcion.
- Cargar stock de ingredientes muestra enlaces Ver ingredientes, Ver productos y Ver inventario; esas pantallas tienen enlace Cargar stock.
- La barra combina busqueda, Categoria de ingrediente, Por unidad, Por peso y Guardar ingresos. Pulsar nuevamente el filtro activo vuelve a todos. Por unidad incluye paquetes.
- Categorias de ingredientes son Carnes, Lacteos, Panificados u otras que se configuren; no son categorias del menu. Sin categoria significa categoryId ausente o desconocido.
- La tabla contiene ingrediente, costo total de compra, vencimiento, cantidad recibida, stock actual y porciones. No hay resumen superior ni columna editable de unidad.
- El peso se carga en kg; el servidor convierte a gramos. Unidades y paquetes se ingresan como enteros. La receta descuenta gramos directos.
- Costo es el total pagado por la cantidad de esa fila en ARS, no un precio por kg. Se admite cero y hasta dos decimales.
- Guardar valida el lote completo y agrega movimientos y saldo de ingredientes. Procesa tambien filas con cantidad que hayan quedado ocultas por filtros.
- Porciones muestra floor(stockQuantity / portionSizeGrams) para peso; sin gramos configurados muestra Sin configurar; para unidades no aplica. No reemplaza el calculo de disponibilidad de una receta completa.
- El costo del ingreso aparece como egreso stock-purchase en Transacciones, cuenta Gastos. No altera automaticamente efectivo ni precio de venta.
- El flujo anterior de Inventario conserva carga separada de movimiento y saldo; el flujo por lote es el apropiado para la carga nueva.
- `/stock?tab=products` conserva el formulario general de productos kiosko/mercancia y su vinculo con pedidos proveedor.

## Ventas

Ruta: `/sales`. Requiere caja abierta.

1. Buscar y filtrar tarjetas agrupadas por categoria, a la derecha; el pedido se presenta a la izquierda en escritorio.
2. Las categorias se ordenan por order. Configuracion inicial: Combos, Hamburguesas, Panchos, Bebidas, Extras y las demas al fondo. En empate se usa el nombre.
3. Solo en las tarjetas se oculta el prefijo Hamburguesa, mediante una regla de codigo. Panchos, nombre interno, orden y comprobante conservan sus nombres completos. Los precios se alinean a la derecha y se destacan.
4. Seleccionar muestra ingredientes fijos y casillas de ingredientes opcionales. No aparece la etiqueta Obligatorio. En combos, primero se muestran productos de varios ingredientes; despues los simples y las elecciones pendientes.
5. + suma y - resta la cantidad indicada para la misma configuracion de producto, opciones y exclusiones. Cero elimina esa linea. Doble clic tambien agrega; exige resolver opciones pendientes y respeta stock.
6. Agregar, doble clic y guardar cambios mantienen seleccion, cantidad e ingredientes/opciones. Editar modifica la linea existente; Quitar elimina la linea completa y se destaca en rojo. Los botones del pedido se alinean a la derecha.
7. Ir a cobrar crea una orden por pagar. El carrito aun no descuenta materiales ni constituye una reserva compartida entre cajas.
8. Confirmar cobro marca pagada y aplica el consumo en el servidor. Factura y asociacion a jornada se solicitan por separado. Exclusiones se conservan en el resumen y el recibo.
9. Volver al pedido desde el cobro cancela esa orden pendiente y conserva el carrito editable. Las pendientes vencen automaticamente segun configuracion.

La cantidad de ingredientes compartidos se acumula para controlar disponibilidad. Si allowOutOfStockSales esta activo, se omite el bloqueo por existencias; no se omiten las validaciones de composicion ni de ingredientes obligatorios.

## Autoventa

Ruta: `/autoventa`

Flujos cubiertos:

- navegacion de productos por categorias disponibles
- armado de carrito desde una terminal dedicada
- revision de cantidades y stock disponible
- creacion de orden pendiente sin exigir jornada de caja abierta
- seleccion de metodo de pago con descuentos o recargos configurados
- aprobacion o rechazo del pago dentro de la ventana temporal
- facturacion, descuento de stock y generacion de resumen imprimible
- cierre de terminal protegido por contrasena de un usuario `admin` u `operator`

Casos de uso:

- usuario `terminal` opera solo la pantalla de autoventa
- admin puede entrar a autoventa para validar o probar el flujo
- una compra pendiente se rechaza automaticamente al cerrar la terminal
- una orden pendiente expira si no se aprueba o rechaza a tiempo

## Resumen de venta y recibo

Ruta: `/sales/summary`

Flujos cubiertos:

- visualizacion final de la venta
- impresion de recibo
- generacion persistida de HTML de recibo

Casos de uso:

- reimprimir la informacion inmediata de una venta recien cerrada
- guardar comprobante HTML en la base activa

## Caja

Ruta: `/cash`

Flujos cubiertos:

- apertura de caja o jornada
- validacion de monto y franja horaria para operadores
- consulta del estado actual de caja
- solicitud de cierre por operador
- auditoria administrativa del cierre
- gestion de asignaciones de apertura por operador

Casos de uso:

- operador abre caja con monto asignado
- operador solicita cierre informando efectivo declarado
- admin revisa ventas, gastos, mercaderia y diferencias antes de cerrar
- admin define montos y turnos de apertura por operador

## Jornadas

Ruta: `/workdays`

Flujos cubiertos:

- listado historico de jornadas
- filtros y ordenamiento
- detalle expandido de ordenes ligadas a cada jornada

Casos de uso:

- revisar un dia cerrado
- auditar que ordenes entraron en cada jornada

## Balance y reportes

Ruta: `/balance`

Flujos cubiertos:

- resumen por jornadas
- vistas de ventas, gastos y mercaderia
- lectura de cuentas y transacciones
- seguimiento de caja con foco administrativo

Casos de uso:

- admin revisa resultado diario, semanal o mensual
- admin compara ingresos y egresos por modulo
- admin navega desde el balance a jornadas para profundizar un desvio

## Transacciones

Ruta: `/transactions`

Flujos cubiertos:

- lectura consolidada de cuentas financieras derivadas
- lectura consolidada de transacciones
- filtro por cuenta, direccion, tipo y busqueda libre

Casos de uso:

- revisar ingresos de ventas
- revisar egresos por gastos, pedidos proveedor o compras de stock con purchaseTotal
- filtrar la cuenta Gastos para compras directas de ingredientes; el filtro inicial de Transacciones es Caja local
- seguir aperturas y cierres de caja en el libro derivado

## Pedidos a proveedor

Ruta: `/supplies/orders`

Flujos cubiertos:

- alta de pedido proveedor
- carga de items desde catalogo
- creacion inline de producto si todavia no existe
- edicion de pedido pendiente
- cancelacion de pedido pendiente
- clonado o repeticion de pedido previo

Casos de uso:

- admin arma un pedido nuevo con varios productos
- admin corrige cantidades antes de recibir
- usuario vuelve a pedir una orden similar anterior

## Recepcion de mercaderia

Ruta: `/supplies/receiving`

Flujos cubiertos:

- seleccion de pedido pendiente
- ingreso de monto real
- confirmacion de si el monto fue exacto o no
- carga obligatoria de imagen de factura
- registro de faltantes por item
- carga de vencimiento por item recibido
- generacion automatica de ingresos de stock

Casos de uso:

- recepcion exacta del pedido
- recepcion parcial con faltantes y comentario obligatorio
- alta automatica del stock recibido

## Solicitudes operativas

Ruta: `/requests`

Flujos cubiertos:

- historial de solicitudes
- creacion de solicitud de mercaderia
- creacion de solicitud de permisos
- edicion de solicitud pendiente propia
- cancelacion de solicitud pendiente propia

Casos de uso:

- operador pide reposicion de productos concretos con cantidad
- operador deja una solicitud de permisos o excepcion operativa
- admin ve todas las solicitudes; operador solo las propias

## Aprobacion de solicitudes

Ruta: `/requests/approvals`

Flujos cubiertos:

- listado de solicitudes pendientes
- historial de solicitudes resueltas
- aprobacion o rechazo por admin
- edicion de items antes de aprobar una solicitud de mercaderia
- generacion de pedido proveedor asociado
- carga de comentario de revision

Casos de uso:

- admin aprueba solicitud de mercaderia y la convierte en pedido proveedor
- admin rechaza solicitud dejando comentario
- admin revisa historico con referencia al pedido generado

## Gastos

Ruta: `/expenses`

Flujos cubiertos:

- alta de gasto
- carga opcional de imagen de factura
- carga opcional de foto de imprevisto
- confirmacion posterior del gasto
- confirmacion con monto asignado o monto diferente
- historial con filtros

Casos de uso:

- admin registra un gasto recurrente
- admin registra un gasto imprevisto con evidencia fotografica
- admin u operador confirma el gasto
- si cambia el monto final, se exige comentario

## Feedback

Ruta: `/feedback`

Flujos cubiertos:

- alta de sugerencia
- alta de reclamo
- envio anonimo o nominal
- consulta del libro completo para admin

Casos de uso:

- operador deja reclamo anonimo
- admin registra una sugerencia y luego revisa estadisticas y filtros

## Licencias

Ruta: `/licenses`

Flujos cubiertos:

- alta de licencia o permiso
- edicion de datos de contacto y fechas
- registro de emisiones o renovaciones
- filtrado por categoria y estado derivado

Casos de uso:

- admin carga un permiso nuevo
- admin renueva una licencia vencida
- admin revisa documentos por vencer o pendientes

## Notificaciones

Ruta: `/notifications`

Flujos cubiertos:

- visualizacion global de notificaciones
- filtro por tipo, estado y fecha
- listado de avisos que requieren accion
- listado de avisos con vencimiento o fijos
- ajuste de lead/duration por tipo
- ajuste de minimo por categoria y producto
- alta manual de notificaciones
- generacion de ejemplos de prueba
- cambio de estado por admin

Casos de uso:

- operador revisa avisos en modo solo lectura
- admin deshabilita una notificacion
- admin reabre una notificacion deshabilitada
- admin configura minimos de stock para disparo de alertas

## Data

Ruta: `/data`, solo admin.

- Pestana DDBB (inicial): listar, crear, importar respaldos completos, descargar archivo de base, activar y limpiar. Crear/importar por esta via activa la nueva base.
- Pestana Bloques de datos: exportar Productos/Catalogo, Operaciones o Stock desde una base elegida.
- Elegir una base existente o archivo anterior para cada bloque; combinar hasta un origen por bloque.
- Revisar cantidades y referencias antes de confirmar. Los IDs deben ser compatibles; no se renombran para unir catalogos distintos.
- Crear una base combinada o reemplazar bloques de una existente. Los bloques no seleccionados se conservan; no se suman existencias. La base activa no cambia.
- Se genera respaldo previo al reemplazo. Los respaldos nuevos de bloques incluyen imagenes o recibos segun corresponda; un archivo .js antiguo no puede recuperar medios que no contiene.
- Catalogo sin stock permite reutilizar productos, categorias, recetas, reglas required, combos, precios y orden de categorias con existencias cero.

Distribucion exacta: [Diccionario de datos](data-dictionary.md).

## Ayuda

Ruta: `/help`

Flujos cubiertos:

- consulta de ayuda dentro de la app
- contenido filtrado por rol
- recorrido funcional de modulos principales

Casos de uso:

- operador consulta como usar ventas o caja
- admin repasa configuraciones y modulos administrativos

## Flujos transversales que atraviesan varios modulos

### Venta completa

1. Caja abierta
2. Carga de productos al carrito
3. Orden pendiente
4. Pago aprobado
5. Consumo de materiales al confirmar el pago
6. Factura solicitada por una segunda operacion
7. Orden agregada a jornada
8. Registro financiero derivado
9. Notificacion de venta
10. Posibilidad de imprimir recibo

### Solicitud de mercaderia hasta recepcion

1. Operador crea solicitud con items
2. Admin revisa y aprueba
3. Se genera pedido proveedor
4. El pedido queda pendiente de recepcion
5. Se recibe mercaderia con factura y faltantes si aplica
6. Se generan ingresos de stock
7. Se cierran notificaciones pendientes y se crean nuevas de seguimiento

### Gasto completo

1. Admin crea gasto
2. El gasto queda pendiente
3. Admin u operador confirma
4. Si el monto cambia, queda comentario obligatorio
5. Se actualiza el libro financiero derivado
6. Queda trazabilidad en historial

### Apertura y cierre de caja

1. Se valida asignacion y horario del operador
2. Se abre jornada con monto inicial
3. Durante la jornada se agregan ventas
4. Operador solicita cierre con efectivo declarado
5. Admin revisa diferencias
6. Se cierra jornada
7. Se generan notificaciones y transacciones derivadas segun el resultado

## Alcance actual

El flujo actual incluye catalogo, recetas, inventario, ventas y costos de compra. Siguen pendientes las transacciones concurrentes de pago/stock, la devolucion de materiales, el consumo por lotes/vencimiento y la unificacion completa de caminos heredados. Autoventa comparte endpoints, pero su disponibilidad visual usa existencia del producto y no replica todo el editor de recetas de Ventas.
