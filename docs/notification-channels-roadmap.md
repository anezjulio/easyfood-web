# Roadmap de notificaciones por canal

## Punto de partida real del proyecto

EasyFood ya tiene un canal in-app funcionando. No se parte de cero.

Hoy existen:

- registros persistidos en `notifications`
- estados `active`, `disabled`, `received`
- configuraciones por tipo en `notificationSettings`
- minimos de stock por categoria y por producto en `stockThresholdSettings`
- generacion automatica desde ventas, caja, gastos, stock, pedidos, usuarios, licencias y solicitudes
- autocierre de algunos avisos fijos cuando la entidad relacionada deja de requerir accion

Por eso, el trabajo futuro de email, Telegram o WhatsApp no debe reinventar el modelo base. Debe extenderlo.

## Regla de arquitectura

El envio por canales externos no debe salir desde el frontend React ni desde codigo pensado solo para Vite dev server.

Motivos:

- credenciales y tokens no deben vivir en navegador
- hacen falta reintentos y auditoria
- hacen falta webhooks o estados asincronicos
- los proveedores externos requieren logica server-side

La salida correcta es mover el despacho multicanal a un backend real, worker o funcion serverless.

## Modelo recomendado

### Mantener `notification` como evento base

La entidad actual ya representa correctamente el hecho de negocio:

- tipo
- titulo
- descripcion
- referencia a entidad
- fecha de creacion
- fecha de vencimiento opcional
- si es fija
- si requiere accion
- estado funcional dentro de la app

### Agregar una capa de entregas

Sugerencia minima:

- `notification_delivery`
  - `id`
  - `notificationId`
  - `channel`
  - `recipient`
  - `provider`
  - `providerMessageId`
  - `status`
  - `attemptCount`
  - `lastError`
  - `createdAt`
  - `sentAt`
  - `deliveredAt`
  - `readAt`

Estados sugeridos para la entrega:

- `pending`
- `queued`
- `sent`
- `delivered`
- `read`
- `failed`
- `cancelled`

## Separacion de responsabilidades

### Backend de negocio

Responsable de:

- crear la notificacion base
- resolver destinatarios
- decidir canales habilitados
- persistir entregas

### Dispatcher o worker

Responsable de:

- tomar entregas pendientes
- aplicar reintentos con backoff
- ejecutar adapters por canal
- guardar auditoria y errores
- evitar duplicados

### Adapters por canal

Responsables de:

- transformar el mensaje al formato del proveedor
- enviar
- devolver metadata tecnica del proveedor

## Como aprovechar lo que ya existe

La evolucion correcta seria:

1. Mantener `notifications` como fuente de verdad funcional.
2. Crear `notification_delivery` para email, Telegram y WhatsApp.
3. Mapear que tipos deben disparar entregas externas.
4. No mezclar el estado funcional in-app con el estado tecnico de una entrega.

Ejemplo:

- una notificacion puede quedar `active` en la app
- y al mismo tiempo tener entregas `sent` en Telegram y `failed` en email

## Eventos actuales que ya podrian despacharse

Entre los tipos existentes con mejor valor para canales externos:

- `product-low-stock`
- `license-expiring`
- `license-required`
- `cash`
- `supply-pending-receive`
- `operation-request-merchandise`
- `operation-request-permissions`

Los tipos mas informativos, como `sale-created` o `price-changed`, probablemente no merecen salir por todos los canales desde el dia uno.

## Configuracion recomendada

Separar configuracion funcional de configuracion tecnica:

### Ya existe hoy

- `notificationSettings`: lead days y duration days por tipo
- `stockThresholdSettings`: umbrales que disparan ciertos avisos

### Faltaria agregar

- `notificationChannelConfig`
  - `channel`
  - `enabled`
  - `defaultRecipient`
  - `settingsJson`

- `notificationRoutingRule`
  - `notificationType`
  - `channels[]`
  - `severity`
  - `recipientStrategy`

## Orden sugerido de implementacion

### Fase 1

- extraer el despacho de notificaciones a backend real
- conservar el modelo actual de `notifications`
- crear `notification_delivery`
- agregar email como primer canal externo

### Fase 2

- agregar Telegram para alertas internas
- sumar historial de entregas y test de envio

### Fase 3

- evaluar WhatsApp solo si existe necesidad real de lectura inmediata o contacto externo

## Reglas operativas recomendadas

- no despachar desde frontend
- cada entrega debe quedar auditada
- cada canal debe tener su propio estado
- aplicar idempotencia para evitar dobles envios
- permitir desactivar canales por tipo o por destinatario
- no bloquear la transaccion principal del negocio por una falla en el proveedor externo

## Pantallas futuras razonables

- `/notifications/channels`
  - configuracion por canal

- `/notifications/deliveries`
  - historial tecnico de entregas

- `/notifications/routing`
  - reglas por tipo de evento

## Conclusion practica

La base funcional de notificaciones ya existe y esta bastante avanzada. Lo que falta no es "hacer notificaciones", sino sumar una capa de despacho multicanal server-side encima del modelo actual, sin romper el flujo in-app que ya usa la operacion diaria.
