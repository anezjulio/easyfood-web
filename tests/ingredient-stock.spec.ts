import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";

test("ingredient receipts validate the whole list and add stock in base units", async ({ request }) => {
  const create = await request.post("/ingredients", { data: {
    name: "Stock batch test", stockMode: "weight", expiresInDays: 5, stockQuantity: 200,
  } });
  expect(create.ok()).toBeTruthy();
  const ingredient = await create.json();
  const entry = { ingredientId: ingredient.id, quantity: 1.5, metric: "kilos", expirationDate: "2099-12-31", purchaseTotal: 1500.75 };
  const stocksBefore = await (await request.get("/stocks")).json();
  const expensesBefore = (await (await request.get("/financial-accounts")).json()).find((item: { id: string }) => item.id === "account-expenses").currentBalance;
  try {
    const invalid = await request.post("/ingredient-stock-entries", { data: { entries: [entry, { ...entry, ingredientId: "missing" }] } });
    expect(invalid.status()).toBe(400);
    const afterInvalid = await (await request.get("/ingredients")).json();
    expect(afterInvalid.find((item: { id: string }) => item.id === ingredient.id).stockQuantity).toBe(200);
    expect(await (await request.get("/stocks")).json()).toHaveLength(stocksBefore.length);
    const invalidCost = await request.post("/ingredient-stock-entries", { data: { entries: [{ ...entry, purchaseTotal: -1 }] } });
    expect(invalidCost.status()).toBe(400);
    expect(await (await request.get("/stocks")).json()).toHaveLength(stocksBefore.length);
    const saved = await request.post("/ingredient-stock-entries", { data: { entries: [entry] } });
    expect(saved.status()).toBe(201);
    expect((await saved.json()).find((item: { id: string }) => item.id === ingredient.id)).toMatchObject({ stockQuantity: 1700, nextExpirationDate: "2099-12-31" });
    const recorded = (await (await request.get("/stocks")).json()).find((item: { productId: string }) => item.productId === ingredient.id);
    expect(recorded.purchaseTotal).toBe(1500.75);
    const purchase = (await (await request.get("/financial-transactions")).json()).filter((item: { referenceId: string }) => item.referenceId === recorded.id);
    expect(purchase).toHaveLength(1);
    expect(purchase[0]).toMatchObject({ type: "stock-purchase", amount: 1500.75, direction: "out", accountId: "account-expenses" });
    const accounts = await (await request.get("/financial-accounts")).json();
    expect(accounts.find((item: { id: string }) => item.id === "account-expenses").currentBalance).toBeCloseTo(expensesBefore - 1500.75, 2);
    const again = await request.post("/ingredient-stock-entries", { data: { entries: [{ ...entry, quantity: 50, metric: "grams", purchaseTotal: 0 }] } });
    expect((await again.json()).find((item: { id: string }) => item.id === ingredient.id).stockQuantity).toBe(1750);
    expect(await (await request.get("/stocks")).json()).toHaveLength(stocksBefore.length + 2);
  } finally {
    await request.delete(`/ingredients/${ingredient.id}`);
  }
});

test("stock form records purchase cost, converts kilos and consumes recipe grams exactly once", async ({ page, request }) => {
  const settings = await (await request.get("/system-settings")).json();
  const ingredient = await (await request.post("/ingredients", { data: { name: "Pollo peso prueba", stockMode: "weight", stockQuantity: 0, expiresInDays: 5, portionSizeGrams: 100 } })).json();
  const product = await (await request.post("/products", { data: { name: "Servicio pollo prueba", type: "receta", price: 1000 } })).json();
  const recipe = await (await request.post("/recipes", { data: { productId: product.id, ingredients: [{ ingredientId: ingredient.id, quantity: 250 }] } })).json();
  try {
    await request.put("/system-settings", { data: { allowOutOfStockSales: false } });
    await page.route("**/users", (route) => route.fulfill({ json: [{ id: "admin", username: "admin", role: "admin", password: createHash("md5").update("test").digest("hex") }] }));
    await page.goto("/login");
    await page.getByLabel("Usuario", { exact: true }).fill("admin");
    await page.locator('input[type="password"]').fill("test");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/operation$/);
    await page.goto("/stock/ingredients");
    await page.getByLabel("Buscar ingrediente", { exact: true }).fill(ingredient.name);
    await expect(page.getByRole("columnheader").nth(1)).toHaveText("Costo de compra (total ARS)");
    await expect(page.getByRole("columnheader").nth(2)).toHaveText("Vencimiento (fecha/dias)");
    await expect(page.getByRole("columnheader").nth(3)).toHaveText("Cantidad recibida");
    await expect(page.getByRole("columnheader").nth(5)).toHaveText("Porciones");
    await expect(page.getByLabel(`Unidad de ${ingredient.name}`, { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Por unidad", exact: true }).click();
    await expect(page.getByLabel(`Cantidad de ${ingredient.name}`, { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Por peso", exact: true }).click();
    await expect(page.getByLabel(`Cantidad de ${ingredient.name}`, { exact: true })).toBeVisible();
    await page.getByLabel(`Costo de compra de ${ingredient.name}`, { exact: true }).fill("12000.50");
    await page.getByLabel(`Vencimiento de ${ingredient.name}`, { exact: true }).fill("2099-12-31");
    await page.getByLabel(`Cantidad de ${ingredient.name}`, { exact: true }).fill("2");
    await page.getByRole("button", { name: "Guardar ingresos (1)", exact: true }).click();
    await expect(page.getByText("Stock ingresado correctamente para 1 ingrediente(s).", { exact: true })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: ingredient.name }).getByRole("cell").last()).toHaveText("20");
    const stocked = await (await request.get("/ingredients")).json();
    expect(stocked.find((item: { id: string }) => item.id === ingredient.id)).toMatchObject({ stockQuantity: 2000, metric: "weight" });
    const line = { productId: `menu:${product.id}`, productName: product.name, unitPrice: 1000, quantity: 2 };
    const order = await (await request.post("/orders", { data: { items: [line] } })).json();
    const paid = await request.put(`/orders/${order.id}/status`, { data: { status: "pagada", paymentMethod: "efectivo" } });
    expect(paid.status(), await paid.text()).toBe(200);
    const after = await (await request.get("/ingredients")).json();
    expect(after.find((item: { id: string }) => item.id === ingredient.id).stockQuantity).toBe(1500);
    const blocked = await (await request.post("/orders", { data: { items: [{ ...line, quantity: 7 }] } })).json();
    expect((await request.put(`/orders/${blocked.id}/status`, { data: { status: "pagada" } })).status()).toBe(409);
    const transactions = await (await request.get("/financial-transactions")).json();
    const stockEntries = await (await request.get("/stocks")).json();
    const receipt = stockEntries.find((item: { productId: string; purchaseTotal?: number }) => item.productId === ingredient.id && item.purchaseTotal !== undefined);
    expect(receipt.purchaseTotal).toBe(12000.5);
    expect(transactions.filter((item: { referenceId: string }) => item.referenceId === receipt.id)).toHaveLength(1);
  } finally {
    await request.put("/system-settings", { data: { allowOutOfStockSales: settings.allowOutOfStockSales } });
    await request.delete(`/recipes/${recipe.id}`);
    await request.delete(`/products/${product.id}`);
    await request.delete(`/ingredients/${ingredient.id}`);
  }
});

test("create ingredients with portions and initial stock in one batch", async ({ page, request }) => {
  await page.route("**/users", (route) => route.fulfill({ json: [{ id: "admin", username: "admin", role: "admin", password: createHash("md5").update("test").digest("hex") }] }));
  await page.goto("/login");
  await page.getByLabel("Usuario", { exact: true }).fill("admin");
  await page.locator('input[type="password"]').fill("test");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/operation$/);
  await page.goto("/stock/ingredients");
  await page.getByRole("button", { name: "Agregar nuevo ingrediente" }).click();
  const card = page.getByRole("group", { name: "Nuevo ingrediente 1", exact: true });
  const name = `Nuevo peso ${Date.now()}`;
  await card.getByLabel("Nombre", { exact: true }).fill(name);
  await card.getByRole("combobox", { name: "Tipo", exact: true }).selectOption("weight");
  await card.getByLabel("Nombre porcion", { exact: true }).fill("Medallon");
  await card.getByLabel("Gramos por porcion", { exact: true }).fill("125");
  await card.getByLabel("Costo de compra (total ARS)", { exact: true }).fill("1500");
  const days = card.getByRole("spinbutton", { name: "Dias hasta vencimiento", exact: true });
  await days.fill("10");
  const date = card.locator('input[type="date"]');
  const expected = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 10); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; });
  await expect(date).toHaveValue(expected);
  await date.fill("2099-12-31");
  await expect(days).not.toHaveValue("10");
  await days.fill("0");
  await expect(days).toHaveValue("0");
  await days.fill("");
  await expect(date).toHaveValue("");
  await days.fill("10");
  await card.getByLabel("Cantidad recibida (kg)", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Guardar ingresos (1)", exact: true }).click();
  await expect(page.getByText("Stock ingresado correctamente para 1 ingrediente(s).", { exact: true })).toBeVisible();
  const saved = (await (await request.get("/ingredients")).json()).find((item: { name: string }) => item.name === name);
  try {
    expect(saved).toMatchObject({ stockQuantity: 2000, portionName: "Medallon", portionSizeGrams: 125, expiresInDays: 10, nextExpirationDate: expected });
    await page.reload();
    await expect(page.getByRole("row").filter({ hasText: name }).getByRole("cell").last()).toHaveText("16");
  } finally { if (saved) await request.delete(`/ingredients/${saved.id}`); }
});

test("invalid initial stock leaves no ingredient or receipt behind", async ({ request }) => {
  const before = await (await request.get("/ingredients")).json();
  const stocks = await (await request.get("/stocks")).json();
  const entry = { newIngredient: { name: "Atomic new ingredient", stockMode: "unit", expiresInDays: 5 }, quantity: 3, metric: "unit", purchaseTotal: 0, expirationDate: "2099-12-31" };
  const result = await request.post("/ingredient-stock-entries", { data: { entries: [entry, { ...entry, quantity: -1 }] } });
  expect(result.status()).toBe(400);
  expect(await (await request.get("/ingredients")).json()).toEqual(before);
  expect(await (await request.get("/stocks")).json()).toEqual(stocks);
});
