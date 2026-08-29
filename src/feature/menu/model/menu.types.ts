import type { IngredientStockMode } from "../../ingredient/model/ingredient.types";

export type MenuRecipeItem = {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  stockMode: IngredientStockMode;
};

export type MenuProduct = {
  id: string;
  name: string;
  price: number;
  description?: string;
  recipeItems: MenuRecipeItem[];
  createdAt: string;
  updatedAt?: string;
};

export type MenuProductDraft = {
  name: string;
  price: number;
  description?: string;
  recipeItems: MenuRecipeItem[];
};

