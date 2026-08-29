import {
  PRODUCT_CATEGORIES,
  buildDefaultPriceMarginSettings,
  calculateSalePrice,
  inferCostPriceFromSalePrice,
  normalizeMarginPercent,
  resolveEffectiveMarginPercent,
  type PriceMarginSettings,
  type Product,
} from "../model/product.types";

const KEY = "easyfood_product_v1";
const PRODUCT_PRICE_KEY = "easyfood_product_price_v1";
const DELETE_REQUEST_KEY = "easyfood_product_delete_requests_v1";
const PRICE_MARGIN_SETTINGS_KEY = "easyfood_price_margin_settings_v1";
const MAX_MARGIN_HISTORY = 300;

function padIdPart(value: number): string {
  return String(value).padStart(2, "0");
}

function formatIdDatePart(input: Date): string {
  return `${padIdPart(input.getDate())}${padIdPart(input.getMonth() + 1)}${input.getFullYear()}${padIdPart(input.getHours())}${padIdPart(input.getMinutes())}${padIdPart(input.getSeconds())}`;
}

function buildEntityId(prefix: string, inputDate = new Date()): string {
  const suffix = Math.floor(Math.random() * 10_000).toString().padStart(4, "0");
  return `${prefix}${formatIdDatePart(inputDate)}${suffix}`;
}

export type ProductDraft = {
  name: string;
  price?: number;
  costPrice?: number;
  marginPercent?: number;
  imageUrl?: string;
  barcode?: string;
  brand?: string;
  category?: Product["category"];
  supplyOrderId?: string;
};

export type ProductDeleteRequest = {
  id: string;
  productId: string;
  productName: string;
  requestedBy: string;
  requestedAt: string;
  status: "pending";
};

export type ProductPrice = {
  id: string;
  productId: string;
  newPrice: number;
  costPrice?: number;
  marginPercent?: number;
  createdAt: string;
};

function buildDefaultBarcode(id: string, index: number): string {
  const raw = id.replace(/\D/g, "");
  const suffix = (raw || String(index + 1)).slice(-6).padStart(6, "0");
  return `7790000${suffix}`;
}

function normalizeBarcode(value: string | undefined) {
  return String(value || "").trim();
}

function findProductByBarcode(products: Product[], barcode: string, excludeId?: string) {
  const normalized = normalizeBarcode(barcode);
  if (!normalized) return undefined;
  return products.find((item) => normalizeBarcode(item.barcode) === normalized && (!excludeId || item.id !== excludeId));
}

const seedBase: Product[] = [
  {
    id: "food-hamburguesa-simple",
    name: "Hamburguesa simple",
    price: 4500,
    costPrice: 2800,
    category: "perecedero",
    imageUrl: "food-hamburger.png",
    createdAt: "2026-02-01T11:00:00.000Z",
  },
  {
    id: "food-hamburguesa-doble",
    name: "Hamburguesa doble",
    price: 6200,
    costPrice: 3900,
    category: "perecedero",
    imageUrl: "food-hamburger.png",
    createdAt: "2026-02-01T11:05:00.000Z",
  },
  {
    id: "food-pancho",
    name: "Pancho",
    price: 2800,
    costPrice: 1500,
    category: "perecedero",
    imageUrl: "food-hotdog.png",
    createdAt: "2026-02-01T11:10:00.000Z",
  },
  {
    id: "food-sandwich-milanesa",
    name: "Sandwich de milanesa",
    price: 5800,
    costPrice: 3600,
    category: "perecedero",
    imageUrl: "food-hamburger.png",
    createdAt: "2026-02-01T11:15:00.000Z",
  },
  {
    id: "food-papas-fritas",
    name: "Papas fritas",
    price: 3200,
    costPrice: 1800,
    category: "perecedero",
    imageUrl: "food-fries-cheddar.png",
    createdAt: "2026-02-01T11:20:00.000Z",
  },
  {
    id: "food-agua-500",
    name: "Agua mineral 500ml",
    price: 1200,
    costPrice: 700,
    category: "bebida",
    imageUrl: "food-drinks.png",
    createdAt: "2026-02-01T11:25:00.000Z",
  },
];

const seed: Product[] = seedBase.map((item, index) => ({ ...item, barcode: buildDefaultBarcode(item.id, index) }));

function safeParse(raw: string | null): Product[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Product[]) : [];
  } catch {
    return [];
  }
}

function normalizeMojibake(text: string): string {
  return text
    .replaceAll("ÃƒÂ¡", "Ã¡")
    .replaceAll("ÃƒÂ©", "Ã©")
    .replaceAll("ÃƒÂ­", "Ã­")
    .replaceAll("ÃƒÂ³", "Ã³")
    .replaceAll("ÃƒÂº", "Ãº")
    .replaceAll("ÃƒÂ±", "Ã±")
    .replaceAll("ÃƒÂ", "Ã")
    .replaceAll("Ãƒâ€°", "Ã‰")
    .replaceAll("ÃƒÂ", "Ã")
    .replaceAll("Ãƒâ€œ", "Ã“")
    .replaceAll("ÃƒÅ¡", "Ãš")
    .replaceAll("Ãƒâ€˜", "Ã‘")
    .replaceAll("Ã¢â‚¬Â¦", "â€¦")
    .replaceAll("Ã¢â€ â€˜", "â†‘")
    .replaceAll("Ã¢â€ â€œ", "â†“");
}

function normalizeProducts(products: Product[]): Product[] {
  let changed = false;
  const normalized = products.map((p, index) => {
    const fixedName = normalizeMojibake(p.name);
    const barcode = (p.barcode || "").trim() || buildDefaultBarcode(p.id, index);
    const brand = String((p as { brand?: unknown }).brand || "").trim() || undefined;
    const rawCategory = String((p as { category?: unknown }).category || "").trim().toLowerCase();
    const category = rawCategory === "no perecedero" ? "vivere" : p.category || "vivere";
    const fallbackCostPrice = Math.max(1, Math.trunc(Number(p.price) || 0));
    const parsedCostPrice = Math.trunc(Number((p as { costPrice?: unknown }).costPrice));
    const costPrice = Number.isFinite(parsedCostPrice) && parsedCostPrice > 0 ? parsedCostPrice : fallbackCostPrice;
    const supplyOrderId = String((p as { supplyOrderId?: unknown }).supplyOrderId || "").trim() || undefined;
    if (
      fixedName !== p.name ||
      barcode !== p.barcode ||
      brand !== p.brand ||
      category !== p.category ||
      costPrice !== p.costPrice ||
      supplyOrderId !== p.supplyOrderId
    ) {
      changed = true;
      return { ...p, name: fixedName, barcode, brand, category, costPrice, supplyOrderId };
    }
    return p;
  });

  return changed ? normalized : products;
}

export function loadProducts(): Product[] {
  const parsedList = safeParse(localStorage.getItem(KEY));
  const list = normalizeProducts(parsedList);
  if (list !== parsedList) {
    saveProducts(list);
  }

  // primera vez: seed
  if (list.length === 0) {
    saveProducts(seed);
    return seed;
  }

  // si el seed creciÃ³, completar faltantes por id
  const existingIds = new Set(list.map((p) => p.id));
  const merged = [...list, ...seed.filter((p) => !existingIds.has(p.id))];
  if (merged.length !== list.length) {
    saveProducts(merged);
    return merged;
  }

  return list;
}

export function saveProducts(products: Product[]): void {
  localStorage.setItem(KEY, JSON.stringify(products));
}

export function resetProductsToSeed(): Product[] {
  saveProducts(seed);
  return seed;
}

export function createProduct(draft: ProductDraft): Product {
  const list = loadProducts();
  if (draft.barcode?.trim()) {
    const duplicate = findProductByBarcode(list, draft.barcode);
    if (duplicate) {
      throw new Error(`Barcode already exists: ${duplicate.name}`);
    }
  }
  const category = draft.category || "vivere";
  const marginSettings = getPriceMarginSettings();
  const effectiveMargin = Number.isFinite(Number(draft.marginPercent))
    ? normalizeMarginPercent(Number(draft.marginPercent))
    : resolveEffectiveMarginPercent(marginSettings, category);

  const rawPrice = Math.trunc(Number(draft.price));
  const rawCostPrice = Math.trunc(Number(draft.costPrice));
  const hasPrice = Number.isFinite(rawPrice) && rawPrice > 0;
  const hasCostPrice = Number.isFinite(rawCostPrice) && rawCostPrice > 0;
  if (!hasPrice && !hasCostPrice) {
    throw new Error("Product must define a valid price or costPrice");
  }

  const costPrice = hasCostPrice ? rawCostPrice : rawPrice;
  const salePrice = hasCostPrice ? calculateSalePrice(costPrice, effectiveMargin) : rawPrice;

  const now = new Date().toISOString();
  const product: Product = {
    id: buildEntityId("p"),
    name: draft.name.trim(),
    price: Math.max(1, Math.trunc(salePrice)),
    costPrice: Math.max(1, Math.trunc(costPrice)),
    createdAt: now,
    imageUrl: draft.imageUrl?.trim() || undefined,
    barcode: draft.barcode?.trim() || undefined,
    brand: draft.brand?.trim() || undefined,
    category,
    supplyOrderId: draft.supplyOrderId?.trim() || undefined,
  };

  const next = [product, ...list];
  saveProducts(next);
  createProductPriceRecord({
    productId: product.id,
    newPrice: product.price,
    costPrice: product.costPrice,
    marginPercent: effectiveMargin,
    createdAt: now,
  });
  return product;
}

export function updateProduct(id: string, draft: ProductDraft): Product | null {
  const list = loadProducts();
  if (draft.barcode?.trim()) {
    const duplicate = findProductByBarcode(list, draft.barcode, id);
    if (duplicate) {
      throw new Error(`Barcode already exists: ${duplicate.name}`);
    }
  }
  const marginSettings = getPriceMarginSettings();
  let updated: Product | null = null;
  const next = list.map((item) => {
    if (item.id !== id) return item;
    const nextCategory = draft.category || item.category || "vivere";
    const marginPercent = Number.isFinite(Number(draft.marginPercent))
      ? normalizeMarginPercent(Number(draft.marginPercent))
      : resolveEffectiveMarginPercent(marginSettings, nextCategory, item.id);

    const rawPrice = Math.trunc(Number(draft.price));
    const rawCostPrice = Math.trunc(Number(draft.costPrice));
    const hasPrice = Number.isFinite(rawPrice) && rawPrice > 0;
    const hasCostPrice = Number.isFinite(rawCostPrice) && rawCostPrice > 0;

    const fallbackCostPrice =
      Number.isFinite(Number(item.costPrice)) && Number(item.costPrice) > 0
        ? Math.trunc(Number(item.costPrice))
        : inferCostPriceFromSalePrice(item.price, marginPercent);

    const nextCostPrice = hasCostPrice ? rawCostPrice : fallbackCostPrice;
    const nextPrice = hasCostPrice ? calculateSalePrice(nextCostPrice, marginPercent) : hasPrice ? rawPrice : item.price;

    updated = {
      ...item,
      name: draft.name.trim(),
      price: Math.max(1, Math.trunc(nextPrice)),
      costPrice: Math.max(1, Math.trunc(nextCostPrice)),
      imageUrl: draft.imageUrl?.trim() || undefined,
      barcode: draft.barcode?.trim() || undefined,
      brand: draft.brand?.trim() || undefined,
      category: nextCategory,
      supplyOrderId: typeof draft.supplyOrderId === "string" ? draft.supplyOrderId.trim() || undefined : item.supplyOrderId,
    };
    return updated;
  });

  if (!updated) return null;
  saveProducts(next);
  return updated;
}

export function removeProduct(id: string): boolean {
  const list = loadProducts();
  const next = list.filter((item) => item.id !== id);
  if (next.length === list.length) return false;
  saveProducts(next);
  return true;
}

function loadProductPrices(): ProductPrice[] {
  const raw = localStorage.getItem(PRODUCT_PRICE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ProductPrice[]) : [];
  } catch {
    return [];
  }
}

function saveProductPrices(prices: ProductPrice[]) {
  localStorage.setItem(PRODUCT_PRICE_KEY, JSON.stringify(prices));
}

export function getProductPrices(): ProductPrice[] {
  return loadProductPrices();
}

export function createProductPriceRecord(input: {
  productId: string;
  newPrice: number;
  costPrice?: number;
  marginPercent?: number;
  createdAt?: string;
}): ProductPrice {
  const products = loadProducts();
  const productIndex = products.findIndex((product) => product.id === input.productId);
  if (productIndex < 0) {
    throw new Error("Product not found");
  }

  const nextPrice = Math.trunc(Number(input.newPrice));
  if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
    throw new Error("Invalid price");
  }
  const product = products[productIndex];
  const marginSettings = getPriceMarginSettings();
  const effectiveMargin = Number.isFinite(Number(input.marginPercent))
    ? normalizeMarginPercent(Number(input.marginPercent))
    : resolveEffectiveMarginPercent(marginSettings, product.category, product.id);

  const rawCostPrice = Math.trunc(Number(input.costPrice));
  const fallbackCostPrice =
    Number.isFinite(Number(product.costPrice)) && Number(product.costPrice) > 0
      ? Math.trunc(Number(product.costPrice))
      : inferCostPriceFromSalePrice(nextPrice, effectiveMargin);
  const nextCostPrice = Number.isFinite(rawCostPrice) && rawCostPrice > 0 ? rawCostPrice : fallbackCostPrice;

  const derivedMarginPercent =
    nextCostPrice > 0 ? normalizeMarginPercent(((nextPrice - nextCostPrice) / nextCostPrice) * 100) : effectiveMargin;

  const now = input.createdAt || new Date().toISOString();
  const prices = loadProductPrices();
  const record: ProductPrice = {
    id: buildEntityId("pp"),
    productId: input.productId,
    newPrice: nextPrice,
    costPrice: nextCostPrice,
    marginPercent: derivedMarginPercent,
    createdAt: now,
  };

  products[productIndex] = { ...products[productIndex], price: nextPrice, costPrice: nextCostPrice };
  saveProducts(products);
  saveProductPrices([record, ...prices]);
  return record;
}

function resolvePriceMarginSettings(input: unknown): PriceMarginSettings {
  const defaults = buildDefaultPriceMarginSettings();
  const node = (input || {}) as {
    categoryMargins?: Record<string, unknown>;
    productMargins?: unknown[];
    categoryMarginHistory?: unknown[];
    productMarginHistory?: unknown[];
  };

  const categoryMargins = { ...defaults.categoryMargins };
  const rawCategoryMargins = node.categoryMargins || {};
  for (const category of PRODUCT_CATEGORIES) {
    const value = Number(rawCategoryMargins[category]);
    if (Number.isFinite(value)) {
      categoryMargins[category] = normalizeMarginPercent(value);
    }
  }

  const productMargins = Array.isArray(node.productMargins)
    ? node.productMargins
        .map((entry) => {
          const draft = entry as { productId?: unknown; marginPercent?: unknown };
          const productId = String(draft.productId || "").trim();
          const marginPercent = normalizeMarginPercent(Number(draft.marginPercent));
          if (!productId) return null;
          return { productId, marginPercent };
        })
        .filter((entry): entry is { productId: string; marginPercent: number } => !!entry)
    : [];

  const categoryMarginHistory = Array.isArray(node.categoryMarginHistory)
    ? node.categoryMarginHistory
        .map((entry) => {
          const draft = entry as {
            id?: unknown;
            category?: unknown;
            previousMarginPercent?: unknown;
            marginPercent?: unknown;
            createdAt?: unknown;
          };
          const category = String(draft.category || "").trim().toLowerCase();
          if (!PRODUCT_CATEGORIES.includes(category as (typeof PRODUCT_CATEGORIES)[number])) return null;
          const previousMarginPercent = Number(draft.previousMarginPercent);
          const marginPercent = Number(draft.marginPercent);
          if (!Number.isFinite(previousMarginPercent) || !Number.isFinite(marginPercent)) return null;
          return {
            id: String(draft.id || buildEntityId("cmh")),
            category: category as Product["category"],
            previousMarginPercent: normalizeMarginPercent(previousMarginPercent),
            marginPercent: normalizeMarginPercent(marginPercent),
            createdAt: String(draft.createdAt || "").trim() || new Date().toISOString(),
          };
        })
        .filter(
          (
            entry,
          ): entry is {
            id: string;
            category: NonNullable<Product["category"]>;
            previousMarginPercent: number;
            marginPercent: number;
            createdAt: string;
          } => !!entry,
        )
    : [];

  const productMarginHistory = Array.isArray(node.productMarginHistory)
    ? node.productMarginHistory
        .map((entry) => {
          const draft = entry as {
            id?: unknown;
            productId?: unknown;
            previousMarginPercent?: unknown;
            marginPercent?: unknown;
            createdAt?: unknown;
          };
          const productId = String(draft.productId || "").trim();
          if (!productId) return null;
          const previousRaw = draft.previousMarginPercent;
          const nextRaw = draft.marginPercent;
          const previousNumber = Number(previousRaw);
          const marginNumber = Number(nextRaw);
          const previousMarginPercent =
            previousRaw === null || typeof previousRaw === "undefined"
              ? null
              : Number.isFinite(previousNumber)
                ? normalizeMarginPercent(previousNumber)
                : null;
          const marginPercent =
            nextRaw === null || typeof nextRaw === "undefined"
              ? null
              : Number.isFinite(marginNumber)
                ? normalizeMarginPercent(marginNumber)
                : null;
          if (previousRaw !== null && typeof previousRaw !== "undefined" && previousMarginPercent === null) return null;
          if (nextRaw !== null && typeof nextRaw !== "undefined" && marginPercent === null) return null;
          return {
            id: String(draft.id || buildEntityId("pmh")),
            productId,
            previousMarginPercent,
            marginPercent,
            createdAt: String(draft.createdAt || "").trim() || new Date().toISOString(),
          };
        })
        .filter(
          (
            entry,
          ): entry is {
            id: string;
            productId: string;
            previousMarginPercent: number | null;
            marginPercent: number | null;
            createdAt: string;
          } => !!entry,
        )
    : [];

  return { categoryMargins, productMargins, categoryMarginHistory, productMarginHistory };
}

function loadPriceMarginSettings(): PriceMarginSettings {
  const raw = localStorage.getItem(PRICE_MARGIN_SETTINGS_KEY);
  if (!raw) {
    const defaults = buildDefaultPriceMarginSettings();
    localStorage.setItem(PRICE_MARGIN_SETTINGS_KEY, JSON.stringify(defaults));
    return defaults;
  }
  try {
    const parsed = JSON.parse(raw);
    const resolved = resolvePriceMarginSettings(parsed);
    localStorage.setItem(PRICE_MARGIN_SETTINGS_KEY, JSON.stringify(resolved));
    return resolved;
  } catch {
    const defaults = buildDefaultPriceMarginSettings();
    localStorage.setItem(PRICE_MARGIN_SETTINGS_KEY, JSON.stringify(defaults));
    return defaults;
  }
}

function savePriceMarginSettings(settings: PriceMarginSettings) {
  localStorage.setItem(PRICE_MARGIN_SETTINGS_KEY, JSON.stringify(resolvePriceMarginSettings(settings)));
}

function buildMarginHistoryId(prefix: "cmh" | "pmh"): string {
  return buildEntityId(prefix);
}

function pushCategoryMarginHistory(
  settings: PriceMarginSettings,
  category: NonNullable<Product["category"]>,
  previousMarginPercent: number,
  marginPercent: number,
) {
  if (previousMarginPercent === marginPercent) return;
  settings.categoryMarginHistory = [
    {
      id: buildMarginHistoryId("cmh"),
      category,
      previousMarginPercent,
      marginPercent,
      createdAt: new Date().toISOString(),
    },
    ...(settings.categoryMarginHistory || []),
  ].slice(0, MAX_MARGIN_HISTORY);
}

function pushProductMarginHistory(
  settings: PriceMarginSettings,
  productId: string,
  previousMarginPercent: number | null,
  marginPercent: number | null,
) {
  if (previousMarginPercent === marginPercent) return;
  settings.productMarginHistory = [
    {
      id: buildMarginHistoryId("pmh"),
      productId,
      previousMarginPercent,
      marginPercent,
      createdAt: new Date().toISOString(),
    },
    ...(settings.productMarginHistory || []),
  ].slice(0, MAX_MARGIN_HISTORY);
}

export function getPriceMarginSettings(): PriceMarginSettings {
  return loadPriceMarginSettings();
}

export function updateCategoryPriceMargin(category: Product["category"], marginPercent: number): PriceMarginSettings {
  if (!category) {
    throw new Error("Category is required");
  }
  const settings = loadPriceMarginSettings();
  const normalizedMargin = normalizeMarginPercent(marginPercent);
  const previousMarginPercent = normalizeMarginPercent(settings.categoryMargins[category] ?? 30);
  settings.categoryMargins[category] = normalizedMargin;
  pushCategoryMarginHistory(settings, category, previousMarginPercent, normalizedMargin);
  savePriceMarginSettings(settings);
  return settings;
}

export function upsertProductPriceMargin(productId: string, marginPercent: number): PriceMarginSettings {
  const normalizedProductId = String(productId || "").trim();
  if (!normalizedProductId) {
    throw new Error("Product is required");
  }

  const settings = loadPriceMarginSettings();
  const normalizedMargin = normalizeMarginPercent(marginPercent);
  const index = settings.productMargins.findIndex((item) => item.productId === normalizedProductId);
  const previousMarginPercent = index < 0 ? null : normalizeMarginPercent(settings.productMargins[index].marginPercent);
  if (index < 0) {
    settings.productMargins.push({ productId: normalizedProductId, marginPercent: normalizedMargin });
  } else {
    settings.productMargins[index] = { productId: normalizedProductId, marginPercent: normalizedMargin };
  }
  pushProductMarginHistory(settings, normalizedProductId, previousMarginPercent, normalizedMargin);

  savePriceMarginSettings(settings);
  return settings;
}

export function removeProductPriceMargin(productId: string): PriceMarginSettings {
  const normalizedProductId = String(productId || "").trim();
  const settings = loadPriceMarginSettings();
  const existing = settings.productMargins.find((item) => item.productId === normalizedProductId);
  if (!existing) return settings;
  settings.productMargins = settings.productMargins.filter((item) => item.productId !== normalizedProductId);
  pushProductMarginHistory(settings, normalizedProductId, normalizeMarginPercent(existing.marginPercent), null);
  savePriceMarginSettings(settings);
  return settings;
}

function loadDeleteRequests(): ProductDeleteRequest[] {
  const raw = localStorage.getItem(DELETE_REQUEST_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ProductDeleteRequest[]) : [];
  } catch {
    return [];
  }
}

function saveDeleteRequests(requests: ProductDeleteRequest[]) {
  localStorage.setItem(DELETE_REQUEST_KEY, JSON.stringify(requests));
}

export function requestProductDeletion(product: Product, requestedBy: string): ProductDeleteRequest {
  const requests = loadDeleteRequests();
  const request: ProductDeleteRequest = {
    id: buildEntityId("dr"),
    productId: product.id,
    productName: product.name,
    requestedBy,
    requestedAt: new Date().toISOString(),
    status: "pending",
  };

  saveDeleteRequests([request, ...requests]);
  return request;
}
