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
