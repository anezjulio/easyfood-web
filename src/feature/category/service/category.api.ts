import { readJsonOrThrow } from "../../../shared/http/http";
import type { Category, CategoryDraft } from "../model/category.types";

const FAKE_API_URL = (import.meta.env.VITE_FAKE_API_URL || "").trim();

function getUrl(path: string) {
  return FAKE_API_URL ? `${FAKE_API_URL}${path}` : path;
}

export async function fetchCategoriesApi(): Promise<Category[]> {
  const response = await fetch(getUrl("/categories"));
  return await readJsonOrThrow<Category[]>(response);
}

export async function createCategoryApi(draft: CategoryDraft): Promise<Category> {
  const response = await fetch(getUrl("/categories"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<Category>(response);
}

export async function updateCategoryApi(id: string, draft: CategoryDraft): Promise<Category | null> {
  const response = await fetch(getUrl(`/categories/${encodeURIComponent(id)}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  if (response.status === 404) return null;
  return await readJsonOrThrow<Category>(response);
}

export async function deleteCategoryApi(id: string): Promise<boolean> {
  const response = await fetch(getUrl(`/categories/${encodeURIComponent(id)}`), { method: "DELETE" });
  const data = await readJsonOrThrow<{ ok: boolean }>(response);
  return !!data.ok;
}
