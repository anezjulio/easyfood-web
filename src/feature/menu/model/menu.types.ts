import type { IngredientStockMode } from "../../ingredient/model/ingredient.types";
import type { ProductCategory } from "../../product/model/product.types";

export type MenuRecipeItem = {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  stockMode: IngredientStockMode;
};

export type MenuComboItem = {
  type: "product" | "category";
  menuProductId?: string;
  menuProductName?: string;
  category?: ProductCategory;
  categoryName?: string;
  quantity: number;
};

export type MenuProductKind = "menu" | "combo";

export type MenuProduct = {
  id: string;
  name: string;
  price: number;
  description?: string;
  imageUrl?: string;
  category?: ProductCategory;
  recipeItems: MenuRecipeItem[];
  kind?: MenuProductKind;
  comboItems?: MenuComboItem[];
  createdAt: string;
  updatedAt?: string;
};

export type MenuProductDraft = {
  name: string;
  price: number;
  description?: string;
  imageUrl?: string;
  category?: ProductCategory;
  recipeItems: MenuRecipeItem[];
  kind?: MenuProductKind;
  comboItems?: MenuComboItem[];
};

