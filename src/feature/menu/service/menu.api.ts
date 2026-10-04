import type { Combo } from "../../combo/model/combo.types";
import { createComboApi, deleteComboApi, fetchCombosApi, updateComboApi } from "../../combo/service/combo.api";
import type { Product } from "../../product/model/product.types";
import { createProductApi, deleteProductApi, fetchProducts, updateProductApi } from "../../product/service/product.api";
import type { Recipe } from "../../recipe/model/recipe.types";
import { createRecipeApi, deleteRecipeApi, fetchRecipesApi, updateRecipeApi } from "../../recipe/service/recipe.api";
import { fetchIngredientsApi } from "../../ingredient/service/ingredient.api";
import type { Ingredient } from "../../ingredient/model/ingredient.types";
import type { MenuComboItem, MenuProduct, MenuProductDraft } from "../model/menu.types";

function comboToMenuComboItems(combo: Combo): MenuComboItem[] {
  return [
    ...combo.items.map((item) => ({
      type: "product" as const,
      menuProductId: item.productId,
      menuProductName: item.productId,
      quantity: item.quantity,
    })),
    ...combo.optionGroups.map((group) => ({
      type: "category" as const,
      category: group.id,
      categoryName: group.name,
      allowedMenuProductIds: group.productIds,
      quantity: group.quantity,
    })),
  ];
}

function productToMenuProduct(product: Product, recipes: Recipe[], combos: Combo[], ingredients: Ingredient[]): MenuProduct | null {
  if (product.type !== "receta" && product.type !== "combo") return null;
  const recipe = recipes.find((item) => item.id === product.recipeId || item.productId === product.id);
  const combo = combos.find((item) => item.id === product.comboId || item.productId === product.id);
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    description: product.description,
    imageUrl: product.imageUrl,
    category: product.category || product.categoryIds?.[0],
    categoryIds: product.categoryIds || (product.category ? [product.category] : []),
    recipeItems: (recipe?.ingredients || []).map((item) => {
      const ingredient = ingredients.find((node) => node.id === item.ingredientId);
      return {
        ingredientId: item.ingredientId,
        ingredientName: ingredient?.name || item.ingredientId,
        quantity: item.quantity,
        stockMode: ingredient?.stockMode || (ingredient?.metric === "weight" ? "weight" : "unit"),
      };
    }),
    kind: product.type === "combo" ? "combo" : "menu",
    comboItems: combo ? comboToMenuComboItems(combo) : undefined,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export async function fetchMenuProductsApi(): Promise<MenuProduct[]> {
  const [products, recipes, combos, ingredients] = await Promise.all([fetchProducts(), fetchRecipesApi(), fetchCombosApi(), fetchIngredientsApi()]);
  return products.map((product) => productToMenuProduct(product, recipes, combos, ingredients)).filter((item): item is MenuProduct => !!item);
}

export async function createMenuProductApi(draft: MenuProductDraft): Promise<MenuProduct> {
  const type = draft.kind === "combo" ? "combo" : "receta";
  const product = await createProductApi({
    name: draft.name,
    description: draft.description,
    imageUrl: draft.imageUrl,
    price: draft.price,
    costPrice: 0,
    category: draft.category,
    categoryIds: draft.categoryIds || (draft.category ? [draft.category] : []),
    type,
    stockMode: "unit",
    stockType: type,
  });

  if (type === "combo") {
    const combo = await createComboApi({
      productId: product.id,
      items: (draft.comboItems || [])
        .filter((item) => item.type === "product" && item.menuProductId)
        .map((item) => ({ productId: item.menuProductId!, quantity: item.quantity })),
      optionGroups: (draft.comboItems || [])
        .filter((item) => item.type === "category" && item.category)
        .map((item) => ({
          id: item.category!,
          name: item.categoryName || item.category!,
          quantity: item.quantity,
          productIds: item.allowedMenuProductIds || [],
        })),
    });
    await updateProductApi(product.id, { ...product, comboId: combo.id, type, stockType: type });
  } else {
    const recipe = await createRecipeApi({
      productId: product.id,
      ingredients: draft.recipeItems.map((item) => ({ ingredientId: item.ingredientId, quantity: item.quantity })),
    });
    await updateProductApi(product.id, { ...product, recipeId: recipe.id, type, stockType: type });
  }

  const list = await fetchMenuProductsApi();
  return list.find((item) => item.id === product.id) || { ...draft, id: product.id, kind: type === "combo" ? "combo" : "menu", createdAt: product.createdAt };
}

export async function updateMenuProductApi(id: string, draft: MenuProductDraft): Promise<MenuProduct | null> {
  const [products, recipes, combos] = await Promise.all([fetchProducts(), fetchRecipesApi(), fetchCombosApi()]);
  const current = products.find((item) => item.id === id);
  if (!current) return null;
  const type = draft.kind === "combo" ? "combo" : "receta";

  await updateProductApi(id, {
    ...current,
    name: draft.name,
    description: draft.description,
    imageUrl: draft.imageUrl,
    price: draft.price,
    costPrice: current.costPrice || 0,
    category: draft.category,
    categoryIds: draft.categoryIds || (draft.category ? [draft.category] : []),
    type,
    stockMode: "unit",
    stockType: type,
  });

  if (type === "combo") {
    const combo = combos.find((item) => item.id === current.comboId || item.productId === id);
    const comboDraft = {
      productId: id,
      items: (draft.comboItems || [])
        .filter((item) => item.type === "product" && item.menuProductId)
        .map((item) => ({ productId: item.menuProductId!, quantity: item.quantity })),
      optionGroups: (draft.comboItems || [])
        .filter((item) => item.type === "category" && item.category)
        .map((item) => ({
          id: item.category!,
          name: item.categoryName || item.category!,
          quantity: item.quantity,
          productIds: item.allowedMenuProductIds || [],
        })),
    };
    combo ? await updateComboApi(combo.id, comboDraft) : await createComboApi(comboDraft);
  } else {
    const recipe = recipes.find((item) => item.id === current.recipeId || item.productId === id);
    const recipeDraft = {
      productId: id,
      ingredients: draft.recipeItems.map((item) => ({ ingredientId: item.ingredientId, quantity: item.quantity })),
    };
    recipe ? await updateRecipeApi(recipe.id, recipeDraft) : await createRecipeApi(recipeDraft);
  }

  const list = await fetchMenuProductsApi();
  return list.find((item) => item.id === id) || null;
}

export async function deleteMenuProductApi(id: string): Promise<boolean> {
  const [products, recipes, combos] = await Promise.all([fetchProducts(), fetchRecipesApi(), fetchCombosApi()]);
  const product = products.find((item) => item.id === id);
  if (!product) return false;
  const recipe = recipes.find((item) => item.id === product.recipeId || item.productId === id);
  const combo = combos.find((item) => item.id === product.comboId || item.productId === id);
  if (recipe) await deleteRecipeApi(recipe.id);
  if (combo) await deleteComboApi(combo.id);
  return await deleteProductApi(id);
}
