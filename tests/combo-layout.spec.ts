import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";

test("combo selection keeps quantities and category choices in compact rows", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.route("**/users", route => route.fulfill({ json: [{ id: "admin", username: "admin", role: "admin", password: createHash("md5").update("test").digest("hex") }] }));
  await page.goto("/login");
  await page.getByLabel("Usuario", { exact: true }).fill("admin");
  await page.locator('input[type="password"]').fill("test");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/operation$/);
  await page.goto("/menu-products");
  await expect(page.getByRole("tab", { name: "Productos", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "3- Categoria", exact: true }).selectOption({ label: "Hamburguesa" });
  const sizes = await Promise.all(["1- Nombre", "2- Precio venta", "3- Categoria", "4- Descripcion"].map(name => (name === "3- Categoria" ? page.getByRole("combobox", { name, exact: true }) : page.getByLabel(name, { exact: true })).boundingBox()));
  await page.getByRole("tab", { name: "Combos", exact: true }).click();
  const card = page.locator("section").filter({ has: page.getByRole("heading", { name: "Crear combo", exact: true }) }).first();
  await card.getByRole("combobox", { name: "3- Categoria", exact: true }).selectOption({ label: "Hamburguesa" });
  for (const [index, name] of ["1- Nombre", "2- Precio venta", "3- Categoria", "4- Descripcion"].entries()) {
    const box = await (name === "3- Categoria" ? card.getByRole("combobox", { name, exact: true }) : card.getByLabel(name, { exact: true })).boundingBox();
    expect(Math.abs(box!.width - sizes[index]!.width)).toBeLessThan(2);
  }
  await expect(card.getByRole("button", { name: "Producto fijo", exact: true })).toHaveAttribute("aria-pressed", "true");
  const picker = card.locator('[class*="groupedPicker"]');
  await expect(picker.getByRole("button", { name: /^[+--]$/ })).toHaveCount(0);
  const product = picker.getByRole("button").first();
  await product.click();
  await product.click();
  const selected = card.getByRole("list", { name: "Productos seleccionados" });
  await expect(selected.getByRole("status")).toHaveText("2 u.");
  await selected.getByRole("button", { name: /^Restar / }).click();
  await expect(selected.getByRole("status")).toHaveText("1 u.");
  await selected.getByRole("button", { name: /^Agregar / }).click();
  await expect(selected.getByRole("status")).toHaveText("2 u.");
  await selected.getByRole("button", { name: /^Quitar / }).click();
  await expect(selected).toHaveCount(0);
  await card.getByRole("button", { name: "Categoria a eleccion", exact: true }).click();
  await expect(card.getByRole("button", { name: "Categoria a eleccion", exact: true })).toHaveAttribute("aria-pressed", "true");
  await card.locator('[class*="allowedProducts"]').getByRole("combobox").selectOption({ label: "Hamburguesa" });
  await card.getByRole("button", { name: "Todos", exact: true }).click();
  await card.getByRole("button", { name: "Agregar categoria", exact: true }).click();
  await expect(selected.getByRole("listitem")).toHaveCount(1);
  const choice = selected.getByRole("checkbox").first();
  const checked = await choice.isChecked();
  await choice.click();
  await expect(choice).toBeChecked({ checked: !checked });
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
