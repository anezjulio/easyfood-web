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

const KEY = "easycommerce_product_v1";
const PRODUCT_PRICE_KEY = "easycommerce_product_price_v1";
const DELETE_REQUEST_KEY = "easycommerce_product_delete_requests_v1";
const PRICE_MARGIN_SETTINGS_KEY = "easycommerce_price_margin_settings_v1";
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

const seed: Product[] = [
  { id: "p1", name: "Coca-Cola 500ml", price: 1500, createdAt: "2026-01-20T12:00:00.000Z" },
  { id: "p2", name: "Alfajor", price: 900, createdAt: "2026-01-22T09:30:00.000Z" },
  { id: "p3", name: "Agua 1.5L", price: 1200, createdAt: "2026-01-23T18:10:00.000Z" },
  { id: "p4", name: "Pan lactal", price: 2200, createdAt: "2026-01-05T10:15:00.000Z" },
  { id: "p5", name: "Leche entera 1L", price: 1800, createdAt: "2026-01-06T08:00:00.000Z" },
  { id: "p6", name: "Yogur natural 200g", price: 1200, createdAt: "2026-01-06T11:20:00.000Z" },
  { id: "p7", name: "Queso cremoso 300g", price: 4500, createdAt: "2026-01-07T14:40:00.000Z" },
  { id: "p8", name: "Jamon cocido 200g", price: 3800, createdAt: "2026-01-07T16:10:00.000Z" },
  { id: "p9", name: "Harina 1kg", price: 1400, createdAt: "2026-01-08T09:05:00.000Z" },
  { id: "p10", name: "Arroz 1kg", price: 1600, createdAt: "2026-01-08T12:30:00.000Z" },
  { id: "p11", name: "Fideos 500g", price: 1300, createdAt: "2026-01-09T10:25:00.000Z" },
  { id: "p12", name: "Aceite girasol 900ml", price: 3200, createdAt: "2026-01-09T13:50:00.000Z" },
  { id: "p13", name: "Sal fina 500g", price: 900, createdAt: "2026-01-10T08:45:00.000Z" },
  { id: "p14", name: "Azucar 1kg", price: 1700, createdAt: "2026-01-10T12:10:00.000Z" },
  { id: "p15", name: "Cafe molido 250g", price: 4200, createdAt: "2026-01-11T09:15:00.000Z" },
  { id: "p16", name: "Te en saquitos", price: 1500, createdAt: "2026-01-11T15:35:00.000Z" },
  { id: "p17", name: "Manteca 200g", price: 2100, createdAt: "2026-01-12T10:05:00.000Z" },
  { id: "p18", name: "Crema de leche 200ml", price: 1900, createdAt: "2026-01-12T18:00:00.000Z" },
  { id: "p19", name: "Galletitas dulces", price: 1600, createdAt: "2026-01-13T08:20:00.000Z" },
  { id: "p20", name: "Galletitas saladas", price: 1500, createdAt: "2026-01-13T16:30:00.000Z" },
  { id: "p21", name: "Dulce de leche 400g", price: 2800, createdAt: "2026-01-14T09:40:00.000Z" },
  { id: "p22", name: "Mermelada frutilla 450g", price: 2600, createdAt: "2026-01-14T12:55:00.000Z" },
  { id: "p23", name: "Atun en lata", price: 2400, createdAt: "2026-01-15T11:10:00.000Z" },
  { id: "p24", name: "Tomate triturado 520g", price: 1700, createdAt: "2026-01-15T14:00:00.000Z" },
  { id: "p25", name: "Mayonesa 500g", price: 2300, createdAt: "2026-01-16T09:25:00.000Z" },
  { id: "p26", name: "Ketchup 500g", price: 2100, createdAt: "2026-01-16T12:45:00.000Z" },
  { id: "p27", name: "Mostaza 250g", price: 1600, createdAt: "2026-01-17T10:00:00.000Z" },
  { id: "p28", name: "Cereal 300g", price: 2700, createdAt: "2026-01-17T17:20:00.000Z" },
  { id: "p29", name: "Chocolate barra 100g", price: 1900, createdAt: "2026-01-18T09:35:00.000Z" },
  { id: "p30", name: "Caramelos surtidos", price: 1100, createdAt: "2026-01-18T15:10:00.000Z" },
  { id: "p31", name: "Yerba mate 1kg", price: 5200, createdAt: "2026-01-19T08:55:00.000Z" },
  { id: "p32", name: "Agua con gas 500ml", price: 1200, createdAt: "2026-01-21T13:05:00.000Z" },
  { id: "p33", name: "Jugo en polvo", price: 800, createdAt: "2026-01-24T09:00:00.000Z" },
  { id: "p34", name: "Papel higienico x4", price: 2600, createdAt: "2026-01-24T12:10:00.000Z" },
  { id: "p35", name: "Servilletas x100", price: 1500, createdAt: "2026-01-24T14:30:00.000Z" },
  { id: "p36", name: "Jabon liquido 500ml", price: 2400, createdAt: "2026-01-25T09:05:00.000Z" },
  { id: "p37", name: "Detergente 750ml", price: 2300, createdAt: "2026-01-25T11:20:00.000Z" },
  { id: "p38", name: "Lavandina 1L", price: 1800, createdAt: "2026-01-25T13:45:00.000Z" },
  { id: "p39", name: "Esponja doble", price: 700, createdAt: "2026-01-25T16:10:00.000Z" },
  { id: "p40", name: "Cepillo dientes", price: 1200, createdAt: "2026-01-26T08:20:00.000Z" },
  { id: "p41", name: "Pasta dental 90g", price: 1900, createdAt: "2026-01-26T09:40:00.000Z" },
  { id: "p42", name: "Shampoo 400ml", price: 3200, createdAt: "2026-01-26T10:55:00.000Z" },
  { id: "p43", name: "Acondicionador 400ml", price: 3300, createdAt: "2026-01-26T12:05:00.000Z" },
  { id: "p44", name: "Desodorante aerosol", price: 2800, createdAt: "2026-01-26T13:25:00.000Z" },
  { id: "p45", name: "Crema corporal 250ml", price: 3500, createdAt: "2026-01-26T15:15:00.000Z" },
  { id: "p46", name: "Avena 500g", price: 1700, createdAt: "2026-01-27T08:10:00.000Z" },
  { id: "p47", name: "Granola 400g", price: 2900, createdAt: "2026-01-27T09:30:00.000Z" },
  { id: "p48", name: "Miel 500g", price: 3600, createdAt: "2026-01-27T10:50:00.000Z" },
  { id: "p49", name: "Barra cereal", price: 900, createdAt: "2026-01-27T12:05:00.000Z" },
  { id: "p50", name: "Gaseosa cola 2L", price: 2500, createdAt: "2026-01-27T14:20:00.000Z" },
  { id: "p51", name: "Bebida isotónica 500ml", price: 2100, createdAt: "2026-01-27T16:00:00.000Z" },
  { id: "p52", name: "Agua mineral 2L", price: 1600, createdAt: "2026-01-27T17:25:00.000Z" },
  { id: "p53", name: "Tapa de empanadas", price: 1400, createdAt: "2026-01-28T08:15:00.000Z" },
  { id: "p54", name: "Pan rallado 500g", price: 1500, createdAt: "2026-01-28T09:35:00.000Z" },
  { id: "p55", name: "Pure de tomate 340g", price: 1200, createdAt: "2026-01-28T10:50:00.000Z" },
  { id: "p56", name: "Lentejas 400g", price: 1800, createdAt: "2026-01-28T12:10:00.000Z" },
  { id: "p57", name: "Porotos 400g", price: 1900, createdAt: "2026-01-28T13:40:00.000Z" },
  { id: "p58", name: "Maiz en lata", price: 1300, createdAt: "2026-01-28T15:00:00.000Z" },
  { id: "p59", name: "Arvejas en lata", price: 1400, createdAt: "2026-01-28T16:20:00.000Z" },
  { id: "p60", name: "Salsa soja 250ml", price: 2600, createdAt: "2026-01-28T17:30:00.000Z" },
  { id: "p61", name: "Vinagre 500ml", price: 1500, createdAt: "2026-01-28T18:45:00.000Z" },
  { id: "p62", name: "Condimento pizza", price: 900, createdAt: "2026-01-28T19:10:00.000Z" },
  { id: "p63", name: "Pimienta molida 50g", price: 1200, createdAt: "2026-01-28T20:00:00.000Z" },
].map((item, index) => ({ ...item, barcode: buildDefaultBarcode(item.id, index) }));

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
    .replaceAll("Ã¡", "á")
    .replaceAll("Ã©", "é")
    .replaceAll("Ã­", "í")
    .replaceAll("Ã³", "ó")
    .replaceAll("Ãº", "ú")
    .replaceAll("Ã±", "ñ")
    .replaceAll("Ã", "Á")
    .replaceAll("Ã‰", "É")
    .replaceAll("Ã", "Í")
    .replaceAll("Ã“", "Ó")
    .replaceAll("Ãš", "Ú")
    .replaceAll("Ã‘", "Ñ")
    .replaceAll("â€¦", "…")
    .replaceAll("â†‘", "↑")
    .replaceAll("â†“", "↓");
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

  // si el seed creció, completar faltantes por id
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
