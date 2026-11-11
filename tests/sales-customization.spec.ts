import { test, expect, type APIRequestContext } from "@playwright/test";
import { createHash } from "node:crypto";

async function prepare(request: APIRequestContext) {
  const previous = await (await request.get("/admin/data/stores")).json();
  const users = await (await request.get("/users")).json();
  const credentials = { requestedBy: "admin", adminPasswordHash: users.find((user: { username: string }) => user.username === "admin").password };
  const date = new Date().toISOString();
  const product = (id: string, name: string, type: string, category: string) => ({ id, name, type, category, categoryIds: [category], price: 1000, stockMode: "unit", createdAt: date });
  const db = {
    users, systemSettings: { allowOutOfStockSales: false },
    products: [product("burger", "Hamburguesa prueba", "receta", "hamburguesas"), product("combo", "Combo prueba", "combo", "combos"), product("cola", "Cola prueba", "bebida", "bebidas"), product("water", "Agua prueba", "bebida", "bebidas")],
    categories: ["hamburguesas", "combos", "bebidas"].map((id) => ({ id, name: id, productIds: [] })), menuProducts: [], menuCategories: [],
    ingredients: [
      { id: "bread", name: "Pan", stockMode: "unit", metric: "unit", stockQuantity: 10, expiresInDays: 5, createdAt: date },
      { id: "onion", name: "Cebolla", stockMode: "unit", metric: "unit", stockQuantity: 10, expiresInDays: 5, createdAt: date },
      { id: "meat", name: "Carne", stockMode: "weight", metric: "weight", stockQuantity: 1000, portionSizeGrams: 100, expiresInDays: 5, createdAt: date },
    ],
    recipes: [{ id: "recipe", productId: "burger", ingredients: [{ ingredientId: "bread", quantity: 1, required: true }, { ingredientId: "onion", quantity: 1, required: false }, { ingredientId: "meat", quantity: 100, required: true }] }],
    combos: [{ id: "combo-recipe", productId: "combo", items: [{ productId: "burger", quantity: 1 }], optionGroups: [{ id: "drink-choice", name: "Bebida", quantity: 1, productIds: ["cola", "water"] }] }],
    stocks: ["cola", "water"].map((productId) => ({ id: `stock-${productId}`, productId, quantity: 5, metric: "unit", movementType: "in", expirationDate: "2099-12-31", createdAt: date })),
    orders: [], invoices: [], workdays: [], supplyOrders: [],
  };
  const created = await request.post("/admin/data/stores/import", { data: { ...credentials, name: `custom-sale-${Date.now()}`, content: JSON.stringify(db) } });
  expect(created.status(), await created.text()).toBe(201);
  const opened = await request.post("/workdays/open", { data: { operator: "admin", openingAmount: 0 } });
  expect(opened.status(), await opened.text()).toBe(201);
  return { restore: () => request.put("/admin/data/stores/active", { data: { ...credentials, storeId: previous.activeStoreId } }) };
}

test("employee filters, customizes and adjusts combo before payment; receipt and stock match", async ({ page, request }, info) => {
  const fixture = await prepare(request);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.route("**/users", (route) => route.fulfill({ json: [{ id: "admin", username: "admin", role: "admin", password: createHash("md5").update("test").digest("hex") }] }));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/login");
    await page.getByLabel("Usuario", { exact: true }).fill("admin");
    await page.locator('input[type="password"]').fill("test");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/operation$/);
    await page.goto("/sales");
    const catalog = page.getByLabel("Catalogo de productos");
    const editor = page.getByRole("region", { name: "Pedido y personalizacion" });
    await expect(catalog.getByRole("region", { name: "hamburguesas", exact: true }).getByRole("button")).toHaveCount(1);
    await expect(catalog.getByRole("region", { name: "bebidas", exact: true }).getByRole("button")).toHaveCount(2);
    await page.getByRole("button", { name: "bebidas", exact: true }).click();
    await expect(catalog.getByRole("region")).toHaveCount(1);
    await expect(catalog.getByRole("button")).toHaveCount(2);
    await page.getByRole("button", { name: "Todas", exact: true }).click();
    const colaCard = catalog.getByRole("button", { name: /Cola prueba/ });
    await colaCard.click();
    await expect(editor.getByRole("article")).toHaveCount(0);

    await colaCard.click();
    await expect(catalog.getByRole("button", { name: /Cola prueba/ })).toHaveAttribute("aria-pressed", "true");
    await expect(editor.getByRole("button", { name: "Sumar Cola prueba", exact: true })).toBeVisible();
    await expect(editor.getByRole("article").filter({ hasText: "1x Cola prueba" })).toBeVisible();
    await expect(editor.getByRole("article")).toHaveCount(1);
    await colaCard.click();
    await expect(editor.getByRole("article").filter({ hasText: "2x Cola prueba" })).toBeVisible();
    await catalog.getByRole("button", { name: /Agua prueba/ }).click();
    await expect(editor.getByRole("article")).toHaveCount(1);
    await colaCard.click();
    await expect(editor.getByRole("article").filter({ hasText: "2x Cola prueba" })).toBeVisible();
    await colaCard.click();
    await expect(editor.getByRole("article").filter({ hasText: "3x Cola prueba" })).toBeVisible();
    await editor.getByRole("button", { name: "Quitar Cola prueba", exact: true }).click();
    await expect(editor.getByRole("article")).toHaveCount(0);
    await page.getByLabel("Producto", { exact: true }).fill("Combo prueba");
    await expect(catalog.getByRole("button")).toHaveCount(1);
    await catalog.getByRole("button", { name: /Combo prueba/ }).click();
    await catalog.getByRole("button", { name: /Combo prueba/ }).click();
    await expect(editor.getByRole("article")).toHaveCount(0);
    await page.getByRole("radio", { name: "Cola prueba", exact: true }).check();
    await expect(page.getByRole("checkbox", { name: "Pan", exact: true })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "Carne", exact: true })).toHaveCount(0);
    await page.getByRole("checkbox", { name: "Cebolla", exact: true }).uncheck();
    await page.getByRole("radio", { name: "Agua prueba", exact: true }).check();
    await expect(page.getByRole("checkbox", { name: "Cebolla", exact: true })).not.toBeChecked();
    await page.screenshot({ path: info.outputPath("sales-customization.png"), fullPage: true });
    await catalog.getByRole("button", { name: /Combo prueba/ }).click();
    await editor.getByRole("button", { name: "Sumar Combo prueba", exact: true }).click();
    await expect(editor.getByRole("article").filter({ hasText: "2x Combo prueba" })).toBeVisible();
    await editor.getByRole("button", { name: "Restar Combo prueba", exact: true }).click();
    await expect(editor.getByRole("article").filter({ hasText: "1x Combo prueba" })).toBeVisible();
    await expect(editor.getByText(/Sin Cebolla/)).toBeVisible();

    await expect(page.getByRole("radio", { name: "Agua prueba", exact: true })).toBeChecked();

    await expect(page.getByRole("button", { name: "Cobrar", exact: true })).toBeEnabled();
    await editor.getByRole("button", { name: "Sumar Combo prueba", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Agua prueba", exact: true })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Cebolla", exact: true })).not.toBeChecked();
    await expect(editor.getByRole("article").filter({ hasText: "2x Combo prueba" })).toBeVisible();
    await page.screenshot({ path: info.outputPath("sales-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: info.outputPath("sales-mobile.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.getByRole("button", { name: "Cobrar", exact: true }).click();
    await page.getByRole("button", { name: "Volver al pedido", exact: true }).click();
    await expect(editor.getByRole("button", { name: "Sumar Combo prueba", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Cobrar", exact: true }).click();
    await page.getByRole("button", { name: "Confirmar cobro", exact: true }).click();
    await expect(page).toHaveURL(/\/sales\/summary$/);
    await expect(page.getByText("Sin Cebolla", { exact: true })).toBeVisible();
    const ingredients = await (await request.get("/ingredients")).json();
    expect(ingredients.find((item: { id: string }) => item.id === "bread").stockQuantity).toBe(8);
    expect(ingredients.find((item: { id: string }) => item.id === "onion").stockQuantity).toBe(10);
    expect(ingredients.find((item: { id: string }) => item.id === "meat").stockQuantity).toBe(800);
    const products = await (await request.get("/products")).json();
    expect(products.find((item: { id: string }) => item.id === "water").existencia).toBe(3);
    expect(products.find((item: { id: string }) => item.id === "cola").existencia).toBe(5);
    const orders = await (await request.get("/orders")).json();
    expect(orders[0].items[0].excludedIngredients).toEqual([{ productId: "burger", ingredientId: "onion", ingredientName: "Cebolla" }]);
    const receipt = await request.post("/receipts", { data: { orderId: orders[0].id, items: orders[0].items, paymentMethod: "efectivo", total: orders[0].total } });
    expect(receipt.status(), await receipt.text()).toBe(201);
    expect((await receipt.json()).html).toContain("Sin Cebolla");
    expect(errors).toEqual([]);
  } finally { await fixture.restore(); }
});

test("removed ingredients do not consume stock, variants stay separate, and insufficient stock obeys configuration", async ({ request }) => {
  const fixture = await prepare(request);
  try {
    const base = { productId: "menu:burger", productName: "Hamburguesa prueba", unitPrice: 1000, quantity: 1 };
    const excludedIngredients = [{ productId: "burger", ingredientId: "onion", ingredientName: "Cebolla" }];
    const order = await (await request.post("/orders", { data: { operator: "admin", items: [{ ...base, excludedIngredients }, base] } })).json();
    const paid = await request.put(`/orders/${order.id}/status`, { data: { status: "pagada", paymentMethod: "efectivo" } });
    expect(paid.status(), await paid.text()).toBe(200);
    const ingredients = await (await request.get("/ingredients")).json();
    expect(ingredients.find((item: { id: string }) => item.id === "onion").stockQuantity).toBe(9);
    expect(ingredients.find((item: { id: string }) => item.id === "meat").stockQuantity).toBe(800);
    const blocked = await (await request.post("/orders", { data: { items: [{ ...base, quantity: 20 }] } })).json();
    expect((await request.put(`/orders/${blocked.id}/status`, { data: { status: "pagada" } })).status()).toBe(409);
    const unchanged = await (await request.get("/ingredients")).json();
    expect(unchanged).toEqual(ingredients);
    await request.put("/system-settings", { data: { allowOutOfStockSales: true } });
    expect((await request.put(`/orders/${blocked.id}/status`, { data: { status: "pagada" } })).status()).toBe(200);
    await request.put("/system-settings", { data: { allowOutOfStockSales: false } });
    const invalid = await (await request.post("/orders", { data: { items: [{ ...base, excludedIngredients: [{ productId: "burger", ingredientId: "missing", ingredientName: "Invalido" }] }] } })).json();
    expect((await request.put(`/orders/${invalid.id}/status`, { data: { status: "pagada" } })).status()).toBe(400);
    const required = await (await request.post("/orders", { data: { items: [{ ...base, excludedIngredients: [{ productId: "burger", ingredientId: "bread", ingredientName: "Pan" }] }] } })).json();
    const reject = await request.put(`/orders/${required.id}/status`, { data: { status: "pagada" } });
    expect(reject.status()).toBe(400);
    expect((await reject.json()).message).toContain("obligatorio");
  } finally { await fixture.restore(); }
});

test("recipe requirements persist in the editor; single ingredients are mandatory and combo components are ordered", async ({ page, request }, info) => {
  const fixture = await prepare(request);
  try {
    const products = await (await request.get("/products")).json();
    const water = products.find((item: { id: string }) => item.id === "water");
    expect((await request.put("/products/water", { data: { ...water, type: "receta", stockType: "receta" } })).status()).toBe(200);
    const ingredient = await (await request.post("/ingredients", { data: { name: "Agua en botella", stockMode: "unit", stockQuantity: 5, expiresInDays: 10 } })).json();
    const single = await request.post("/recipes", { data: { productId: "water", ingredients: [{ ingredientId: ingredient.id, quantity: 1, required: false }] } });
    expect(single.status(), await single.text()).toBe(201);
    expect((await single.json()).ingredients[0].required).toBe(true);
    const combo = (await (await request.get("/combos")).json())[0];
    await request.put(`/combos/${combo.id}`, { data: { ...combo, items: [{ productId: "water", quantity: 1 }, { productId: "burger", quantity: 1 }] } });
    const attempt = await (await request.post("/orders", { data: { items: [{ productId: "menu:water", productName: "Agua prueba", unitPrice: 1000, quantity: 1, excludedIngredients: [{ productId: "water", ingredientId: ingredient.id, ingredientName: ingredient.name }] }] } })).json();
    const rejected = await request.put(`/orders/${attempt.id}/status`, { data: { status: "pagada" } });
    expect(rejected.status()).toBe(400);
    expect((await rejected.json()).message).toContain("obligatorio");
    await page.route("**/users", (route) => route.fulfill({ json: [{ id: "admin", username: "admin", role: "admin", password: createHash("md5").update("test").digest("hex") }] }));
    await page.goto("/login");
    await page.getByLabel("Usuario", { exact: true }).fill("admin");
    await page.locator('input[type="password"]').fill("test");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/operation$/);
    await page.goto("/menu-products");
    await page.getByRole("button", { name: /Hamburguesa prueba/ }).click();
    const onion = page.getByRole("group", { name: "Tipo de ingrediente: Cebolla", exact: true });
    await expect(onion.getByRole("button", { name: "Opcional", exact: true })).toHaveAttribute("aria-pressed", "true");
    await onion.getByRole("button", { name: "Obligatorio", exact: true }).click();
    await page.getByRole("button", { name: "Guardar receta", exact: true }).click();
    await expect(page.getByText("Producto de menu actualizado.", { exact: true })).toBeVisible();
    await expect(onion.getByRole("button", { name: "Obligatorio", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await page.getByRole("button", { name: /Hamburguesa prueba/ }).click();
    await expect(onion.getByRole("button", { name: "Obligatorio", exact: true })).toHaveAttribute("aria-pressed", "true");
    await onion.getByRole("button", { name: "Opcional", exact: true }).click();
    await page.getByRole("button", { name: "Carne 100", exact: true }).click();
    await expect(page.getByRole("status", { name: "Cantidad de Carne en receta", exact: true })).toHaveText("200 g");
    await page.getByRole("button", { name: "Guardar receta", exact: true }).click();
    await expect(page.getByText("Producto de menu actualizado.", { exact: true })).toBeVisible();
    await expect(onion.getByRole("button", { name: "Opcional", exact: true })).toHaveAttribute("aria-pressed", "true");
    const recipes = await (await request.get("/recipes")).json();
    expect(recipes.find((item: { productId: string }) => item.productId === "burger").ingredients.find((item: { ingredientId: string }) => item.ingredientId === "onion").required).toBe(false);
    expect(recipes.find((item: { productId: string }) => item.productId === "burger").ingredients.find((item: { ingredientId: string }) => item.ingredientId === "meat").quantity).toBe(200);
    const unchangedPrice = await (await request.get("/products")).json();
    expect(unchangedPrice.find((item: { id: string }) => item.id === "burger").price).toBe(1000);
    await page.getByRole("button", { name: /Agua prueba/ }).click();
    await expect(page.getByRole("group", { name: "Tipo de ingrediente: Agua en botella", exact: true }).getByRole("button", { name: "Opcional", exact: true })).toBeDisabled();
    await page.goto("/sales");
    const catalog = page.getByLabel("Catalogo de productos");
    await catalog.getByRole("button", { name: /Combo prueba/ }).click();
    const editor = page.getByRole("region", { name: "Pedido y personalizacion" });
    const groups = editor.getByRole("group");
    await expect(groups.nth(0)).toHaveAccessibleName("Hamburguesa prueba");
    await expect(groups.nth(1)).toHaveAccessibleName("Agua prueba");
    await expect(groups.nth(2)).toHaveAccessibleName("Bebida");
    await expect(groups.nth(1).getByRole("checkbox")).toHaveCount(0);
    await expect(groups.nth(0).getByRole("checkbox")).toHaveCount(1);
    await page.screenshot({ path: info.outputPath("mandatory-ingredients.png"), fullPage: true });
    await catalog.getByRole("button", { name: /Agua prueba/ }).click();
    await expect(editor.getByRole("checkbox")).toHaveCount(0);
    await expect(editor.getByText("Agua en botella", { exact: true })).toBeVisible();
    await expect(editor.getByText("Obligatorio", { exact: true })).toHaveCount(0);
    await page.goto("/menu-products");
    await page.getByRole("tab", { name: "Combos", exact: true }).click();
    const comboCard = page.getByRole("button", { name: /Combo prueba/ });
    await expect(comboCard).toContainText("1x Hamburguesa prueba");
    await comboCard.click();
    const comboEditor = page.locator("section").filter({ has: page.getByRole("heading", { name: "Editar combo", exact: true }) }).first();
    await expect(comboEditor.getByText("1x Hamburguesa prueba", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Categorias", exact: true }).click();
    await page.getByLabel("Nombre", { exact: true }).fill("Prioritaria prueba");
    await page.getByLabel("Orden de categoria", { exact: true }).fill("5");
    await page.getByRole("button", { name: "Crear categoria", exact: true }).click();
    await expect(page.getByText("Categoria creada.", { exact: true })).toBeVisible();
    let categories = await (await request.get("/categories")).json();
    expect(categories[0]).toMatchObject({ name: "Prioritaria prueba", order: 5 });
    await page.getByRole("button", { name: "hamburguesas 1", exact: true }).click();
    await page.getByLabel("Orden de categoria", { exact: true }).fill("0");
    await page.getByRole("button", { name: "Guardar categoria", exact: true }).click();
    await expect(page.getByText("Categoria actualizada.", { exact: true })).toBeVisible();
    await page.reload();
    categories = await (await request.get("/categories")).json();
    expect(categories[0]).toMatchObject({ id: "hamburguesas", order: 0 });
    await page.goto("/sales");
    await expect(page.getByLabel("Catalogo de productos").getByRole("region").first()).toHaveAccessibleName("hamburguesas");
  } finally { await fixture.restore(); }
});

 test("compact order rows adjust quantity and enforce stock", async ({ page, request }) => {
  const fixture = await prepare(request);
  try {
    await page.route("**/users", (route) => route.fulfill({ json: [{ id: "admin", username: "admin", role: "admin", password: createHash("md5").update("test").digest("hex") }] }));
    await page.goto("/login");
    await page.getByLabel("Usuario", { exact: true }).fill("admin");
    await page.locator('input[type="password"]').fill("test");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/operation$/);
    await page.goto("/sales");
    const editor = page.getByRole("region", { name: "Pedido y personalizacion" });
    const card = page.getByLabel("Catalogo de productos").getByRole("button", { name: /Cola prueba/ });
    await card.click(); await card.click();
    const row = editor.getByRole("article");
    await expect(row).toContainText("1x Cola prueba");
    await expect(editor.getByLabel("Cantidad", { exact: true })).toHaveCount(0);
    for (let i = 0; i < 4; i++) await row.getByRole("button", { name: "Sumar Cola prueba", exact: true }).click();
    await expect(row).toContainText("5x Cola prueba");
    await row.getByRole("button", { name: "Sumar Cola prueba", exact: true }).click();
    await expect(row).toContainText("5x Cola prueba");
    await expect(page.getByText("No hay stock suficiente para esta cantidad.", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "Restar Cola prueba", exact: true }).click();
    await expect(row).toContainText("4x Cola prueba");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    const buttons = await row.getByRole("button").all();
    const boxes = await Promise.all(buttons.map((button) => button.boundingBox()));
    expect(new Set(boxes.map((box) => box?.y)).size).toBe(1);
    await row.getByRole("button", { name: "Quitar Cola prueba", exact: true }).click();
    await expect(row).toHaveCount(0);
    await card.click();
    await row.getByRole("button", { name: "Restar Cola prueba", exact: true }).click();
    await expect(row).toHaveCount(0);
  } finally { await fixture.restore(); }
});
