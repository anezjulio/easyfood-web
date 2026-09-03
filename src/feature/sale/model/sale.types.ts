export const PAYMENT_METHODS = ["efectivo", "tarjeta debito", "tarjeta credito", "mercadopago"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  "tarjeta debito": "Tarjeta Debito",
  "tarjeta credito": "Tarjeta Credito",
  mercadopago: "Mercado Pago",
};

export type PaymentMethodAdjustment = {
  method: PaymentMethod;
  discountPercent: number;
  surchargePercent: number;
};

export type PaymentMethodSettings = {
  methods: PaymentMethodAdjustment[];
};

export type TaxMode = "add_to_total" | "show_only";

export type TaxSettings = {
  ivaPercent: number;
  mode: TaxMode;
};

export type OrderStatus = "por pagar" | "pagada" | "cancelada";

export type OrderItem = {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  comboItems?: Array<{
    menuProductId: string;
    menuProductName: string;
    quantity: number;
  }>;
  comboSelections?: Array<{
    category: string;
    menuProductId: string;
    menuProductName: string;
  }>;
  comboUnits?: Array<{
    label: string;
    comboItems: Array<{
      menuProductId: string;
      menuProductName: string;
      quantity: number;
    }>;
    comboSelections?: Array<{
      category: string;
      menuProductId: string;
      menuProductName: string;
    }>;
  }>;
};

export type Order = {
  id: string;
  items: OrderItem[];
  createdAt: string;
  status: OrderStatus;
  total: number;
  operator: string;
  paymentMethod?: PaymentMethod;
  cancelledAt?: string;
};

export type Invoice = {
  id: string;
  orderId: string;
  createdAt: string;
  total: number;
  paymentMethod: PaymentMethod;
  operator: string;
};

export function normalizePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

export function formatPaymentMethodLabel(method: PaymentMethod | string | null | undefined): string {
  const raw = String(method || "").trim();
  const normalized = raw.toLowerCase() as PaymentMethod;
  if (normalized in PAYMENT_METHOD_LABELS) {
    return PAYMENT_METHOD_LABELS[normalized];
  }
  if (!raw) return "-";
  return raw
    .split(/\s+/g)
    .filter(Boolean)
    .map((token) => `${token.slice(0, 1).toUpperCase()}${token.slice(1).toLowerCase()}`)
    .join(" ");
}

export function buildDefaultPaymentMethodSettings(): PaymentMethodSettings {
  return {
    methods: PAYMENT_METHODS.map((method) => ({
      method,
      discountPercent: 0,
      surchargePercent: 0,
    })),
  };
}

export function buildDefaultTaxSettings(): TaxSettings {
  return {
    ivaPercent: 21,
    mode: "show_only",
  };
}

export function resolvePaymentMethodAdjustment(
  settings: PaymentMethodSettings | null | undefined,
  method: PaymentMethod,
): PaymentMethodAdjustment {
  const defaults = buildDefaultPaymentMethodSettings();
  const fallback = defaults.methods.find((item) => item.method === method)!;
  const configured = (settings?.methods || []).find((item) => item.method === method);
  if (!configured) return fallback;
  return {
    method,
    discountPercent: normalizePercent(configured.discountPercent),
    surchargePercent: normalizePercent(configured.surchargePercent),
  };
}
