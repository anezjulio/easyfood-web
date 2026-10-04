import type { Ingredient, IngredientStockMode } from "../../ingredient/model/ingredient.types";
import type { MenuRecipeItem } from "../../menu/model/menu.types";
import type { Product } from "../../product/model/product.types";

export type StockConsumptionMode = "direct-stock" | "recipe";

export type StockConsumptionItem = {
  sourceId: string;
  sourceName: string;
  quantity: number;
  stockMode: IngredientStockMode;
};

export type StockConsumptionPlan = {
  mode: StockConsumptionMode;
  items: StockConsumptionItem[];
};

export function buildDirectProductStockPlan(product: Product, quantity: number): StockConsumptionPlan {
  return {
    mode: "direct-stock",
    items: [
      {
        sourceId: product.id,
        sourceName: product.name,
        quantity: Math.max(0, Math.trunc(Number(quantity) || 0)),
        stockMode: "unit",
      },
    ],
  };
}

export function buildRecipeStockPlan(recipeItems: MenuRecipeItem[], saleQuantity: number): StockConsumptionPlan {
  const multiplier = Math.max(0, Math.trunc(Number(saleQuantity) || 0));
  return {
    mode: "recipe",
    items: recipeItems.map((item) => ({
      sourceId: item.ingredientId,
      sourceName: item.ingredientName,
      quantity: item.quantity * multiplier,
      stockMode: item.stockMode,
    })),
  };
}

export function resolvePortionGrams(ingredient: Ingredient): number {
  if (ingredient.stockMode !== "weight") return 1;
  return Math.max(0, Math.trunc(Number(ingredient.portionSizeGrams) || 0));
}
