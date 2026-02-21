import type { ProductCategory } from "../../product/model/product.types";

export type NotificationType =
  | "license-required"
  | "license-expiring"
  | "product-expiring"
  | "product-low-stock"
  | "expense-created"
  | "sale-created"
  | "supply-requested"
  | "supply-approved"
  | "supply-received"
  | "supply-pending-receive"
  | "cash-opened"
  | "cash-closed"
  | "cash"
  | "user-created"
  | "user-updated"
  | "user-deleted"
  | "price-changed"
  | "product-created"
  | "stock-created"
  | "operation-request-merchandise"
  | "operation-request-permissions"
  | "operation-request-reviewed"
  | "manual-fixed"
  | "manual-action"
  | "manual-due";

export type NotificationStatus = "active" | "disabled" | "received";

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  createdAt: string;
  dueAt?: string;
  isFixed: boolean;
  requiresAction: boolean;
  actionLabel?: string;
  category?: ProductCategory;
  entityType?: string;
  entityId?: string;
  status: NotificationStatus;
  receivedAt?: string;
  disabledAt?: string;
};

export type NotificationSetting = {
  type: NotificationType;
  leadDays: number;
  durationDays: number;
};

export type StockThresholdByProduct = {
  productId: string;
  minUnits: number;
};

export type StockThresholdSettings = {
  categoryThresholds: Record<ProductCategory, number>;
  productThresholds: StockThresholdByProduct[];
};

export type CreateNotificationDraft = {
  type: NotificationType;
  title: string;
  description: string;
  dueAt?: string;
  isFixed?: boolean;
  requiresAction?: boolean;
  actionLabel?: string;
  category?: ProductCategory;
  entityType?: string;
  entityId?: string;
};
