import type { Product, ProductCategory } from "../../product/model/product.types";
import type { Order, OrderItem, PaymentMethod } from "../../sale/model/sale.types";

export type AutoSaleStep = "browse" | "review" | "payment" | "summary";
export type FeedbackTone = "error" | "warning" | "success";

export type CartItem = {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  imageUrl?: string;
  category?: ProductCategory;
};

export type CheckoutSummaryState = {
  status: "approved" | "rejected";
  orderId: string;
  orderCode: string;
  invoiceId?: string;
  createdAt: string;
  operator: string;
  paymentMethod: PaymentMethod;
  items: CartItem[];
  total: number;
  reason?: string;
};

const CATEGORY_LABELS: Record<ProductCategory, string> = {
  bebida: "Bebidas",
  hamburguesa: "Hamburguesas",
  pancho: "Panchos",
  combos: "Combos",
  papas: "Papas",
  pollo: "Pollo",
  vegano: "Vegano",
};

const PENDING_PAYMENT_TIMEOUT_MINUTES = getPendingTimeoutMinutes();
export const PENDING_PAYMENT_TIMEOUT_MS = PENDING_PAYMENT_TIMEOUT_MINUTES * 60_000;

export function getAutoSalePendingTimeoutMinutes() {
  return PENDING_PAYMENT_TIMEOUT_MINUTES;
}

export function generateOrderCode() {
  const now = new Date();
  const stamp = `${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}${now.getFullYear()}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 10_000)
    .toString()
    .padStart(4, "0");
  return `ORD${stamp}${rand}`;
}

export function getPendingOrderRemainingMs(order: Order, nowMs = Date.now()) {
  if (order.status !== "por pagar") return 0;
  const createdAtMs = new Date(order.createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) return PENDING_PAYMENT_TIMEOUT_MS;
  const elapsedMs = nowMs - createdAtMs;
  return Math.max(0, PENDING_PAYMENT_TIMEOUT_MS - elapsedMs);
}

export function isPendingOrderExpired(order: Order, nowMs = Date.now()) {
  return getPendingOrderRemainingMs(order, nowMs) <= 0;
}

export function getCategoryLabel(category?: ProductCategory) {
  if (!category) return "Sin categoria";
  return CATEGORY_LABELS[category] || category;
}

export function getProductStock(product: Product | null | undefined) {
  return Math.max(0, Math.trunc(Number(product?.existencia || 0)));
}

export function mapProductToCartItem(product: Product, quantity: number): CartItem {
  return {
    productId: product.id,
    productName: product.name,
    unitPrice: product.price,
    quantity,
    imageUrl: product.imageUrl,
    category: product.category || "bebida",
  };
}

export function mapOrderItemToCartItem(item: OrderItem, productMap: Map<string, Product>): CartItem {
  const relatedProduct = productMap.get(item.productId);
  return {
    productId: item.productId,
    productName: item.productName,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    imageUrl: relatedProduct?.imageUrl,
    category: relatedProduct?.category || "bebida",
  };
}

function getPendingTimeoutMinutes() {
  const raw = Math.trunc(Number(import.meta.env.VITE_ORDER_PENDING_TIMEOUT_MINUTES));
  if (!Number.isFinite(raw) || raw <= 0) return 15;
  return raw;
}
