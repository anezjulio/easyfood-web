import { loadIngredients } from "../../ingredient/service/ingredient.storage";
import type { MenuProduct, MenuProductDraft, MenuRecipeItem } from "../model/menu.types";

const KEY = "easyfood_menu_product_v1";

const seed: MenuProduct[] = [
  {
    id: "menu-hamburguesa-simple",
    name: "Hamburguesa simple",
    price: 4500,
    description: "Pan, carne, queso, lechuga y tomate.",
    imageUrl: "images/nueva-db-1/food-hamburger.png",
    recipeItems: [
      { ingredientId: "ing-pan-hamburguesa", ingredientName: "Pan de hamburguesa", quantity: 1, stockMode: "unit" },
      { ingredientId: "ing-carne-medallon", ingredientName: "Medallon de carne", quantity: 1, stockMode: "unit" },
      { ingredientId: "ing-queso-feta", ingredientName: "Queso en feta", quantity: 1, stockMode: "unit" },
      { ingredientId: "ing-lechuga", ingredientName: "Lechuga", quantity: 20, stockMode: "weight" },
      { ingredientId: "ing-tomate", ingredientName: "Tomate", quantity: 35, stockMode: "weight" },
    ],
    createdAt: "2026-02-01T11:00:00.000Z",
  },
  {
    id: "menu-hamburguesa-doble",
    name: "Hamburguesa doble",
    price: 6200,
    description: "Pan, doble carne, doble queso, cebolla, lechuga y tomate.",
    imageUrl: "images/nueva-db-1/food-hamburger.png",
    recipeItems: [
      { ingredientId: "ing-pan-hamburguesa", ingredientName: "Pan de hamburguesa", quantity: 1, stockMode: "unit" },
      { ingredientId: "ing-carne-medallon", ingredientName: "Medallon de carne", quantity: 2, stockMode: "unit" },
      { ingredientId: "ing-queso-feta", ingredientName: "Queso en feta", quantity: 2, stockMode: "unit" },
      { ingredientId: "ing-cebolla", ingredientName: "Cebolla", quantity: 20, stockMode: "weight" },
      { ingredientId: "ing-lechuga", ingredientName: "Lechuga", quantity: 20, stockMode: "weight" },
      { ingredientId: "ing-tomate", ingredientName: "Tomate", quantity: 35, stockMode: "weight" },
    ],
    createdAt: "2026-02-01T11:05:00.000Z",
  },
  {
    id: "menu-pancho",
    name: "Pancho",
    price: 2800,
    description: "Pan y salchicha.",
    imageUrl: "images/nueva-db-1/food-hotdog.png",
    recipeItems: [
      { ingredientId: "ing-pan-pancho", ingredientName: "Pan de pancho", quantity: 1, stockMode: "unit" },
      { ingredientId: "ing-salchicha", ingredientName: "Salchicha", quantity: 1, stockMode: "unit" },
    ],
    createdAt: "2026-02-01T11:10:00.000Z",
  },
  {
    id: "menu-sandwich-milanesa",
    name: "Sandwich de milanesa",
    price: 5800,
    description: "Pan, milanesa, lechuga y tomate.",
    imageUrl: "images/nueva-db-1/food-hamburger.png",
    recipeItems: [
      { ingredientId: "ing-pan-hamburguesa", ingredientName: "Pan de hamburguesa", quantity: 1, stockMode: "unit" },
      { ingredientId: "ing-milanesa", ingredientName: "Milanesa cocida", quantity: 1, stockMode: "unit" },
      { ingredientId: "ing-lechuga", ingredientName: "Lechuga", quantity: 25, stockMode: "weight" },
      { ingredientId: "ing-tomate", ingredientName: "Tomate", quantity: 40, stockMode: "weight" },
    ],
    createdAt: "2026-02-01T11:15:00.000Z",
  },
];

function padIdPart(value: number): string {
  return String(value).padStart(2, "0");
}

function formatIdDatePart(input: Date): string {
  return `${padIdPart(input.getDate())}${padIdPart(input.getMonth() + 1)}${input.getFullYear()}${padIdPart(input.getHours())}${padIdPart(input.getMinutes())}${padIdPart(input.getSeconds())}`;
}

function buildEntityId(prefix: string, inputDate = new Date()): string {
  const suffix = Math.floor(Math.random() * 10_000).toString().padStart(4, "0");
  return `${prefix}${formatIdDatePart(inputDate)}${suffix}`;
}

function normalizeRecipeItems(input: unknown): MenuRecipeItem[] {
  if (!Array.isArray(input)) return [];
  const ingredients = loadIngredients();
  return input
    .map((item) => {
      const draft = (item || {}) as Partial<MenuRecipeItem>;
      const ingredientId = String(draft.ingredientId || "").trim();
      const ingredient = ingredients.find((node) => node.id === ingredientId);
      const quantity = Number(draft.quantity);
      if (!ingredient || !Number.isFinite(quantity) || quantity <= 0) return null;
      return {
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        quantity,
        stockMode: ingredient.stockMode,
      };
    })
    .filter((item): item is MenuRecipeItem => !!item);
}

function normalizeMenuProductRecord(input: unknown): MenuProduct | null {
  const draft = (input || {}) as Partial<MenuProduct>;
  const id = String(draft.id || "").trim();
  const name = String(draft.name || "").trim();
  const price = Math.max(0, Math.trunc(Number(draft.price) || 0));
  const recipeItems = normalizeRecipeItems(draft.recipeItems);
  if (!id || !name || recipeItems.length === 0) return null;
  return {
    id,
    name,
    price,
    description: String(draft.description || "").trim() || undefined,
    imageUrl: String(draft.imageUrl || "").trim() || undefined,
    recipeItems,
    createdAt: String(draft.createdAt || "").trim() || new Date().toISOString(),
    updatedAt: String(draft.updatedAt || "").trim() || undefined,
  };
}

function safeParse(raw: string | null): MenuProduct[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((item) => normalizeMenuProductRecord(item)).filter((item): item is MenuProduct => !!item)
      : [];
  } catch {
    return [];
  }
}

function normalizeDraft(draft: MenuProductDraft) {
  const name = draft.name.trim();
  const price = Math.max(0, Math.trunc(Number(draft.price) || 0));
  const description = draft.description?.trim() || undefined;
  const imageUrl = draft.imageUrl?.trim() || undefined;
  const recipeItems = normalizeRecipeItems(draft.recipeItems);
  return { name, price, description, imageUrl, recipeItems };
}

export function loadMenuProducts(): MenuProduct[] {
  const list = safeParse(localStorage.getItem(KEY));
  if (list.length === 0) {
    saveMenuProducts(seed);
    return seed;
  }

  const existingIds = new Set(list.map((item) => item.id));
  const merged = [...list, ...seed.filter((item) => !existingIds.has(item.id))];
  if (merged.length !== list.length) {
    saveMenuProducts(merged);
    return merged;
  }

  return list;
}

export function saveMenuProducts(menuProducts: MenuProduct[]) {
  localStorage.setItem(KEY, JSON.stringify(menuProducts));
}

export function createMenuProduct(draft: MenuProductDraft): MenuProduct {
  const normalized = normalizeDraft(draft);
  if (!normalized.name || normalized.recipeItems.length === 0) {
    throw new Error("Menu product must define name and recipe items");
  }
  const menuProduct: MenuProduct = {
    id: buildEntityId("menu"),
    name: normalized.name,
    price: normalized.price,
    description: normalized.description,
    imageUrl: normalized.imageUrl,
    recipeItems: normalized.recipeItems,
    createdAt: new Date().toISOString(),
  };
  saveMenuProducts([menuProduct, ...loadMenuProducts()]);
  return menuProduct;
}

export function updateMenuProduct(id: string, draft: MenuProductDraft): MenuProduct | null {
  const normalized = normalizeDraft(draft);
  if (!normalized.name || normalized.recipeItems.length === 0) {
    throw new Error("Menu product must define name and recipe items");
  }
  let updated: MenuProduct | null = null;
  const next = loadMenuProducts().map((item) => {
    if (item.id !== id) return item;
    updated = {
      ...item,
      name: normalized.name,
      price: normalized.price,
      description: normalized.description,
      imageUrl: normalized.imageUrl,
      recipeItems: normalized.recipeItems,
      updatedAt: new Date().toISOString(),
    };
    return updated;
  });
  if (!updated) return null;
  saveMenuProducts(next);
  return updated;
}

export function removeMenuProduct(id: string): boolean {
  const list = loadMenuProducts();
  const next = list.filter((item) => item.id !== id);
  if (next.length === list.length) return false;
  saveMenuProducts(next);
  return true;
}
