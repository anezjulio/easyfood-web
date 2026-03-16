# Roadmap de Notificaciones: WhatsApp, Email y Telegram

## Objetivo

Documentar una implementacion futura para enviar notificaciones de EasyCommerce por varios canales:

- notificacion dentro de la plataforma
- email
- Telegram
- WhatsApp

La idea es que, cuando se retome este trabajo, exista una base clara de arquitectura, requisitos y pasos de implementacion.

## Principio de diseno

Las notificaciones no deben salir desde el frontend React/Vite.

La razon:

- las credenciales de proveedores no pueden vivir en el navegador
- los webhooks deben resolverse del lado servidor
- hace falta auditoria, reintentos y control de errores

Por lo tanto, el envio real debe ocurrir en un backend, worker o funcion serverless.

## Arquitectura recomendada

### Flujo general

1. Ocurre un evento de negocio.
2. El sistema crea una notificacion base en base de datos.
3. Un dispatcher decide por que canales se debe enviar.
4. Cada canal genera una entrega independiente.
5. Cada entrega se envia por su proveedor.
6. El sistema actualiza estado de entrega, errores y auditoria.

### Ejemplos de eventos

- stock bajo
- pedido creado
- pedido pagado
- cierre de caja solicitado
- licencia por vencer
- error operativo critico

### Modelo conceptual

- `notification`
  - representa el evento de negocio
- `notification_delivery`
  - representa el envio por canal y destinatario
- `notification_channel_config`
  - representa configuraciones por canal

## Modelo de datos sugerido

### `notification`

- `id`
- `type`
- `title`
- `message`
- `severity`
- `entityType`
- `entityId`
- `payloadJson`
- `createdAt`
- `createdBy`

### `notification_delivery`

- `id`
- `notificationId`
- `channel`
- `recipient`
- `provider`
- `providerMessageId`
- `status`
- `attemptCount`
- `lastError`
- `sentAt`
- `deliveredAt`
- `readAt`
- `failedAt`
- `createdAt`

Estados sugeridos:

- `pending`
- `queued`
- `sent`
- `delivered`
- `read`
- `failed`
- `cancelled`

### `notification_channel_config`

- `id`
- `channel`
- `enabled`
- `defaultRecipient`
- `settingsJson`
- `createdAt`
- `updatedAt`

## Servicio sugerido

### `NotificationService`

Responsabilidades:

- crear notificaciones
- normalizar el payload
- decidir canales habilitados
- crear entregas
- delegar envio a adapters por canal

### `NotificationDispatcher`

Responsabilidades:

- tomar entregas pendientes
- aplicar reintentos
- registrar auditoria
- evitar duplicados

### Adapters por canal

- `EmailNotificationChannel`
- `TelegramNotificationChannel`
- `WhatsAppNotificationChannel`

Cada adapter debe implementar una interfaz comun, por ejemplo:

```ts
type NotificationChannel = {
  send(input: {
    notificationId: string;
    recipient: string;
    title: string;
    message: string;
    payload?: Record<string, unknown>;
  }): Promise<{
    providerMessageId?: string;
    status: "sent" | "failed" | "queued";
    raw?: unknown;
  }>;
};
```

## Reglas operativas recomendadas

- no enviar desde UI
- todo envio debe quedar auditado
- cada canal debe tener su propio estado
- aplicar reintentos con backoff
- hacer idempotencia para evitar dobles envios
- permitir desactivar canales por configuracion
- permitir distintos destinatarios por tipo de alerta

## Implementacion por canal

## Email

### Cuando conviene

- alertas formales
- multiples destinatarios
- auditoria sencilla
- reportes o contenido mas largo

### Requisitos

- dominio propio o subdominio para envio
- configuracion DNS
- proveedor de email transaccional o SMTP
- credenciales seguras del lado servidor

### Opciones tecnicas

- API de proveedor de email
- SMTP con libreria como Nodemailer

### Flujo

1. Se resuelve el destinatario.
2. Se arma asunto y cuerpo.
3. Se envia por API o SMTP.
4. Se guarda `providerMessageId`.
5. Se escuchan webhooks de entrega o rechazo si el proveedor los soporta.

### Datos utiles a guardar

- email destino
- subject
- provider
- providerMessageId
- estado
- ultimo error

### Variables de entorno posibles

```env
EMAIL_ENABLED=true
EMAIL_PROVIDER=resend
EMAIL_FROM=alertas@notificaciones.tudominio.com
EMAIL_REPLY_TO=soporte@tudominio.com
EMAIL_API_KEY=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
```

### Observaciones

- si se necesita resolver rapido, email suele ser el canal mas simple y robusto
- para alertas internas, puede convivir con Telegram

## Telegram

### Cuando conviene

- alertas internas
- mensajes rapidos
- costo bajo
- grupos de operadores o admins

### Requisitos

- crear un bot con BotFather
- obtener el bot token
- obtener el `chat_id` del usuario o grupo

### Flujo recomendado

1. Crear bot.
2. Hacer que el usuario le escriba al bot o agregarlo a un grupo.
3. Capturar el `chat_id`.
4. Guardar ese `chat_id` en configuracion.
5. Enviar mensajes usando `sendMessage`.

### Implementacion sugerida

Para alertas internas, lo mas practico es un grupo privado, por ejemplo:

- `Alertas EasyCommerce`

Ventajas:

- un solo `chat_id`
- varias personas reciben la alerta
- menos configuracion por usuario

### Variables de entorno posibles

```env
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=
TELEGRAM_DEFAULT_CHAT_ID=
```

### Payload base de envio

```json
{
  "chat_id": "-1001234567890",
  "text": "<b>Stock bajo</b>\nEl producto Yerba 500g quedo debajo del minimo.",
  "parse_mode": "HTML"
}
```

### Endpoint esperado

```text
POST https://api.telegram.org/bot<TOKEN>/sendMessage
```

### Observaciones

- es excelente para alertas operativas internas
- si solo se quiere enviar y no recibir comandos, el webhook no es obligatorio

## WhatsApp

### Cuando conviene

- contacto directo con operadores o clientes
- notificaciones con mayor probabilidad de lectura
- alertas criticas donde ese canal tiene valor real

### Consideraciones

Es un canal mas pesado de implementar que email o Telegram.

Se recomienda usar la via oficial de Meta.

### Requisitos principales

- Meta Business Portfolio
- WhatsApp Business Account
- numero emisor
- app de Meta
- token de acceso
- webhook HTTPS publico
- templates aprobados

### Flujo recomendado

1. Configurar cuenta de negocio y numero emisor.
2. Definir templates por tipo de alerta.
3. Guardar numero destino.
4. Enviar por la API oficial.
5. Procesar webhooks de estado.

### Variables de entorno posibles

```env
WHATSAPP_ENABLED=false
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_DEFAULT_TO=
```

### Observaciones

- no es ideal como primer canal para una implementacion simple
- para alertas internas, Telegram suele ser mas facil
- para clientes o notificaciones con valor comercial, WhatsApp puede tener sentido

## Enrutamiento por tipo de evento

Se recomienda definir una tabla o configuracion por evento.

Ejemplo:

```json
{
  "stock_low": ["in_app", "telegram", "email"],
  "cash_close_requested": ["in_app", "telegram"],
  "license_expiring": ["in_app", "email"],
  "payment_failure": ["in_app", "telegram", "whatsapp"]
}
```

## Configuracion por destinatario

Conviene soportar dos modos:

### Modo fijo

Un destinatario general por canal.

Ejemplo:

- Telegram grupo de alertas
- email del administrador
- WhatsApp del encargado

### Modo por usuario

Cada usuario puede configurar:

- email
- chat de Telegram
- numero de WhatsApp
- canales habilitados

## Backend minimo sugerido

Si se implementa rapido, alcanza con un backend pequeno con estos endpoints:

- `POST /notification-dispatch`
- `GET /notification-deliveries`
- `PUT /notification-channel-config/:channel`
- `POST /webhooks/telegram` si se reciben comandos
- `POST /webhooks/whatsapp`
- `POST /webhooks/email-provider`

## Pantalla futura sugerida en EasyCommerce

Una pantalla de configuracion podria incluir:

- canales habilitados
- destinatario default por canal
- templates basicos
- test de envio
- historial de entregas

Posibles rutas:

- `/notifications/channels`
- `/notifications/deliveries`

## Orden recomendado de implementacion

1. Unificar modelo de notificaciones y entregas.
2. Implementar adapter de email.
3. Implementar adapter de Telegram.
4. Agregar pantalla de configuracion.
5. Agregar historial y estados.
6. Evaluar WhatsApp cuando el flujo base ya este estable.

## Recomendacion practica

Si se retoma esta idea con foco en velocidad:

1. usar email para respaldo y auditoria
2. usar Telegram para alertas internas inmediatas
3. dejar WhatsApp para una segunda etapa

## Checklist para retomar luego

- definir backend o serverless para envios
- crear tablas de notificaciones y entregas
- decidir proveedor de email
- crear bot de Telegram
- definir eventos que disparan alertas
- definir destinatarios iniciales
- definir politicas de reintentos
- agregar test de envio por canal

## Referencias utiles

- Telegram Bot API: https://core.telegram.org/bots/api
- Telegram Bots Intro: https://core.telegram.org/bots
- Nodemailer Usage: https://nodemailer.com/usage
- Resend Send Email: https://resend.com/docs/api-reference/emails/send-email
- Resend Domain Setup: https://resend.com/docs/dashboard/domains/introduction
- Meta WhatsApp Cloud API Overview: https://meta-preview.mintlify.io/docs/whatsapp/cloud-api/overview
