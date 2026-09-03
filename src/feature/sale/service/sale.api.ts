import type {
  Invoice,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  PaymentMethodSettings,
  TaxSettings,
} from "../model/sale.types";
import { readJsonOrThrow } from "../../../shared/http/http";

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

type CreateSaleReceiptDraft = {
  orderId: string;
  orderCode?: string;
  invoiceId?: string;
  createdAt: string;
  operator: string;
  paymentMethod: PaymentMethod;
  items: OrderItem[];
  total: number;
};

type SaleReceipt = {
  id: string;
  orderId: string;
  invoiceId?: string;
  createdAt: string;
  filePath: string;
  html: string;
};

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

export async function createSaleReceiptApi(draft: CreateSaleReceiptDraft): Promise<SaleReceipt> {
  const response = await fetch("/receipts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<SaleReceipt>(response);
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
  