import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

const PORT = Number(process.env.FAKE_API_PORT || 4002);
const DB_PATH = resolve(process.cwd(), "mock-api", "db.json");
const IMAGE_DIR = resolve(process.cwd(), process.env.FAKE_API_IMAGE_DIR || "images");
const IMAGE_BASE_URL = process.env.FAKE_API_IMAGE_BASE_URL || `http://localhost:${PORT}/images`;

function padIdPart(value) {
  return String(value).padStart(2, "0");
}

function formatIdDatePart(input) {
  return `${padIdPart(input.getDate())}${padIdPart(input.getMonth() + 1)}${input.getFullYear()}${padIdPart(input.getHours())}${padIdPart(input.getMinutes())}${padIdPart(input.getSeconds())}`;
}

function buildEntityId(prefix, inputDate = new Date()) {
  const suffix = Math.floor(Math.random() * 10_000)
    .toString()
    .padStart(4, "0");
  return `${prefix}${formatIdDatePart(inputDate)}${suffix}`;
}

const defaultDb = {
  products: [
    {
      id: "p1",
      name: "Coca-Cola 500ml",
      price: 1500,
      costPrice: 1200,
      createdAt: "2026-01-20T12:00:00.000Z",
      barcode: "7790000000001",
      category: "bebida",
    },
    {
      id: "p2",
      name: "Alfajor",
      price: 900,
      costPrice: 700,
      createdAt: "2026-01-22T09:30:00.000Z",
      barcode: "7790000000002",
      category: "golosina",
    },
    {
      id: "p3",
      name: "Agua 1.5L",
      price: 1200,
      costPrice: 900,
      createdAt: "2026-01-23T18:10:00.000Z",
      barcode: "7790000000003",
      category: "bebida",
    },
    {
      id: "p4",
      name: "Pan lactal",
      price: 2200,
      costPrice: 1600,
      createdAt: "2026-01-05T10:15:00.000Z",
      barcode: "7790000000004",
      category: "vivere",
    },
    {
      id: "p5",
      name: "Leche entera 1L",
      price: 1800,
      costPrice: 1400,
      createdAt: "2026-01-06T08:00:00.000Z",
      barcode: "7790000000005",
      category: "vivere",
    },
  ],
  productPrices: [],
  deleteRequests: [],
  priceMarginSettings: {
    categoryMargins: {
      bebida: 30,
      vivere: 30,
      helado: 30,
      chocolate: 30,
      tabaqueria: 30,
      golosina: 30,
      perecedero: 30,
    },
    productMargins: [],
    categoryMarginHistory: [],
    productMarginHistory: [],
  },
  paymentMethodSettings: {
    methods: [
      { method: "efectivo", discountPercent: 0, surchargePercent: 0 },
      { method: "tarjeta debito", discountPercent: 0, surchargePercent: 0 },
      { method: "tarjeta credito", discountPercent: 0, surchargePercent: 0 },
      { method: "mercadopago", discountPercent: 0, surchargePercent: 0 },
    ],
  },
  taxSettings: {
    ivaPercent: 21,
    mode: "show_only",
  },
};

async function ensureDbFile() {
  const folder = dirname(DB_PATH);
  await mkdir(folder, { recursive: true });
  if (!existsSync(DB_PATH)) {
    await writeFile(DB_PATH, JSON.stringify(defaultDb, null, 2), "utf8");
  }
}

async function ensureImageDir() {
  await mkdir(IMAGE_DIR, { recursive: true });
}

async function readDb() {
  await ensureDbFile();
  const raw = await readFile(DB_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") return { ...defaultDb };
  if (!Array.isArray(parsed.products)) parsed.products = [];
  if (!Array.isArray(parsed.productPrices)) parsed.productPrices = [];
  if (!Array.isArray(parsed.deleteRequests)) parsed.deleteRequests = [];
  parsed.products = parsed.products.map((item) => {
    const category = normalizeCategory(item?.category) || "vivere";
    const price = Math.max(1, Math.trunc(Number(item?.price) || 0));
    const rawCostPrice = Math.trunc(Number(item?.costPrice));
    const costPrice = Number.isFinite(rawCostPrice) && rawCostPrice > 0 ? rawCostPrice : price;
    return {
      ...item,
      price,
      costPrice,
      category,
      supplyOrderId: String(item?.supplyOrderId || "").trim() || undefined,
    };
  });
  if (!parsed.priceMarginSettings || typeof parsed.priceMarginSettings !== "object") {
    parsed.priceMarginSettings = { ...defaultDb.priceMarginSettings };
  }
  if (!parsed.priceMarginSettings.categoryMargins || typeof parsed.priceMarginSettings.categoryMargins !== "object") {
    parsed.priceMarginSettings.categoryMargins = { ...defaultDb.priceMarginSettings.categoryMargins };
  }
  if (!Array.isArray(parsed.priceMarginSettings.productMargins)) {
    parsed.priceMarginSettings.productMargins = [];
  }
  if (!Array.isArray(parsed.priceMarginSettings.categoryMarginHistory)) {
    parsed.priceMarginSettings.categoryMarginHistory = [];
  }
  if (!Array.isArray(parsed.priceMarginSettings.productMarginHistory)) {
    parsed.priceMarginSettings.productMarginHistory = [];
  }
  if (!parsed.paymentMethodSettings || typeof parsed.paymentMethodSettings !== "object") {
    parsed.paymentMethodSettings = { ...defaultDb.paymentMethodSettings };
  }
  if (!Array.isArray(parsed.paymentMethodSettings.methods)) {
    parsed.paymentMethodSettings.methods = [...defaultDb.paymentMethodSettings.methods];
  }
  if (!parsed.taxSettings || typeof parsed.taxSettings !== "object") {
    parsed.taxSettings = { ...defaultDb.taxSettings };
  }
  parsed.taxSettings.ivaPercent = normalizeMarginPercent(Number(parsed.taxSettings.ivaPercent));
  parsed.taxSettings.mode = parsed.taxSettings.mode === "add_to_total" ? "add_to_total" : "show_only";
  return parsed;
}

async function writeDb(db) {
  await writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(data === undefined ? "" : JSON.stringify(data));
}

function sendNoContent(res) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end();
}

function sanitizeDraft(input) {
  const name = String(input?.name || "").trim();
  const price = Number(input?.price);
  const costPrice = Number(input?.costPrice);
  const marginPercent = Number(input?.marginPercent);
  const imageUrl = String(input?.imageUrl || "").trim() || undefined;
  const barcode = String(input?.barcode || "").trim() || undefined;
  const category = normalizeCategory(input?.category);
  const supplyOrderId = String(input?.supplyOrderId || "").trim() || undefined;
  return { name, price, costPrice, marginPercent, imageUrl, barcode, category, supplyOrderId };
}

function normalizeCategory(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (
    raw === "bebida" ||
    raw === "vivere" ||
    raw === "helado" ||
    raw === "chocolate" ||
    raw === "tabaqueria" ||
    raw === "golosina" ||
    raw === "perecedero"
  ) {
    return raw;
  }
  return undefined;
}

function isPaymentMethodValue(value) {
  return value === "efectivo" || value === "tarjeta debito" || value === "tarjeta credito" || value === "mercadopago";
}

function normalizeMarginPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function calculateSalePriceFromCost(costPrice, marginPercent) {
  const safeCost = Math.max(1, Math.trunc(Number(costPrice)));
  const safeMargin = normalizeMarginPercent(marginPercent);
  return Math.max(1, Math.round(safeCost * (1 + safeMargin / 100)));
}

function inferCostPriceFromSalePrice(salePrice, marginPercent) {
  const safeSale = Math.max(1, Math.trunc(Number(salePrice)));
  const safeMargin = normalizeMarginPercent(marginPercent);
  if (safeMargin <= 0) return safeSale;
  return Math.max(1, Math.round(safeSale / (1 + safeMargin / 100)));
}

function computeMarginPercentFromPrices(costPrice, salePrice) {
  const safeCost = Math.trunc(Number(costPrice));
  const safeSale = Math.trunc(Number(salePrice));
  if (!Number.isFinite(safeCost) || safeCost <= 0 || !Number.isFinite(safeSale) || safeSale <= 0) {
    return 0;
  }
  return normalizeMarginPercent(((safeSale - safeCost) / safeCost) * 100);
}

function getCategoryPriceMarginPercent(db, category) {
  const safeCategory = category || "vivere";
  const configured = Number(db?.priceMarginSettings?.categoryMargins?.[safeCategory]);
  if (!Number.isFinite(configured)) return 30;
  return normalizeMarginPercent(configured);
}

function getEffectiveProductPriceMarginPercent(db, productId, category) {
  const byProduct = (db?.priceMarginSettings?.productMargins || []).find((item) => item.productId === productId);
  if (byProduct) return normalizeMarginPercent(Number(byProduct.marginPercent));
  return getCategoryPriceMarginPercent(db, category);
}

const MAX_MARGIN_HISTORY = 300;

function buildMarginHistoryId(prefix) {
  return buildEntityId(prefix);
}

function pushCategoryMarginHistory(db, category, previousMarginPercent, marginPercent) {
  if (previousMarginPercent === marginPercent) return;
  const history = Array.isArray(db?.priceMarginSettings?.categoryMarginHistory)
    ? db.priceMarginSettings.categoryMarginHistory
    : [];
  db.priceMarginSettings.categoryMarginHistory = [
    {
      id: buildMarginHistoryId("cmh"),
      category,
      previousMarginPercent,
      marginPercent,
      createdAt: new Date().toISOString(),
    },
    ...history,
  ].slice(0, MAX_MARGIN_HISTORY);
}

function pushProductMarginHistory(db, productId, previousMarginPercent, marginPercent) {
  if (previousMarginPercent === marginPercent) return;
  const history = Array.isArray(db?.priceMarginSettings?.productMarginHistory)
    ? db.priceMarginSettings.productMarginHistory
    : [];
  db.priceMarginSettings.productMarginHistory = [
    {
      id: buildMarginHistoryId("pmh"),
      productId,
      previousMarginPercent,
      marginPercent,
      createdAt: new Date().toISOString(),
    },
    ...history,
  ].slice(0, MAX_MARGIN_HISTORY);
}

function readBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        rejectBody(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!data.trim()) {
        resolveBody({});
        return;
      }
      try {
        resolveBody(JSON.parse(data));
      } catch {
        rejectBody(new Error("Invalid JSON"));
      }
    });
    req.on("error", rejectBody);
  });
}

function readBinaryBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 10_000_000) {
        rejectBody(new Error("Payload too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
    req.on("error", rejectBody);
  });
}

function safeFileName(input) {
  const raw = String(input || "").trim().toLowerCase();
  const clean = raw.replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-");
  return clean.replace(/^\.+/, "") || `img-${Date.now()}.bin`;
}

function guessExtFromContentType(contentType) {
  if (contentType.includes("image/jpeg")) return ".jpg";
  if (contentType.includes("image/png")) return ".png";
  if (contentType.includes("image/webp")) return ".webp";
  if (contentType.includes("image/gif")) return ".gif";
  if (contentType.includes("image/svg+xml")) return ".svg";
  return ".bin";
}

function contentTypeFromExt(fileExt) {
  if (fileExt === ".jpg" || fileExt === ".jpeg") return "image/jpeg";
  if (fileExt === ".png") return "image/png";
  if (fileExt === ".webp") return "image/webp";
  if (fileExt === ".gif") return "image/gif";
  if (fileExt === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function extractId(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 2 && parts[0] === "products") return parts[1];
  return null;
}

function extractPriceMarginCategory(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 3 || parts[0] !== "price-margin-settings" || parts[1] !== "category") return null;
  return normalizeCategory(decodeURIComponent(parts[2])) || null;
}

function extractPriceMarginProductId(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 3 || parts[0] !== "price-margin-settings" || parts[1] !== "product") return null;
  const productId = String(parts[2] || "").trim();
  return productId || null;
}

function extractPaymentMethodSetting(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || parts[0] !== "payment-method-settings") return null;
  const method = String(decodeURIComponent(parts[1]) || "").trim().toLowerCase();
  return isPaymentMethodValue(method) ? method : null;
}

const server = http.createServer(async (req, res) => {
  try {
    const method = req.method || "GET";
    const url = new URL(req.url || "/", `http://localhost:${PORT}`);
    const pathname = url.pathname;

    if (method === "OPTIONS") {
      sendNoContent(res);
      return;
    }

    if (pathname === "/products" && method === "GET") {
      const db = await readDb();
      sendJson(res, 200, db.products);
      return;
    }

    if (pathname.startsWith("/images/") && method === "GET") {
      await ensureImageDir();
      const rel = pathname.slice("/images/".length);
      const safeName = safeFileName(rel);
      const filePath = resolve(IMAGE_DIR, safeName);
      if (!filePath.startsWith(IMAGE_DIR)) {
        sendJson(res, 400, { message: "Invalid path" });
        return;
      }
      if (!existsSync(filePath)) {
        sendJson(res, 404, { message: "Image not found" });
        return;
      }
      const buffer = await readFile(filePath);
      res.writeHead(200, {
        "Content-Type": contentTypeFromExt(extname(safeName).toLowerCase()),
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(buffer);
      return;
    }

    if (pathname === "/uploads/images" && method === "POST") {
      await ensureImageDir();
      const contentType = String(req.headers["content-type"] || "").toLowerCase();
      if (!contentType.startsWith("image/")) {
        sendJson(res, 400, { message: "Invalid image content-type" });
        return;
      }
      const body = await readBinaryBody(req);
      if (!body || body.length === 0) {
        sendJson(res, 400, { message: "Empty image payload" });
        return;
      }

      const requestedName = safeFileName(url.searchParams.get("name") || "");
      const requestedExt = extname(requestedName);
      const ext = requestedExt || guessExtFromContentType(contentType);
      const baseName = requestedExt ? requestedName.slice(0, -requestedExt.length) : requestedName;
      const finalName = `${baseName || `img-${Date.now()}`}-${Math.floor(Math.random() * 100000)}${ext}`;
      const filePath = resolve(IMAGE_DIR, finalName);

      if (!filePath.startsWith(IMAGE_DIR)) {
        sendJson(res, 400, { message: "Invalid image target path" });
        return;
      }

      await writeFile(filePath, body);
      sendJson(res, 201, {
        path: `/images/${finalName}`,
        url: `${IMAGE_BASE_URL}/${finalName}`,
      });
      return;
    }

    if (pathname === "/products" && method === "POST") {
      const db = await readDb();
      const draft = sanitizeDraft(await readBody(req));
      const hasPrice = Number.isFinite(draft.price) && draft.price > 0;
      const hasCostPrice = Number.isFinite(draft.costPrice) && draft.costPrice > 0;
      if (!draft.name || (!hasPrice && !hasCostPrice)) {
        sendJson(res, 400, { message: "Invalid product draft" });
        return;
      }
      const category = draft.category || "vivere";
      const effectiveMarginPercent =
        Number.isFinite(draft.marginPercent) && draft.marginPercent >= 0
          ? normalizeMarginPercent(draft.marginPercent)
          : getCategoryPriceMarginPercent(db, category);
      const costPrice = Math.max(1, Math.trunc(hasCostPrice ? draft.costPrice : draft.price));
      const salePrice = Math.max(1, Math.trunc(hasCostPrice ? calculateSalePriceFromCost(costPrice, effectiveMarginPercent) : draft.price));
      const now = new Date().toISOString();
      const product = {
        id: buildEntityId("p"),
        name: draft.name,
        price: salePrice,
        costPrice,
        createdAt: now,
        imageUrl: draft.imageUrl,
        barcode: draft.barcode,
        category,
        supplyOrderId: draft.supplyOrderId,
      };
      db.products.unshift(product);
      db.productPrices.unshift({
        id: buildEntityId("pp"),
        productId: product.id,
        newPrice: product.price,
        costPrice: product.costPrice,
        marginPercent: computeMarginPercentFromPrices(product.costPrice, product.price),
        createdAt: now,
      });
      await writeDb(db);
      sendJson(res, 201, product);
      return;
    }

    if (pathname === "/product-prices" && method === "GET") {
      const db = await readDb();
      sendJson(res, 200, db.productPrices);
      return;
    }

    if (pathname === "/product-prices" && method === "POST") {
      const db = await readDb();
      const body = await readBody(req);
      const productId = String(body?.productId || "").trim();
      const newPrice = Math.trunc(Number(body?.newPrice));
      if (!productId || !Number.isFinite(newPrice) || newPrice <= 0) {
        sendJson(res, 400, { message: "Invalid product price draft" });
        return;
      }
      const productIndex = db.products.findIndex((item) => item.id === productId);
      if (productIndex < 0) {
        sendJson(res, 404, { message: "Product not found" });
        return;
      }
      const now = new Date().toISOString();
      const product = db.products[productIndex];
      const marginPercent =
        Number.isFinite(Number(body?.marginPercent)) && Number(body?.marginPercent) >= 0
          ? normalizeMarginPercent(Number(body?.marginPercent))
          : getEffectiveProductPriceMarginPercent(db, product.id, product.category);
      const fallbackCostPrice =
        Number.isFinite(Number(product.costPrice)) && Number(product.costPrice) > 0
          ? Math.trunc(Number(product.costPrice))
          : inferCostPriceFromSalePrice(newPrice, marginPercent);
      const nextCostPrice =
        Number.isFinite(Number(body?.costPrice)) && Number(body?.costPrice) > 0
          ? Math.trunc(Number(body?.costPrice))
          : fallbackCostPrice;
      db.products[productIndex] = {
        ...product,
        price: newPrice,
        costPrice: nextCostPrice,
      };
      const record = {
        id: buildEntityId("pp"),
        productId,
        newPrice,
        costPrice: nextCostPrice,
        marginPercent: computeMarginPercentFromPrices(nextCostPrice, newPrice),
        createdAt: now,
      };
      db.productPrices.unshift(record);
      await writeDb(db);
      sendJson(res, 201, record);
      return;
    }

    if (pathname === "/price-margin-settings" && method === "GET") {
      const db = await readDb();
      sendJson(res, 200, db.priceMarginSettings);
      return;
    }

    const priceMarginCategory = extractPriceMarginCategory(pathname);
    if (priceMarginCategory && method === "PUT") {
      const db = await readDb();
      const body = await readBody(req);
      const marginPercent = Number(body?.marginPercent);
      if (!Number.isFinite(marginPercent)) {
        sendJson(res, 400, { message: "Invalid marginPercent" });
        return;
      }
      const previousMarginPercent = normalizeMarginPercent(
        Number(db?.priceMarginSettings?.categoryMargins?.[priceMarginCategory]),
      );
      const nextMarginPercent = normalizeMarginPercent(marginPercent);
      db.priceMarginSettings.categoryMargins[priceMarginCategory] = nextMarginPercent;
      pushCategoryMarginHistory(db, priceMarginCategory, previousMarginPercent, nextMarginPercent);
      await writeDb(db);
      sendJson(res, 200, db.priceMarginSettings);
      return;
    }

    const priceMarginProductId = extractPriceMarginProductId(pathname);
    if (priceMarginProductId && method === "PUT") {
      const db = await readDb();
      const body = await readBody(req);
      const marginPercent = Number(body?.marginPercent);
      if (!Number.isFinite(marginPercent)) {
        sendJson(res, 400, { message: "Invalid marginPercent" });
        return;
      }
      const normalized = normalizeMarginPercent(marginPercent);
      const existingIndex = db.priceMarginSettings.productMargins.findIndex((item) => item.productId === priceMarginProductId);
      const previousMarginPercent =
        existingIndex < 0 ? null : normalizeMarginPercent(Number(db.priceMarginSettings.productMargins[existingIndex]?.marginPercent));
      if (existingIndex < 0) {
        db.priceMarginSettings.productMargins.push({ productId: priceMarginProductId, marginPercent: normalized });
      } else {
        db.priceMarginSettings.productMargins[existingIndex] = { productId: priceMarginProductId, marginPercent: normalized };
      }
      pushProductMarginHistory(db, priceMarginProductId, previousMarginPercent, normalized);
      await writeDb(db);
      sendJson(res, 200, db.priceMarginSettings);
      return;
    }

    if (priceMarginProductId && method === "DELETE") {
      const db = await readDb();
      const existing = db.priceMarginSettings.productMargins.find((item) => item.productId === priceMarginProductId);
      db.priceMarginSettings.productMargins = db.priceMarginSettings.productMargins.filter(
        (item) => item.productId !== priceMarginProductId,
      );
      if (existing) {
        pushProductMarginHistory(db, priceMarginProductId, normalizeMarginPercent(Number(existing.marginPercent)), null);
      }
      await writeDb(db);
      sendJson(res, 200, db.priceMarginSettings);
      return;
    }

    if (pathname === "/payment-method-settings" && method === "GET") {
      const db = await readDb();
      sendJson(res, 200, db.paymentMethodSettings);
      return;
    }

    const paymentMethodSetting = extractPaymentMethodSetting(pathname);
    if (paymentMethodSetting && method === "PUT") {
      const db = await readDb();
      const body = await readBody(req);
      const discountPercent = Number(body?.discountPercent);
      const surchargePercent = Number(body?.surchargePercent);
      if (!Number.isFinite(discountPercent) || !Number.isFinite(surchargePercent)) {
        sendJson(res, 400, { message: "Invalid payment method settings draft" });
        return;
      }
      const next = {
        method: paymentMethodSetting,
        discountPercent: normalizeMarginPercent(discountPercent),
        surchargePercent: normalizeMarginPercent(surchargePercent),
      };
      const idx = db.paymentMethodSettings.methods.findIndex((item) => item.method === paymentMethodSetting);
      if (idx < 0) {
        db.paymentMethodSettings.methods.push(next);
      } else {
        db.paymentMethodSettings.methods[idx] = next;
      }
      await writeDb(db);
      sendJson(res, 200, db.paymentMethodSettings);
      return;
    }

    if (pathname === "/tax-settings" && method === "GET") {
      const db = await readDb();
      sendJson(res, 200, db.taxSettings);
      return;
    }

    if (pathname === "/tax-settings" && method === "PUT") {
      const db = await readDb();
      const body = await readBody(req);
      const nextIva = Number(body?.ivaPercent);
      const nextMode = String(body?.mode || "").trim().toLowerCase();
      if (!Number.isFinite(nextIva) && nextMode !== "add_to_total" && nextMode !== "show_only") {
        sendJson(res, 400, { message: "Invalid tax settings draft" });
        return;
      }
      if (Number.isFinite(nextIva)) {
        db.taxSettings.ivaPercent = normalizeMarginPercent(nextIva);
      }
      if (nextMode === "add_to_total" || nextMode === "show_only") {
        db.taxSettings.mode = nextMode;
      }
      await writeDb(db);
      sendJson(res, 200, db.taxSettings);
      return;
    }

    const productId = extractId(pathname);
    if (productId && method === "PUT") {
      const db = await readDb();
      const draft = sanitizeDraft(await readBody(req));
      if (!draft.name) {
        sendJson(res, 400, { message: "Invalid product draft" });
        return;
      }
      const index = db.products.findIndex((item) => item.id === productId);
      if (index < 0) {
        sendJson(res, 404, { message: "Product not found" });
        return;
      }
      const current = db.products[index];
      const category = draft.category || current.category || "vivere";
      const hasPrice = Number.isFinite(draft.price) && draft.price > 0;
      const hasCostPrice = Number.isFinite(draft.costPrice) && draft.costPrice > 0;
      const marginPercent =
        Number.isFinite(draft.marginPercent) && draft.marginPercent >= 0
          ? normalizeMarginPercent(draft.marginPercent)
          : getEffectiveProductPriceMarginPercent(db, current.id, category);
      const fallbackCostPrice =
        Number.isFinite(Number(current.costPrice)) && Number(current.costPrice) > 0
          ? Math.trunc(Number(current.costPrice))
          : inferCostPriceFromSalePrice(current.price, marginPercent);
      const nextCostPrice = hasCostPrice ? Math.trunc(draft.costPrice) : fallbackCostPrice;
      const nextPrice = hasCostPrice
        ? calculateSalePriceFromCost(nextCostPrice, marginPercent)
        : hasPrice
          ? Math.trunc(draft.price)
          : current.price;
      db.products[index] = {
        ...current,
        name: draft.name,
        price: nextPrice,
        costPrice: nextCostPrice,
        imageUrl: draft.imageUrl,
        barcode: draft.barcode,
        category,
        supplyOrderId: typeof draft.supplyOrderId === "string" ? draft.supplyOrderId : current.supplyOrderId,
      };
      await writeDb(db);
      sendJson(res, 200, db.products[index]);
      return;
    }

    if (productId && method === "DELETE") {
      const db = await readDb();
      const before = db.products.length;
      db.products = db.products.filter((item) => item.id !== productId);
      const removed = db.products.length !== before;
      if (removed) {
        db.priceMarginSettings.productMargins = db.priceMarginSettings.productMargins.filter(
          (item) => item.productId !== productId,
        );
        await writeDb(db);
      }
      sendJson(res, 200, { ok: removed });
      return;
    }

    if (pathname === "/delete-requests" && method === "POST") {
      const db = await readDb();
      const body = await readBody(req);
      const request = {
        id: buildEntityId("dr"),
        productId: String(body?.productId || ""),
        productName: String(body?.productName || ""),
        requestedBy: String(body?.requestedBy || "operator"),
        requestedAt: new Date().toISOString(),
        status: "pending",
      };
      db.deleteRequests.unshift(request);
      await writeDb(db);
      sendJson(res, 201, request);
      return;
    }

    sendJson(res, 404, { message: "Not found" });
  } catch (error) {
    sendJson(res, 500, { message: error instanceof Error ? error.message : "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Fake API running on http://localhost:${PORT}`);
  console.log(`DB file: ${DB_PATH}`);
  console.log(`Image dir: ${IMAGE_DIR}`);
});
