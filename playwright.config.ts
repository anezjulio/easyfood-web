import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  use: { headless: true },
  projects: [
    { name: "production", use: { baseURL: "http://127.0.0.1:4181" } },
    { name: "development", use: { baseURL: "http://127.0.0.1:4182" } },
  ],
  webServer: [
    { command: "npm start", url: "http://127.0.0.1:4181/products", env: { PORT: "4181", DATA_ROOT: mkdtempSync(join(tmpdir(), "easyfood-prod-test-")) } },
    { command: "npm run dev", url: "http://127.0.0.1:4182/products", env: { PORT: "4182", DATA_ROOT: mkdtempSync(join(tmpdir(), "easyfood-dev-test-")) } },
  ],
});
