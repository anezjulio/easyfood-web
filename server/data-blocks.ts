export const BLOCK_KEYS = {
  catalog: ["products", "ingredients", "ingredientCategories", "recipes", "combos", "categories", "menuCategories", "menuProducts", "productPrices", "priceMarginSettings"],
  operations: ["orders", "invoices", "workdays", "cashOpeningAssignments", "supplyOrders", "expenses", "feedbackEntries", "financialAccounts", "financialTransactions", "deleteRequests", "requests", "licenses", "paymentMethodSettings", "taxSettings"],
  stock: ["stocks", "stockThresholdSettings"],
} as const;
export type DataBlock = keyof typeof BLOCK_KEYS;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Legacy collections have different JSON schemas.
type Row = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Settings and collections share the imported JSON root.
export type Database = Record<string, any>;
const BALANCE_KEYS = ["stockQuantity", "minStockQuantity", "lastEntryAt", "nextExpirationDate"];

export function extractBlock(db: Database, block: DataBlock): Database {
  const data: Database = {};
  for (const key of BLOCK_KEYS[block]) if (db[key] !== undefined) data[key] = structuredClone(db[key]);
  if (block === "catalog") {
    data.ingredients = (data.ingredients || []).map((row: Row) => {
      for (const key of BALANCE_KEYS) delete row[key];
      return row;
    });
    data.products = (data.products || []).map((row: Row) => {
      for (const key of ["existencia", "ultimoIngreso", "supplyOrderId"]) delete row[key];
      return row;
    });
  }
  if (block === "stock") data.ingredientBalances = (db.ingredients || []).map((row: Row) =>
    Object.fromEntries(["id", ...BALANCE_KEYS].filter((key) => row[key] !== undefined).map((key) => [key, row[key]])));
  data.notifications = (db.notifications || []).filter((row: Row) => notificationBlock(row) === block);
  return data;
}

function notificationBlock(row: Row): DataBlock {
  if (["stock", "ingredient"].includes(row.entityType) || ["product-low-stock", "product-expiring", "stock-created"].includes(row.type)) return "stock";
  if (row.entityType === "product") return "catalog";
  return "operations";
}

export function readBlockBackup(parsed: Database, block: DataBlock): Database {
  if (parsed.format === "easyfood-blocks") {
    if (parsed.version !== 1 || !parsed.blocks?.[block]) throw new Error(`El respaldo no contiene el bloque ${block}.`);
    return structuredClone(parsed.blocks[block]);
  }
  if (!Array.isArray(parsed.products) && !Array.isArray(parsed.ingredients) && !Array.isArray(parsed.orders) && !Array.isArray(parsed.stocks)) {
    throw new Error("El archivo no es un respaldo de Easyfood.");
  }
  return extractBlock({ ...parsed, stocks: parsed.stocks || parsed.stockEntries || [] }, block);
}

export function composeBlocks(base: Database, blocks: Partial<Record<DataBlock, Database>>): Database {
  const result = structuredClone(base);
  const balances = blocks.stock?.ingredientBalances || (base.ingredients || []).map((row: Row) =>
    Object.fromEntries(["id", ...BALANCE_KEYS].map((key) => [key, row[key]])));
  for (const block of Object.keys(blocks) as DataBlock[]) {
    const data = blocks[block]!;
    for (const key of BLOCK_KEYS[block]) {
      if (data[key] !== undefined) result[key] = structuredClone(data[key]);
      else if (Array.isArray(result[key])) result[key] = [];
    }
    result.notifications = [...(result.notifications || []).filter((row: Row) => notificationBlock(row) !== block), ...(data.notifications || [])];
  }
  result.ingredients = (result.ingredients || []).map((row: Row) => {
    const ingredient = { ...row };
    for (const key of BALANCE_KEYS) delete ingredient[key];
    const balance = balances.find((item: Row) => item.id === row.id);
    return { ...ingredient, ...(balance || {}), stockQuantity: Number(balance?.stockQuantity || 0) };
  });
  validateReferences(result, blocks.stock?.ingredientBalances || balances.filter((row: Row) => Number(row.stockQuantity) !== 0));
  return result;
}

function validateReferences(db: Database, balances: Row[]) {
  const rows = (key: string): Row[] => {
    if (!Array.isArray(db[key])) throw new Error(`Coleccion invalida: ${key}.`);
    const seen = new Set<string>();
    for (const row of db[key]) {
      if (!row || typeof row.id !== "string" || !row.id || seen.has(row.id)) throw new Error(`Identificador invalido o repetido en ${key}.`);
      seen.add(row.id);
    }
    return db[key];
  };
  const products = new Set(rows("products").map((row) => row.id));
  const ingredients = new Set(rows("ingredients").map((row) => row.id));
  const menu = new Set(rows("menuProducts").map((row) => row.id));
  const orders = new Set(rows("orders").map((row) => row.id));
  const check = (exists: boolean, label: string) => { if (!exists) throw new Error(`Referencia incompatible: ${label}. Selecciona un catalogo o respaldo compatible.`); };
  const productExists = (id: string) => products.has(id.replace(/^menu:/, "")) || menu.has(id.replace(/^menu:/, ""));
  for (const recipe of rows("recipes")) {
    check(products.has(recipe.productId), `producto de receta ${recipe.id}`);
    for (const item of recipe.ingredients || []) check(ingredients.has(item.ingredientId), `ingrediente ${item.ingredientId}`);
  }
  for (const combo of rows("combos")) {
    check(products.has(combo.productId), `producto de combo ${combo.id}`);
    for (const item of combo.items || []) check(productExists(item.productId), `componente ${item.productId}`);
    for (const group of combo.optionGroups || []) for (const id of group.productIds || []) check(productExists(id), `opcion ${id}`);
  }
  for (const product of db.menuProducts) for (const item of product.recipeItems || []) check(ingredients.has(item.ingredientId), `ingrediente ${item.ingredientId}`);
  for (const entry of rows("stocks")) check(productExists(entry.productId) || ingredients.has(entry.productId), `stock ${entry.productId}`);
  for (const balance of balances) check(ingredients.has(balance.id), `saldo ${balance.id}`);
  for (const ingredient of db.ingredients) {
    check(Number.isFinite(ingredient.stockQuantity) && ingredient.stockQuantity >= 0, `saldo invalido ${ingredient.id}`);
  }
  for (const order of db.orders) for (const item of order.items || []) check(productExists(item.productId), `venta ${order.id}: ${item.productId}`);
  for (const invoice of rows("invoices")) check(orders.has(invoice.orderId), `orden de factura ${invoice.id}`);
  for (const supply of rows("supplyOrders")) for (const item of supply.items || []) check(products.has(item.productId), `compra ${supply.id}`);
}
