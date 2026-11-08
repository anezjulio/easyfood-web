import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";

test("block backups isolate catalog, compose sources, preserve targets and reject incompatible references", async ({ request }) => {
  const state = await (await request.get("/admin/data/stores")).json();
  const users = await (await request.get("/users")).json();
  const credentials = { requestedBy: "admin", adminPasswordHash: users.find((user: { username: string }) => user.username === "admin").password };
  const prefix = `blocks-${Date.now()}`;
  const fixture = {
    users, products: [{ id: "meal", name: "Hamburguesa", type: "receta", recipeId: "recipe", price: 100, category: "food", createdAt: new Date().toISOString() }],
    ingredients: [{ id: "bread", name: "Pan", stockMode: "unit", stockQuantity: 25, expiresInDays: 7, minStockQuantity: 5, createdAt: new Date().toISOString() }],
    recipes: [{ id: "recipe", productId: "meal", ingredients: [{ ingredientId: "bread", quantity: 1 }] }],
    combos: [], menuProducts: [], categories: [{ id: "food", name: "Comida", productIds: ["meal"] }], ingredientCategories: [], menuCategories: [],
    stocks: [{ id: "entry", productId: "bread", quantity: 25, metric: "unit", movementType: "in", createdAt: new Date().toISOString() }],
    orders: [{ id: "order", items: [{ productId: "meal", productName: "Hamburguesa", quantity: 1, unitPrice: 100 }], status: "pagada", total: 100 }],
    invoices: [{ id: "invoice", orderId: "order", total: 100 }], supplyOrders: [],
  };
  const call = (data: object) => request.post("/admin/data/blocks", { data: { ...credentials, ...data } });
  try {
    const imported = await request.post("/admin/data/stores/import", { data: { ...credentials, name: prefix, content: JSON.stringify(fixture) } });
    expect(imported.status(), await imported.text()).toBe(201);
    const sourceId = (await imported.json()).store.id;
    const exported = await call({ action: "export", storeId: sourceId, blocks: ["catalog"] });
    expect(exported.status()).toBe(200);
    const catalog = await exported.json();
    expect(catalog.blocks.catalog.ingredients[0]).not.toHaveProperty("stockQuantity");
    expect(catalog.blocks.catalog).not.toHaveProperty("orders");
    expect(catalog.blocks.catalog).not.toHaveProperty("stocks");
    const stock = await (await call({ action: "export", storeId: sourceId, blocks: ["stock"] })).json();
    expect(stock.blocks.stock.ingredientBalances[0].stockQuantity).toBe(25);
    const sources = [{ block: "catalog", content: JSON.stringify(catalog) }];
    const draft = { name: `${prefix}-catalog`, sources };
    const preview = await call({ ...draft, action: "preview" });
    expect(preview.status(), await preview.text()).toBe(200);
    expect((await preview.json()).summary).toMatchObject({ products: 1, ingredients: 1, stocks: 0, orders: 0 });
    expect((await call({ ...draft, action: "apply" })).status()).toBe(200);
    expect((await (await request.get("/admin/data/stores")).json()).activeStoreId).toBe(sourceId);
    const stores = await (await request.get("/admin/data/stores")).json();
    const targetId = stores.stores.find((store: { name: string }) => store.name === draft.name).id;
    const zero = await (await call({ action: "export", storeId: targetId, blocks: ["stock"] })).json();
    expect(zero.blocks.stock.ingredientBalances[0].stockQuantity).toBe(0);
    catalog.blocks.catalog.media = { "test.png": Buffer.from("image").toString("base64") };
    const operations = { format: "easyfood-blocks", version: 1, blocks: { operations: { orders: fixture.orders, invoices: fixture.invoices, receipts: { "receipt.html": Buffer.from("<p>Recibo</p>").toString("base64") } } } };
    const combined = await call({ action: "apply", name: `${prefix}-combined`, sources: [
      { block: "catalog", content: JSON.stringify(catalog) }, { block: "stock", content: JSON.stringify(stock) }, { block: "operations", content: JSON.stringify(operations) },
    ] });
    expect(combined.status(), await combined.text()).toBe(200);
    const combinedId = (await combined.json()).store.id;
    const roundtrip = await (await call({ action: "export", storeId: combinedId, blocks: ["catalog", "stock", "operations"] })).json();
    expect(roundtrip.blocks.operations.receipts["receipt.html"]).toBe(operations.blocks.operations.receipts["receipt.html"]);
    expect(roundtrip.blocks.catalog.media["test.png"]).toBe(catalog.blocks.catalog.media["test.png"]);
    expect(roundtrip.blocks.stock.ingredientBalances[0].stockQuantity).toBe(25);
    const copyStock = await call({ action: "apply", targetStoreId: targetId, sources: [{ block: "stock", storeId: sourceId }] });
    expect(copyStock.status(), await copyStock.text()).toBe(200);
    expect((await copyStock.json()).recoveryPath).toContain("before-blocks-");
    const badStock = structuredClone(stock); badStock.blocks.stock.ingredientBalances[0].id = "missing";
    const invalid = await call({ action: "apply", targetStoreId: targetId, sources: [{ block: "stock", content: JSON.stringify(badStock) }] });
    expect(invalid.status()).toBe(400);
    const preserved = await (await call({ action: "export", storeId: targetId, blocks: ["catalog", "stock", "operations"] })).json();
    expect(preserved.blocks.stock.ingredientBalances[0].stockQuantity).toBe(25);
    expect(preserved.blocks.catalog.products).toHaveLength(1);
    expect(preserved.blocks.operations.orders).toHaveLength(0);
    expect((await call({ action: "apply", name: "bad", sources: [{ block: "catalog", content: "{}" }] })).status()).toBe(400);
    expect((await request.post("/admin/data/blocks", { data: { ...credentials, adminPasswordHash: "0".repeat(32), action: "export", storeId: sourceId, blocks: ["catalog"] } })).status()).toBe(401);
    const legacy = await call({ action: "preview", name: `${prefix}-legacy`, sources: [{ block: "catalog", content: `export default ${JSON.stringify(fixture)};` }] });
    expect(legacy.status(), await legacy.text()).toBe(200);
  } finally {
    await request.put("/admin/data/stores/active", { data: { ...credentials, storeId: state.activeStoreId } });
  }
});

test("Data keeps DDBB as its default tab and exposes block management", async ({ page }) => {
  await page.route("**/users", (route) => route.fulfill({ json: [{ id: "admin", username: "admin", role: "admin", password: createHash("md5").update("test").digest("hex") }] }));
  await page.goto("/login");
  await page.getByLabel("Usuario", { exact: true }).fill("admin");
  await page.locator('input[type="password"]').fill("test");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/operation$/);
  await page.goto("/data");
  await expect(page.getByRole("tab", { name: "DDBB", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Crear nueva base", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Bloques de datos" }).click();
  await expect(page.getByRole("heading", { name: "Combinar o copiar bloques" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Descargar productos", exact: true })).toBeVisible();
});
