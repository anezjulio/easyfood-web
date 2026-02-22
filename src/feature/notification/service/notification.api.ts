import type {
  AppNotification,
  CreateNotificationDraft,
  NotificationSetting,
  NotificationStatus,
  StockThresholdSettings,
  NotificationType,
} from "../model/notification.types";
import type { ProductCategory } from "../../product/model/product.types";
import { readJsonOrThrow } from "../../../shared/http/http";

export async function fetchNotificationsApi(): Promise<AppNotification[]> {
  const response = await fetch("/notifications");
  return await readJsonOrThrow<AppNotification[]>(response);
}

export async function createNotificationApi(draft: CreateNotificationDraft): Promise<AppNotification> {
  const response = await fetch("/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<AppNotification>(response);
}

export async function updateNotificationApi(
  id: string,
  draft: {
    status?: NotificationStatus;
    isFixed?: boolean;
    requiresAction?: boolean;
    title?: string;
    description?: string;
    dueAt?: string;
  },
): Promise<AppNotification> {
  const response = await fetch(`/notifications/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<AppNotification>(response);
}

export async function fetchNotificationSettingsApi(): Promise<NotificationSetting[]> {
  const response = await fetch("/notification-settings");
  return await readJsonOrThrow<NotificationSetting[]>(response);
}

export async function updateNotificationSettingApi(
  type: NotificationType,
  draft: { leadDays?: number; durationDays?: number },
): Promise<NotificationSetting> {
  const response = await fetch(`/notification-settings/${encodeURIComponent(type)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<NotificationSetting>(response);
}

export async function fetchStockThresholdSettingsApi(): Promise<StockThresholdSettings> {
  const response = await fetch("/stock-threshold-settings");
  return await readJsonOrThrow<StockThresholdSettings>(response);
}

export async function updateCategoryStockThresholdApi(category: ProductCategory, minUnits: number): Promise<StockThresholdSettings> {
  const response = await fetch(`/stock-threshold-settings/category/${encodeURIComponent(category)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minUnits }),
  });
  return await readJsonOrThrow<StockThresholdSettings>(response);
}

export async function upsertProductStockThresholdApi(productId: string, minUnits: number): Promise<StockThresholdSettings> {
  const response = await fetch(`/stock-threshold-settings/product/${encodeURIComponent(productId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minUnits }),
  });
  return await readJsonOrThrow<StockThresholdSettings>(response);
}

export async function removeProductStockThresholdApi(productId: string): Promise<StockThresholdSettings> {
  const response = await fetch(`/stock-threshold-settings/product/${encodeURIComponent(productId)}`, {
    method: "DELETE",
  });
  return await readJsonOrThrow<StockThresholdSettings>(response);
}

export async function generateNotificationExamplesApi(): Promise<{ ok: boolean; createdCases: number }> {
  const response = await fetch("/notifications/generate-test-cases", {
    method: "POST",
  });
  return await readJsonOrThrow<{ ok: boolean; createdCases: number }>(response);
}
