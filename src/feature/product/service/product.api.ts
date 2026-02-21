import type { PriceMarginSettings, Product, ProductCategory } from "../model/product.types";
import {
  createProductPriceRecord,
  createProduct,
  getProductPrices,
  getPriceMarginSettings,
  loadProducts,
  removeProductPriceMargin,
  removeProduct,
  requestProductDeletion,
  updateCategoryPriceMargin,
  updateProduct,
  upsertProductPriceMargin,
  type ProductDeleteRequest,
  type ProductDraft,
  type ProductPrice,
} from "./product.storage";

const USE_FAKE_API = import.meta.env.VITE_USE_FAKE_API === "true";
const FAKE_API_URL = (import.meta.env.VITE_FAKE_API_URL || "").trim();

function getUrl(path: string) {
  return FAKE_API_URL ? `${FAKE_API_URL}${path}` : path;
}

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchProducts(): Promise<Product[]> {
  if (USE_FAKE_API) {
    const response = await fetch(getUrl("/products"));
    return await readJsonOrThrow<Product[]>(response);
  }
  return Promise.resolve(loadProducts());
}

export async function createProductApi(draft: ProductDraft): Promise<Product> {
  if (USE_FAKE_API) {
    const response = await fetch(getUrl("/products"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    return await readJsonOrThrow<Product>(response);
  }
  return Promise.resolve(createProduct(draft));
}

export async function updateProductApi(id: string, draft: ProductDraft): Promise<Product | null> {
  if (USE_FAKE_API) {
    const response = await fetch(getUrl(`/products/${encodeURIComponent(id)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (response.status === 404) return null;
    return await readJsonOrThrow<Product>(response);
  }
  return Promise.resolve(updateProduct(id, draft));
}

export async function deleteProductApi(id: string): Promise<boolean> {
  if (USE_FAKE_API) {
    const response = await fetch(getUrl(`/products/${encodeURIComponent(id)}`), {
      method: "DELETE",
    });
    const data = await readJsonOrThrow<{ ok: boolean }>(response);
    return !!data.ok;
  }
  return Promise.resolve(removeProduct(id));
}

export async function requestProductDeletionApi(product: Product, requestedBy: string): Promise<ProductDeleteRequest> {
  if (USE_FAKE_API) {
    const response = await fetch(getUrl("/delete-requests"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: product.id,
        productName: product.name,
        requestedBy,
      }),
    });
    return await readJsonOrThrow<ProductDeleteRequest>(response);
  }
  return Promise.resolve(requestProductDeletion(product, requestedBy));
}

export async function fetchProductPricesApi(): Promise<ProductPrice[]> {
  if (USE_FAKE_API) {
    const response = await fetch(getUrl("/product-prices"));
    return await readJsonOrThrow<ProductPrice[]>(response);
  }
  return Promise.resolve(getProductPrices());
}

export async function createProductPriceApi(draft: {
  productId: string;
  newPrice: number;
  costPrice?: number;
  marginPercent?: number;
}): Promise<ProductPrice> {
  if (USE_FAKE_API) {
    const response = await fetch(getUrl("/product-prices"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    return await readJsonOrThrow<ProductPrice>(response);
  }
  return Promise.resolve(createProductPriceRecord(draft));
}

export async function fetchPriceMarginSettingsApi(): Promise<PriceMarginSettings> {
  if (USE_FAKE_API) {
    const response = await fetch(getUrl("/price-margin-settings"));
    return await readJsonOrThrow<PriceMarginSettings>(response);
  }
  return Promise.resolve(getPriceMarginSettings());
}

export async function updateCategoryPriceMarginApi(
  category: ProductCategory,
  marginPercent: number,
): Promise<PriceMarginSettings> {
  if (USE_FAKE_API) {
    const response = await fetch(getUrl(`/price-margin-settings/category/${encodeURIComponent(category)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marginPercent }),
    });
    return await readJsonOrThrow<PriceMarginSettings>(response);
  }
  return Promise.resolve(updateCategoryPriceMargin(category, marginPercent));
}

export async function upsertProductPriceMarginApi(productId: string, marginPercent: number): Promise<PriceMarginSettings> {
  if (USE_FAKE_API) {
    const response = await fetch(getUrl(`/price-margin-settings/product/${encodeURIComponent(productId)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marginPercent }),
    });
    return await readJsonOrThrow<PriceMarginSettings>(response);
  }
  return Promise.resolve(upsertProductPriceMargin(productId, marginPercent));
}

export async function removeProductPriceMarginApi(productId: string): Promise<PriceMarginSettings> {
  if (USE_FAKE_API) {
    const response = await fetch(getUrl(`/price-margin-settings/product/${encodeURIComponent(productId)}`), {
      method: "DELETE",
    });
    return await readJsonOrThrow<PriceMarginSettings>(response);
  }
  return Promise.resolve(removeProductPriceMargin(productId));
}
