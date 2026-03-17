import type { Product } from "./product.types";
import { normalizeForSearch } from "../../../shared/search/search";

export function isPanchoProductType(name: string): boolean {
  return normalizeForSearch(name).includes("pancho");
}

export function generateAutoBarcode(): string {
  const base = `${Date.now()}${Math.floor(Math.random() * 10_000)}`.replace(/\D/g, "");
  const suffix = base.slice(-10).padStart(10, "0");
  return `779${suffix}`;
}

export function generatePanchoBarcode(): string {
  return generateAutoBarcode();
}

export function normalizeBarcodeInput(value: string) {
  return String(value || "").trim();
}

export function findBarcodeConflict<T extends Pick<Product, "id" | "barcode" | "name">>(
  products: T[],
  barcode: string,
  currentProductId?: string | null,
) {
  const normalized = normalizeBarcodeInput(barcode);
  if (!normalized) return null;

  return (
    products.find(
      (item) =>
        normalizeBarcodeInput(item.barcode || "") === normalized &&
        (!currentProductId || item.id !== currentProductId),
    ) || null
  );
}

export function generateUniqueAutoBarcode(
  products: Pick<Product, "id" | "barcode" | "name">[],
  currentProductId?: string | null,
) {
  for (let index = 0; index < 20; index += 1) {
    const candidate = generateAutoBarcode();
    if (!findBarcodeConflict(products, candidate, currentProductId)) {
      return candidate;
    }
  }
  return generateAutoBarcode();
}
