import type {
  Invoice,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  PaymentMethodSettings,
  TaxSettings,
} from "../model/sale.types";

type CreateOrderDraft = {
  items: OrderItem[];
  operator: string;
};

type UpdateOrderStatusDraft = {
  status: OrderStatus;
  paymentMethod?: PaymentMethod;
  total?: number;
};

type CreateInvoiceDraft = {
  orderId: string;
  total: number;
  paymentMethod: PaymentMethod;
  operator: string;
};

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function createOrderApi(draft: CreateOrderDraft): Promise<Order> {
  const response = await fetch("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<Order>(response);
}

export async function fetchOrdersApi(): Promise<Order[]> {
  const response = await fetch("/orders");
  return await readJsonOrThrow<Order[]>(response);
}

export async function updateOrderStatusApi(id: string, draft: UpdateOrderStatusDraft): Promise<Order> {
  const response = await fetch(`/orders/${encodeURIComponent(id)}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<Order>(response);
}

export async function createInvoiceApi(draft: CreateInvoiceDraft): Promise<Invoice> {
  const response = await fetch("/invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<Invoice>(response);
}

export async function fetchPaymentMethodSettingsApi(): Promise<PaymentMethodSettings> {
  const response = await fetch("/payment-method-settings");
  return await readJsonOrThrow<PaymentMethodSettings>(response);
}

export async function updatePaymentMethodSettingApi(
  method: PaymentMethod,
  draft: { discountPercent: number; surchargePercent: number },
): Promise<PaymentMethodSettings> {
  const response = await fetch(`/payment-method-settings/${encodeURIComponent(method)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<PaymentMethodSettings>(response);
}

export async function fetchTaxSettingsApi(): Promise<TaxSettings> {
  const response = await fetch("/tax-settings");
  return await readJsonOrThrow<TaxSettings>(response);
}

export async function updateTaxSettingsApi(draft: Partial<TaxSettings>): Promise<TaxSettings> {
  const response = await fetch("/tax-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<TaxSettings>(response);
}
