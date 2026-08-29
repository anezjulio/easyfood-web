import type { Ingredient, IngredientDraft, IngredientStockMode } from "../model/ingredient.types";

const KEY = "easyfood_ingredient_v1";

const seed: Ingredient[] = [
  {
    id: "ing-pan-hamburguesa",
    name: "Pan de hamburguesa",
    expiresInDays: 5,
    stockMode: "unit",
    stockQuantity: 48,
    createdAt: "2026-02-01T10:00:00.000Z",
  },
  {
    id: "ing-carne-medallon",
    name: "Medallon de carne",
    expiresInDays: 3,
    stockMode: "unit",
    stockQuantity: 80,
    createdAt: "2026-02-01T10:05:00.000Z",
  },
  {
    id: "ing-queso-feta",
    name: "Queso en feta",
    expiresInDays: 7,
    stockMode: "unit",
    stockQuantity: 120,
    createdAt: "2026-02-01T10:10:00.000Z",
  },
  {
    id: "ing-cebolla",
    name: "Cebolla",
    expiresInDays: 10,
    stockMode: "weight",
    stockQuantity: 3500,
    createdAt: "2026-02-01T10:15:00.000Z",
  },
  {
    id: "ing-lechuga",
    name: "Lechuga",
    expiresInDays: 4,
    stockMode: "weight",
    stockQuantity: 1800,
    createdAt: "2026-02-01T10:20:00.000Z",
  },
  {
    id: "ing-tomate",
    name: "Tomate",
    expiresInDays: 5,
    stockMode: "weight",
    stockQuantity: 4200,
    createdAt: "2026-02-01T10:25:00.000Z",
  },
  {
    id: "ing-pan-pancho",
    name: "Pan de pancho",
    expiresInDays: 5,
    stockMode: "unit",
    stockQuantity: 60,
    createdAt: "2026-02-01T10:30:00.000Z",
  },
  {
    id: "ing-salchicha",
    name: "Salchicha",
    expiresInDays: 6,
    stockMode: "unit",
    stockQuantity: 60,
    createdAt: "2026-02-01T10:35:00.000Z",
  },
  {
    id: "ing-milanesa",
    name: "Milanesa cocida",
    expiresInDays: 2,
    stockMode: "unit",
    stockQuantity: 30,
    createdAt: "2026-02-01T10:40:00.000Z",
  },
  {
    id: "ing-papa",
    name: "Papa",
    expiresInDays: 12,
    stockMode: "weight",
    stockQuantity: 9000,
    createdAt: "2026-02-01T10:45:00.000Z",
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

function normalizeStockMode(value: unknown): IngredientStockMode {
  return value === "weight" || value === "package" || value === "unit" ? value : "unit";
}

function normalizeIngredientRecord(input: unknown): Ingredient | null {
  const draft = (input || {}) as Partial<Ingredient>;
  const id = String(draft.id || "").trim();
  const name = String(draft.name || "").trim();
  if (!id || !name) return null;

  const expiresInDays = Math.max(0, Math.trunc(Number(draft.expiresInDays) || 0));
  const stockQuantity = Math.max(0, Number(draft.stockQuantity) || 0);

  return {
    id,
    name,
    expiresInDays,
    stockMode: normalizeStockMode(draft.stockMode),
    stockQuantity,
    createdAt: String(draft.createdAt || "").trim() || new Date().toISOString(),
    updatedAt: String(draft.updatedAt || "").trim() || undefined,
    lastEntryAt: String(draft.lastEntryAt || "").trim() || undefined,
    nextExpirationDate: String(draft.nextExpirationDate || "").trim() || undefined,
  };
}

function safeParse(raw: string | null): Ingredient[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((item) => normalizeIngredientRecord(item)).filter((item): item is Ingredient => !!item)
      : [];
  } catch {
    return [];
  }
}

function buildExpirationDate(expiresInDays: number, inputDate = new Date()): string {
  const next = new Date(inputDate);
  next.setDate(next.getDate() + Math.max(0, Math.trunc(expiresInDays)));
  return next.toISOString().slice(0, 10);
}

function normalizeDraft(draft: IngredientDraft) {
  const name = draft.name.trim();
  const expiresInDays = Math.max(0, Math.trunc(Number(draft.expiresInDays) || 0));
  const stockMode = normalizeStockMode(draft.stockMode);
  const stockQuantity = Math.max(0, Number(draft.stockQuantity) || 0);
  const entryQuantity = Math.max(0, Number(draft.entryQuantity) || 0);
  return { name, expiresInDays, stockMode, stockQuantity, entryQuantity };
}

export function loadIngredients(): Ingredient[] {
  const list = safeParse(localStorage.getItem(KEY));
  if (list.length === 0) {
    saveIngredients(seed);
    return seed;
  }

  const existingIds = new Set(list.map((item) => item.id));
  const merged = [...list, ...seed.filter((item) => !existingIds.has(item.id))];
  if (merged.length !== list.length) {
    saveIngredients(merged);
    return merged;
  }

  return list;
}

export function saveIngredients(ingredients: Ingredient[]) {
  localStorage.setItem(KEY, JSON.stringify(ingredients));
}

export function createIngredient(draft: IngredientDraft): Ingredient {
  const normalized = normalizeDraft(draft);
  if (!normalized.name) {
    throw new Error("Ingredient name is required");
  }

  const now = new Date();
  const ingredient: Ingredient = {
    id: buildEntityId("ing"),
    name: normalized.name,
    expiresInDays: normalized.expiresInDays,
    stockMode: normalized.stockMode,
    stockQuantity: normalized.stockQuantity + normalized.entryQuantity,
    createdAt: now.toISOString(),
    lastEntryAt: normalized.entryQuantity > 0 ? now.toISOString() : undefined,
    nextExpirationDate: normalized.entryQuantity > 0 ? buildExpirationDate(normalized.expiresInDays, now) : undefined,
  };

  saveIngredients([ingredient, ...loadIngredients()]);
  return ingredient;
}

export function updateIngredient(id: string, draft: IngredientDraft): Ingredient | null {
  const normalized = normalizeDraft(draft);
  if (!normalized.name) {
    throw new Error("Ingredient name is required");
  }

  const now = new Date();
  let updated: Ingredient | null = null;
  const next = loadIngredients().map((item) => {
    if (item.id !== id) return item;
    updated = {
      ...item,
      name: normalized.name,
      expiresInDays: normalized.expiresInDays,
      stockMode: normalized.stockMode,
      stockQuantity: normalized.stockQuantity + normalized.entryQuantity,
      updatedAt: now.toISOString(),
      lastEntryAt: normalized.entryQuantity > 0 ? now.toISOString() : item.lastEntryAt,
      nextExpirationDate: normalized.entryQuantity > 0 ? buildExpirationDate(normalized.expiresInDays, now) : item.nextExpirationDate,
    };
    return updated;
  });

  if (!updated) return null;
  saveIngredients(next);
  return updated;
}

export function removeIngredient(id: string): boolean {
  const list = loadIngredients();
  const next = list.filter((item) => item.id !== id);
  if (next.length === list.length) return false;
  saveIngredients(next);
  return true;
}
