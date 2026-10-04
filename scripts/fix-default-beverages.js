const fs = require("fs");

const dbPath = "mock-api/db.json";
const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function beverageAlias(value) {
  return normalize(value)
    .replace("cocacolacero", "cocacolazero")
    .replace("cocacolazero", "cocacolazero")
    .replace("cocacol", "cocacola")
    .replace("zer", "zero");
}

function isBeverageName(name) {
  return /coca|cola|7up|agua|placer|gaseosa|pomelo|naranja|manzana|pera|zero|cero|600ml|500ml/i.test(name || "");
}

function beverageFamily(value) {
  if (/coca|cola/i.test(value || "")) return "cocacola";
  return normalize(value).replace(/600ml|500ml$/g, "").replace(/zero|cero$/g, "");
}

function isZeroBeverage(value) {
  return /zero|cero/i.test(value || "");
}

function findBeverageForName(name) {
  const beverages = db.products.filter((product) => product.type === "bebida" && !removeProductIds.has(product.id));
  const key = beverageAlias(name);
  return (
    beverages.find((product) => beverageAlias(product.name) === key) ||
    beverages.find((product) => beverageFamily(product.name) === beverageFamily(name) && isZeroBeverage(product.name) === isZeroBeverage(name)) ||
    beverages.find((product) => beverageFamily(product.name) === beverageFamily(name))
  );
}

const emptyBeverageRecipes = db.products.filter((product) => {
  if (product.type !== "receta" || !isBeverageName(product.name)) return false;
  const recipe = db.recipes.find((item) => item.productId === product.id || item.id === product.recipeId);
  return !recipe || (recipe.ingredients || []).length === 0;
});

const removeProductIds = new Set();
const removeRecipeIds = new Set();

for (const recipeProduct of emptyBeverageRecipes) {
  const key = beverageAlias(recipeProduct.name);
  let beverage = db.products.find((product) => product.type === "bebida" && beverageAlias(product.name) === key);
  if (!beverage) {
    beverage = db.products.find((product) => product.type === "bebida" && beverageAlias(product.name).includes(key.replace(/600ml|500ml/g, "")));
  }
  if (!beverage) {
    beverage = {
      id: recipeProduct.id.replace(/^menu/, "bev"),
      name: recipeProduct.name,
      price: 0,
      costPrice: 0,
      createdAt: recipeProduct.createdAt,
      category: "bebida",
      categoryIds: ["bebida"],
      type: "bebida",
      stockType: "bebida",
      stockMode: "unit",
    };
    db.products.push(beverage);
  }

  beverage.price = recipeProduct.price;
  beverage.description = recipeProduct.description;
  beverage.category = "bebida";
  beverage.categoryIds = [...new Set([...(beverage.categoryIds || []), "bebida"])];

  for (const order of db.orders || []) {
    order.items = (order.items || []).map((item) => ({
      ...item,
      productId: String(item.productId || "").replace(/^menu:/, "") === recipeProduct.id ? beverage.id : String(item.productId || "").replace(/^menu:/, ""),
    }));
  }

  for (const combo of db.combos || []) {
    combo.items = (combo.items || []).map((item) => ({
      ...item,
      productId: item.productId === recipeProduct.id ? beverage.id : item.productId,
    }));
    combo.optionGroups = (combo.optionGroups || []).map((group) => ({
      ...group,
      productIds: [...new Set((group.productIds || []).map((id) => (id === recipeProduct.id ? beverage.id : id)))],
    }));
  }

  const recipe = db.recipes.find((item) => item.productId === recipeProduct.id || item.id === recipeProduct.recipeId);
  if (recipe) removeRecipeIds.add(recipe.id);
  removeProductIds.add(recipeProduct.id);
}

const beverageByAlias = new Map();
for (const beverage of db.products.filter((product) => product.type === "bebida")) {
  const key = beverageAlias(beverage.name);
  const current = beverageByAlias.get(key);
  if (!current || (!current.price && beverage.price) || (!current.description && beverage.description)) {
    beverageByAlias.set(key, beverage);
  }
}

for (const beverage of db.products.filter((product) => product.type === "bebida")) {
  const keeper = beverageByAlias.get(beverageAlias(beverage.name));
  if (!keeper || keeper.id === beverage.id) continue;
  if (!keeper.price && beverage.price) keeper.price = beverage.price;
  if (!keeper.description && beverage.description) keeper.description = beverage.description;
  for (const order of db.orders || []) {
    order.items = (order.items || []).map((item) => ({
      ...item,
      productId: item.productId === beverage.id ? keeper.id : item.productId,
    }));
  }
  for (const combo of db.combos || []) {
    combo.items = (combo.items || []).map((item) => ({
      ...item,
      productId: item.productId === beverage.id ? keeper.id : item.productId,
    }));
    combo.optionGroups = (combo.optionGroups || []).map((group) => ({
      ...group,
      productIds: [...new Set((group.productIds || []).map((id) => (id === beverage.id ? keeper.id : id)))],
    }));
  }
  removeProductIds.add(beverage.id);
}

for (const beverage of db.products.filter((product) => product.type === "bebida")) {
  if (beverage.price && beverage.description) continue;
  const sameFamily = db.products.find(
    (product) =>
      product.type === "bebida" &&
      product.id !== beverage.id &&
      product.price > 0 &&
      beverageFamily(product.name) === beverageFamily(beverage.name),
  );
  if (!beverage.price && sameFamily?.price) beverage.price = sameFamily.price;
  if (!beverage.description) beverage.description = beverage.name;
}

for (const order of db.orders || []) {
  order.items = (order.items || []).map((item) => {
    if (!isBeverageName(item.productName)) return item;
    const beverage = findBeverageForName(item.productName);
    if (!beverage) return item;
    return {
      ...item,
      productId: beverage.id,
      productName: beverage.name,
      unitPrice: item.unitPrice || beverage.price,
    };
  });
}

db.products = (db.products || []).filter((product) => !removeProductIds.has(product.id));
db.recipes = (db.recipes || []).filter((recipe) => !removeRecipeIds.has(recipe.id) && !removeProductIds.has(recipe.productId));
db.categories = (db.categories || []).map((category) => ({
  ...category,
  productIds: (category.productIds || []).filter((id) => !removeProductIds.has(id)),
}));
const bebidaCategory = db.categories.find((category) => category.id === "bebida");
if (bebidaCategory) {
  bebidaCategory.productIds = [...new Set([...bebidaCategory.productIds, ...db.products.filter((product) => product.type === "bebida").map((product) => product.id)])];
}

fs.writeFileSync(dbPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
console.log({
  removedEmptyBeverageRecipes: removeProductIds.size,
  beverageProducts: db.products.filter((product) => product.type === "bebida").length,
  remainingEmptyBeverageRecipes: db.products.filter((product) => {
    if (product.type !== "receta" || !isBeverageName(product.name)) return false;
    const recipe = db.recipes.find((item) => item.productId === product.id || item.id === product.recipeId);
    return !recipe || (recipe.ingredients || []).length === 0;
  }).length,
});
