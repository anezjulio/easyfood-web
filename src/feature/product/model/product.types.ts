export const PRODUCT_CATEGORIES = [
  "bebida",
  "hamburguesa",
  "pancho",
  "combos",
  "papas",
  "pollo",
  "vegano",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export type Product = {
  id: string;
  name: string;
  price: number;
  costPrice?: number;
  createdAt: string; // ISO string
  imageUrl?: string;
  barcode?: string;
  brand?: string;
  category?: ProductCategory;
  supplyOrderId?: string;
  existencia?: number;
  ultimoIngreso?: string;
};

export type ProductSortKey = "name" | "brand" | "price" | "existencia" | "category" | "createdAt";

export type PriceMarginByProduct = {
  productId: string;
  marginPercent: number;
};

export type CategoryPriceMarginHistoryEntry = {
  id: string;
  category: ProductCategory;
  previousMarginPercent: number;
  marginPercent: number;
  createdAt: string;
};

export type ProductPriceMarginHistoryEntry = {
  id: string;
  productId: string;
  previousMarginPercent: number | null;
  marginPercent: number | null;
  createdAt: string;
};

export type PriceMarginSettings = {
  categoryMargins: Record<ProductCategory, number>;
  productMargins: PriceMarginByProduct[];
  categoryMarginHistory: CategoryPriceMarginHistoryEntry[];
  productMarginHistory: ProductPriceMarginHistoryEntry[];
};

const DEFAULT_MARGIN_PERCENT = 30;

export function normalizeMarginPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

export function calculateSalePrice(costPrice: number, marginPercent: number): number {
  const safeCost = Math.max(0, Math.trunc(Number(costPrice)));
  const safeMargin = normalizeMarginPercent(marginPercent);
  return Math.max(0, Math.round(safeCost * (1 + safeMargin / 100)));
}

export function inferCostPriceFromSalePrice(salePrice: number, marginPercent: number): number {
  const safeSale = Math.max(0, Math.trunc(Number(salePrice)));
  const safeMargin = normalizeMarginPercent(marginPercent);
  if (safeMargin <= 0) return safeSale;
  const divisor = 1 + safeMargin / 100;
  if (!Number.isFinite(divisor) || divisor <= 0) return safeSale;
  return Math.max(0, Math.round(safeSale / divisor));
}

export function buildDefaultPriceMarginSettings(): PriceMarginSettings {
  return {
    categoryMargins: PRODUCT_CATEGORIES.reduce(
      (acc, category) => ({ ...acc, [category]: DEFAULT_MARGIN_PERCENT }),
      {} as Record<ProductCategory, number>,
    ),
    productMargins: [],
    categoryMarginHistory: [],
    productMarginHistory: [],
  };
}

export function resolveEffectiveMarginPercent(
  settings: PriceMarginSettings | null | undefined,
  category: ProductCategory | undefined,
  productId?: string | null,
): number {
  if (settings && productId) {
    const byProduct = settings.productMargins.find((item) => item.productId === productId);
    if (byProduct) return normalizeMarginPercent(byProduct.marginPercent);
  }

  if (settings) {
    const safeCategory = category || "bebida";
    return normalizeMarginPercent(settings.categoryMargins[safeCategory] ?? DEFAULT_MARGIN_PERCENT);
  }

  return DEFAULT_MARGIN_PERCENT;
}
