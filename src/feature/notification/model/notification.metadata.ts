import type { NotificationType } from "./notification.types";

export const notificationTypeLabel: Record<NotificationType, string> = {
  "license-required": "Permiso requerido",
  "license-expiring": "Permiso por vencer",
  "product-expiring": "Producto por vencer",
  "product-low-stock": "Stock bajo por producto",
  "expense-created": "Gasto generado",
  "sale-created": "Venta generada",
  "supply-requested": "Mercancia solicitada",
  "supply-approved": "Solicitud de mercancia aprobada",
  "supply-received": "Mercancia recibida",
  "supply-pending-receive": "Pedido proveedor pendiente de recepcion",
  "cash-opened": "Caja abierta",
  "cash-closed": "Caja cerrada",
  cash: "Caja",
  "user-created": "Usuario creado",
  "user-updated": "Usuario modificado",
  "user-deleted": "Usuario eliminado",
  "price-changed": "Precio modificado",
  "product-created": "Producto creado",
  "stock-created": "Ingreso de stock",
  "operation-request-merchandise": "Solicitud operador: mercancia",
  "operation-request-permissions": "Solicitud operador: permisos",
  "operation-request-reviewed": "Solicitud operador revisada",
  "manual-fixed": "Manual fija",
  "manual-action": "Manual con accion",
  "manual-due": "Manual con vencimiento",
};

export const allNotificationTypes = Object.keys(notificationTypeLabel) as NotificationType[];
