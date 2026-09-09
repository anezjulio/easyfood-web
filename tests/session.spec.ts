import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";

test("login survives reload and logout remains effective", async ({ page }) => {
  await page.route("**/users", (route) => route.fulfill({ json: [{
    id: "session-test", username: "session-test", role: "admin",
    password: createHash("md5").update("test-password").digest("hex"),
  }] }));
  await page.goto("/login");
  await page.getByLabel("Usuario", { exact: true }).fill("session-test");
  await page.locator('input[type="password"]').fill("test-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/operation$/);
  await page.reload();
  await expect(page.getByText("session-test", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/operation$/);
  await page.goto("/help");
  await page.reload();
  await expect(page).toHaveURL(/\/help$/);
  await page.goto("/operation");
  await page.getByRole("button", { name: "Cerrar sesion" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/operation");
  await expect(page).toHaveURL(/\/login$/);
});

test("invalid stored session returns to login without crashing", async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() => sessionStorage.setItem("easyfood.auth.session", "{invalid"));
  await page.goto("/operation");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});

test("API is available and production serves only built assets", async ({ request }, info) => {
  const products = await request.get("/products", { headers: { Accept: "application/json" } });
  expect(products.ok()).toBeTruthy();
  expect(products.headers()["content-type"]).toContain("application/json");
  expect(Array.isArray(await products.json())).toBeTruthy();
  const html = await (await request.get("/login", { headers: { Accept: "text/html" } })).text();
  if (info.project.name === "production") {
    expect(html).not.toContain("/@vite/client");
    expect(html).not.toContain("/src/main.tsx");
    expect(html).toContain("/assets/");
    expect((await request.get("/@vite/client")).status()).toBe(404);
  } else {
    expect(html).toContain("/@vite/client");
  }
});

test("writing runtime files does not reload the login", async ({ page }, info) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  await page.getByLabel("Usuario", { exact: true }).fill("unsent-login");
  let navigations = 0;
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations++; });
  const file = resolve("mock-api", `reload-test-${info.project.name}-${process.pid}.html`);
  try {
    await writeFile(file, "<p>runtime file</p>");
    await page.waitForTimeout(1500);
    await writeFile(file, "<p>updated runtime file</p>");
    await page.waitForTimeout(1500);
    expect(navigations).toBe(0);
    await expect(page.getByLabel("Usuario", { exact: true })).toHaveValue("unsent-login");
  } finally {
    await unlink(file);
  }
});
