import { readJsonOrThrow } from "../../../shared/http/http";
import type { Ingredient, IngredientDraft } from "../model/ingredient.types";
import { createIngredient, loadIngredients, removeIngredient, updateIngredient } from "./ingredient.storage";

const USE_FAKE_API = import.meta.env.VITE_USE_FAKE_API === "true";
const FAKE_API_URL = (import.meta.env.VITE_FAKE_API_URL || "").trim();

function getUrl(path: string) {
  return FAKE_API_URL ? `${FAKE_API_URL}${path}` : path;
}

export async function fetchIngredientsApi(): Promise<Ingredient[]> {
  if (USE_FAKE_API) {
    const response = await fetch(getUrl("/ingredients"));
    return await readJsonOrThrow<Ingredient[]>(response);
  }
  return Promise.resolve(loadIngredients());
}

export async function createIngredientApi(draft: IngredientDraft): Promise<Ingredient> {
  if (USE_FAKE_API) {
    const response = await fetch(getUrl("/ingredients"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    return await readJsonOrThrow<Ingredient>(response);
  }
  return Promise.resolve(createIngredient(draft));
}

export async function updateIngredientApi(id: string, draft: IngredientDraft): Promise<Ingredient | null> {
  if (USE_FAKE_API) {
    const response = await fetch(getUrl(`/ingredients/${encodeURIComponent(id)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (response.status === 404) return null;
    return await readJsonOrThrow<Ingredient>(response);
  }
  return Promise.resolve(updateIngredient(id, draft));
}

export async function deleteIngredientApi(id: string): Promise<boolean> {
  if (USE_FAKE_API) {
    const response = await fetch(getUrl(`/ingredients/${encodeURIComponent(id)}`), {
      method: "DELETE",
    });
    const data = await readJsonOrThrow<{ ok: boolean }>(response);
    return !!data.ok;
  }
  return Promise.resolve(removeIngredient(id));
}

