import type { MenuCategory, MenuCategoryDraft } from "../model/menu-category.types";
import { createCategoryApi, deleteCategoryApi, fetchCategoriesApi, updateCategoryApi } from "../../category/service/category.api";

export const MENU_CATEGORIES_CHANGED_EVENT = "easyfood-menu-categories-changed";

function notifyMenuCategoriesChanged(categoryId?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MENU_CATEGORIES_CHANGED_EVENT, { detail: { categoryId } }));
}

export async function fetchMenuCategoriesApi(): Promise<MenuCategory[]> {
  return await fetchCategoriesApi();
}

export async function createMenuCategoryApi(draft: MenuCategoryDraft): Promise<MenuCategory> {
  const result = await createCategoryApi({ name: draft.name, productIds: [] });
  notifyMenuCategoriesChanged(result.id);
  return result;
}

export async function updateMenuCategoryApi(id: string, draft: MenuCategoryDraft): Promise<MenuCategory | null> {
  const current = (await fetchCategoriesApi()).find((item) => item.id === id);
  const result = await updateCategoryApi(id, { name: draft.name, productIds: current?.productIds || [] });
  if (!result) return null;
  notifyMenuCategoriesChanged(result.id);
  return result;
}

export async function deleteMenuCategoryApi(id: string): Promise<boolean> {
  const ok = await deleteCategoryApi(id);
  if (ok) notifyMenuCategoriesChanged(id);
  return ok;
}
