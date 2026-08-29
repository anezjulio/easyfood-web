import { readJsonOrThrow } from "../../../shared/http/http";
import type { MenuProduct, MenuProductDraft } from "../model/menu.types";
import { createMenuProduct, loadMenuProducts, removeMenuProduct, updateMenuProduct } from "./menu.storage";

const USE_FAKE_API = import.meta.env.VITE_USE_FAKE_API === "true";
const FAKE_API_URL = (import.meta.env.VITE_FAKE_API_URL || "").trim();

function getUrl(path: string) {
  return FAKE_API_URL ? `${FAKE_API_URL}${path}` : path;
}

export async function fetchMenuProductsApi(): Promise<MenuProduct[]> {
  if (USE_FAKE_API) {
    const response = await fetch(getUrl("/menu-products"));
    return await readJsonOrThrow<MenuProduct[]>(response);
  }
  return Promise.resolve(loadMenuProducts());
}

export async function createMenuProductApi(draft: MenuProductDraft): Promise<MenuProduct> {
  if (USE_FAKE_API) {
    const response = await fetch(getUrl("/menu-products"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    return await readJsonOrThrow<MenuProduct>(response);
  }
  return Promise.resolve(createMenuProduct(draft));
}

export async function updateMenuProductApi(id: string, draft: MenuProductDraft): Promise<MenuProduct | null> {
  if (USE_FAKE_API) {
    const response = await fetch(getUrl(`/menu-products/${encodeURIComponent(id)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (response.status === 404) return null;
    return await readJsonOrThrow<MenuProduct>(response);
  }
  return Promise.resolve(updateMenuProduct(id, draft));
}

export async function deleteMenuProductApi(id: string): Promise<boolean> {
  if (USE_FAKE_API) {
    const response = await fetch(getUrl(`/menu-products/${encodeURIComponent(id)}`), {
      method: "DELETE",
    });
    const data = await readJsonOrThrow<{ ok: boolean }>(response);
    return !!data.ok;
  }
  return Promise.resolve(removeMenuProduct(id));
}

