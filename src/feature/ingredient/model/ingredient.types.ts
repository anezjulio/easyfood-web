export const INGREDIENT_STOCK_MODES = ["weight", "package", "unit"] as const;

export type IngredientStockMode = (typeof INGREDIENT_STOCK_MODES)[number];

export type Ingredient = {
  id: string;
  name: string;
  expiresInDays: number;
  stockMode: IngredientStockMode;
  stockQuantity: number;
  createdAt: string;
  updatedAt?: string;
  lastEntryAt?: string;
  nextExpirationDate?: string;
};

export type IngredientDraft = {
  name: string;
  expiresInDays: number;
  stockMode: IngredientStockMode;
  stockQuantity?: number;
  entryQuantity?: number;
};

export function getIngredientStockModeLabel(mode: IngredientStockMode): string {
  if (mode === "weight") return "Por peso";
  if (mode === "package") return "Por paquete";
  return "Por unidad";
}

export function getIngredientQuantityUnitLabel(mode: IngredientStockMode): string {
  if (mode === "weight") return "g";
  if (mode === "package") return "paquetes";
  return "unidades";
}

export function formatIngredientQuantity(value: number, mode: IngredientStockMode): string {
  const quantity = Math.max(0, Number(value) || 0);
  if (mode === "weight") {
    if (quantity >= 1000) return `${(quantity / 1000).toLocaleString("es-AR", { maximumFractionDigits: 2 })} kg`;
    return `${Math.trunc(quantity).toLocaleString("es-AR")} g`;
  }
  const suffix = mode === "package" ? "paq." : "u.";
  return `${quantity.toLocaleString("es-AR", { maximumFractionDigits: 2 })} ${suffix}`;
}

