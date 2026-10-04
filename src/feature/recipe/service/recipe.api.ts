import { readJsonOrThrow } from "../../../shared/http/http";
import type { Recipe, RecipeDraft } from "../model/recipe.types";

const FAKE_API_URL = (import.meta.env.VITE_FAKE_API_URL || "").trim();

function getUrl(path: string) {
  return FAKE_API_URL ? `${FAKE_API_URL}${path}` : path;
}

export async function fetchRecipesApi(): Promise<Recipe[]> {
  const response = await fetch(getUrl("/recipes"));
  return await readJsonOrThrow<Recipe[]>(response);
}

export async function createRecipeApi(draft: RecipeDraft): Promise<Recipe> {
  const response = await fetch(getUrl("/recipes"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<Recipe>(response);
}

export async function updateRecipeApi(id: string, draft: RecipeDraft): Promise<Recipe | null> {
  const response = await fetch(getUrl(`/recipes/${encodeURIComponent(id)}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  if (response.status === 404) return null;
  return await readJsonOrThrow<Recipe>(response);
}

export async function deleteRecipeApi(id: string): Promise<boolean> {
  const response = await fetch(getUrl(`/recipes/${encodeURIComponent(id)}`), { method: "DELETE" });
  const data = await readJsonOrThrow<{ ok: boolean }>(response);
  return !!data.ok;
}
