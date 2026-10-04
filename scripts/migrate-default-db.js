const fs = require("fs");
const path = require("path");

const root = process.cwd();
const storesPath = path.join(root, "mock-api", "data-stores.json");
const dbPath = path.join(root, "mock-api", "db.json");
const state = JSON.parse(fs.readFileSync(storesPath, "utf8"));
const activeStore =
  state.stores.find((store) => store.id === "practifood-backup-20260909221249") ||
  state.stores.find((store) => store.id === state.activeStoreId);
if (!activeStore) throw new Error(`Active store not found: ${state.activeStoreId}`);

const source = JSON.parse(fs.readFileSync(activeStore.dbPath, "utf8"));
const now = new Date().toISOString();

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isBeverage(name) {
  const text = normalizeText(name);
  return /\b(coca|cola|pepsi|sprite|fanta|7 up|seven|agua|jugo|gaseosa|pomelo|naranja|limonada|cerveza|lata|ml|litro|zero|placer)\b/.test(text);
}

function isWeightIngredient(name) {
  const text = normalizeText(name);
  if (isBeverage(name)) return false;
  if (/\b(pan|salchicha|hamburguesa|medallon|huevo|tequeno|nugget|milanesa)\b/.test(text)) return false;
  return /\b(tomate|lechuga|cebolla|repollo|zanahoria|queso|panceta|jamon|salsa|papa|papas|tocino|bacon|cheddar|mayonesa|ketchup|mostaza|barbacoa|ajo|morron|palta|berenjena|berengena|pepinillo)\b/.test(text);
}

function categoryForProduct(product) {
  if (product.type === "bebida") return "bebida";
  if (product.type === "ingrediente") return "ingrediente";
  return product.category || product.categoryIds?.[0] || "varios";
}

const productsById = new Map((source.products || []).map((product) => [product.id, product]));
const nextProducts = [];
const stockEntries = [...(source.stocks || [])];
const nextIngredients = [];
const removedBeverageIngredientIds = new Set();

for (const product of source.products || []) {
  nextProducts.push({
    ...product,
    description: product.description || undefined,
    type: product.type || (product.stockType === "combo" ? "combo" : product.stockType === "receta" ? "receta" : "bebida"),
    stockType: product.stockType || product.type || "bebida",
    stockMode: product.stockMode || "unit",
    categoryIds: product.categoryIds?.length ? product.categoryIds : product.category ? [product.category] : [],
  });
}

for (const ingredient of source.ingredients || []) {
  const beverage = isBeverage(ingredient.name);
  const stockMode = isWeightIngredient(ingredient.name) ? "weight" : "unit";
  const productId = ingredient.productId || ingredient.id;
  const stockQuantity = Math.max(0, Number(ingredient.stockQuantity) || 0);

  if (!productsById.has(productId)) {
    nextProducts.push({
      id: productId,
      name: ingredient.name,
      price: 0,
      costPrice: 0,
      createdAt: ingredient.createdAt || now,
      updatedAt: ingredient.updatedAt,
      category: beverage ? "bebida" : "ingrediente",
      categoryIds: [beverage ? "bebida" : "ingrediente"],
      type: beverage ? "bebida" : "ingrediente",
      stockType: beverage ? "bebida" : "ingrediente",
      stockMode: stockMode,
    });
  }

  if (stockQuantity > 0 && !stockEntries.some((entry) => entry.id === `seed-${productId}`)) {
    stockEntries.push({
      id: `seed-${productId}`,
      productId,
      movementDate: ingredient.lastEntryAt || ingredient.createdAt || now,
      expirationDate: ingredient.nextExpirationDate,
      quantity: stockQuantity,
      metric: stockMode === "weight" ? "grams" : "unit",
      movementType: "in",
      description: "Stock migrado desde ingredientes",
      costPrice: 0,
      createdAt: ingredient.lastEntryAt || ingredient.createdAt || now,
    });
  }

  if (beverage) {
    removedBeverageIngredientIds.add(ingredient.id);
    continue;
  }

  nextIngredients.push({
    ...ingredient,
    productId,
    metric: stockMode === "weight" ? "weight" : "unit",
    stockMode,
    stockQuantity,
    portionSizeGrams: stockMode === "weight" ? Math.max(1, Number(ingredient.portionSizeGrams) || 1) : undefined,
  });
}

const recipes = (source.recipes || []).map((recipe) => ({
  ...recipe,
  ingredients: (recipe.ingredients || []).filter((item) => !removedBeverageIngredientIds.has(item.ingredientId)),
}));

const categoriesById = new Map();
for (const category of source.categories || []) {
  categoriesById.set(category.id, { ...category, productIds: [...new Set(category.productIds || [])] });
}
for (const product of nextProducts) {
  const categoryId = categoryForProduct(product);
  if (!categoriesById.has(categoryId)) {
    categoriesById.set(categoryId, { id: categoryId, name: categoryId.charAt(0).toUpperCase() + categoryId.slice(1), productIds: [], createdAt: now });
  }
  const category = categoriesById.get(categoryId);
  if (!category.productIds.includes(product.id)) category.productIds.push(product.id);
  product.category = categoryId;
  product.categoryIds = [...new Set([...(product.categoryIds || []), categoryId])];
}

function normalizeOrderItem(item) {
  return {
    ...item,
    productId: String(item.productId || "").replace(/^menu:/, ""),
    comboItems: (item.comboItems || []).map((comboItem) => ({
      ...comboItem,
      productId: comboItem.productId || comboItem.menuProductId,
      menuProductId: comboItem.menuProductId,
    })),
    comboSelections: (item.comboSelections || []).map((selection) => ({
      ...selection,
      productId: selection.productId || selection.menuProductId,
      menuProductId: selection.menuProductId,
    })),
    comboUnits: (item.comboUnits || []).map((unit) => ({
      ...unit,
      comboItems: (unit.comboItems || []).map((comboItem) => ({
        ...comboItem,
        productId: comboItem.productId || comboItem.menuProductId,
        menuProductId: comboItem.menuProductId,
      })),
      comboSelections: (unit.comboSelections || []).map((selection) => ({
        ...selection,
        productId: selection.productId || selection.menuProductId,
        menuProductId: selection.menuProductId,
      })),
    })),
  };
}

const nextDb = {
  ...source,
  products: nextProducts,
  ingredients: nextIngredients,
  recipes,
  combos: source.combos || [],
  categories: [...categoriesById.values()],
  menuProducts: [],
  stocks: stockEntries,
  orders: (source.orders || []).map((order) => ({ ...order, items: (order.items || []).map(normalizeOrderItem) })),
};

fs.writeFileSync(dbPath, `${JSON.stringify(nextDb, null, 2)}\n`, "utf8");
state.activeStoreId = "default";
const defaultStore = state.stores.find((store) => store.id === "default");
if (defaultStore) {
  defaultStore.name = "default";
  defaultStore.dbPath = dbPath;
}
fs.writeFileSync(storesPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
console.log({
  activeStoreId: state.activeStoreId,
  products: nextDb.products.length,
  ingredients: nextDb.ingredients.length,
  removedBeveragesFromIngredients: removedBeverageIngredientIds.size,
  recipes: nextDb.recipes.length,
  combos: nextDb.combos.length,
  categories: nextDb.categories.length,
  stocks: nextDb.stocks.length,
  orders: nextDb.orders.length,
});
