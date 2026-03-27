# Flujos funcionales y casos de uso por modulo

## Objetivo

Este documento resume lo que hoy cubre la aplicacion desde el punto de vista funcional. La referencia es el comportamiento actual del frontend y del mock backend embebido en `vite.config.ts`.

## Roles actuales

- `admin`
- `operator`

La mayoria de los modulos operativos pueden ser usados por ambos perfiles, pero varias pantallas administrativas filtran o amplian capacidades cuando el usuario es `admin`.

## Mapa general de modulos

- Acceso y sesion
- Menu operativo
- Productos
- Precios
- Finanzas
- Usuarios
- Stock
- Ventas y resumen
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

## Stock

Ruta: `/stock`

Flujos cubiertos:

- ingreso de stock sobre producto existente
- alta de producto nuevo e ingreso en el mismo flujo
- asociacion opcional a pedido proveedor ya recibido
- carga de fecha de vencimiento
- ajuste de costo y precio al ingresar mercaderia

Casos de uso:

- reponer stock de un producto existente
- crear un producto nuevo en la primera recepcion
- ingresar stock resultante de una orden recibida
- dejar actualizado precio/costo al momento del ingreso

Reglas visibles:

- para ingreso positivo se exige fecha de vencimiento
- el producto puede disparar o resolver alerta de stock bajo

## Ventas

Ruta: `/sales`

Flujos cubiertos:

- lectura por codigo de barras o busqueda manual
- armado de carrito con multiples items
- edicion de cantidades
- calculo total segun metodo de pago y configuracion fiscal
- creacion de orden pendiente
- aprobacion o rechazo de pago dentro de una ventana temporal
- facturacion
- descuento automatico de stock
- vinculacion de la venta a la jornada abierta

Casos de uso:

- operador cobra en efectivo, debito, credito o Mercado Pago
- el sistema rechaza venta si no hay caja abierta
- un pago pendiente vence automaticamente si no se resuelve a tiempo

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
- revisar egresos por gastos o pedidos proveedor
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

Ruta: `/data`

Flujos cubiertos:

- listado de bases configuradas
- creacion de nueva base
- cambio de base activa
- limpieza de la base activa
- visualizacion de paths de DB, imagenes y recibos

Casos de uso:

- admin crea una base nueva para otra sucursal o entorno
- admin cambia el store activo
- admin limpia el store operativo actual conservando configuraciones y usuarios

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
5. Factura
6. Movimiento de stock
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

El sistema cubre ya una operacion bastante completa de tienda: alta de productos, stock, ventas, caja, pedidos, recepcion, gastos, feedback, licencias, notificaciones y administracion de bases. Lo que falta es principalmente endurecer arquitectura y separar backend real, no definir los flujos funcionales base.
