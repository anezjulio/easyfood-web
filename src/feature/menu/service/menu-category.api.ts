import { readJsonOrThrow } from "../../../shared/http/http";
import type { MenuCategory, MenuCategoryDraft } from "../model/menu-category.types";

export const MENU_CATEGORIES_CHANGED_EVENT = "easyfood-menu-categories-changed";

const FAKE_API_URL = (import.meta.env.VITE_FAKE_API_URL || "").trim();

function getUrl(path: string) {
  return FAKE_API_URL ? `${FAKE_API_URL}${path}` : path;
}

function notifyMenuCategoriesChanged(categoryId?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MENU_CATEGORIES_CHANGED_EVENT, { detail: { categoryId } }));
}

export async function fetchMenuCategoriesApi(): Promise<MenuCategory[]> {
  const response = await fetch(getUrl("/menu-categories"));
  return await readJsonOrThrow<MenuCategory[]>(response);
}

export async function createMenuCategoryApi(draft: MenuCategoryDraft): Promise<MenuCategory> {
  const response = await fetch(getUrl("/menu-categories"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  const result = await readJsonOrThrow<MenuCategory>(response);
  notifyMenuCategoriesChanged(result.id);
  return result;
}

export async function updateMenuCategoryApi(id: string, draft: MenuCategoryDraft): Promise<MenuCategory | null> {
  const response = await fetch(getUrl(`/menu-categories/${encodeURIComponent(id)}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  if (response.status === 404) return null;
  const result = await readJsonOrThrow<MenuCategory>(response);
  notifyMenuCategoriesChanged(result.id);
  return result;
}

export async function deleteMenuCategoryApi(id: string): Promise<boolean> {
  const response = await fetch(getUrl(`/menu-categories/${encodeURIComponent(id)}`), {
    method: "DELETE",
  });
  const data = await readJsonOrThrow<{ ok: boolean }>(response);
  if (data.ok) notifyMenuCategoriesChanged(id);
  return !!data.ok;
}
