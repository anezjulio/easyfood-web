import { existsSync } from "node:fs";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import type { IncomingMessage } from "node:http";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const PROJECT_ROOT = process.cwd();
const CONFIGURED_DATA_ROOT = resolveDataRoot();
const REPO_MOCK_API_DIR = resolve(PROJECT_ROOT, "mock-api");
const REPO_IMAGES_DIR = resolve(PROJECT_ROOT, "images");
const LEGACY_DB_PATH = resolveStoragePath("mock-api", "db.json");
const LEGACY_IMAGE_DIR = resolveStoragePath("images");
const LEGACY_RECEIPTS_DIR = resolveReceiptsDir();
const DATA_STORES_PATH = resolveStoragePath("mock-api", "data-stores.json");
const DATA_STORES_ROOT_DIR = resolveStoragePath("mock-api", "data-stores");
const DATA_STORES_IMAGES_ROOT_DIR = resolveStoragePath("images");
const DATA_STORES_RECEIPTS_ROOT_DIR = resolve(LEGACY_RECEIPTS_DIR, "stores");
const DATA_STORES_SEED_PATH = resolve(REPO_MOCK_API_DIR, "data-stores.json");
const DEFAULT_DATA_STORE_ID = "default";
const DEV_SERVER_PORT = parsePort(process.env.PORT, 5173);
const PREVIEW_PORT = parsePort(process.env.PORT, 4173);
const ALLOWED_HOSTS = resolveAllowedHosts();
const JS_COMPAT_TARGET = "es2018";
const CSS_COMPAT_TARGET = "chrome80";

type Product = {
  id: string;
  name: string;
  price: number;
  costPrice?: number;
  createdAt: string;
  imageUrl?: string;
  barcode?: string;
  brand?: string;
  category?: "bebida" | "hamburguesa" | "pancho" | "combos" | "pollo" | "vegano";
  supplyOrderId?: string;
};

type ProductPrice = {
  id: string;
  productId: string;
  newPrice: number;
  costPrice?: number;
  marginPercent?: number;
  createdAt: string;
};

type IngredientStockMode = "weight" | "package" | "unit";

type Ingredient = {
  id: string;
  name: string;
  expiresInDays: number;
  stockMode: IngredientStockMode;
  stockQuantity: number;
  createdAt: string;
  updatedAt?: string;
  lastEntryAt?: string;
  nextExpirationDate?: string;
};

type MenuRecipeItem = {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  stockMode: IngredientStockMode;
};

type MenuProduct = {
  id: string;
  name: string;
  price: number;
  description?: string;
  imageUrl?: string;
  category?: Product["category"];
  recipeItems: MenuRecipeItem[];
  createdAt: string;
  updatedAt?: string;
};

type RequestType = "product-delete" | "operation-order";

type RequestStatus = "pending" | "approved" | "rejected";

type DeleteRequest = {
  id: string;
  requestType: RequestType;
  title: string;
  description?: string;
  productId?: string;
  productName?: string;
  requestedBy: string;
  requestedAt: string;
  status: RequestStatus;
  reviewedBy?: string;
  reviewedAt?: string;
};

type OperationRequestType = "merchandise" | "permissions";

type OperationRequestStatus = "pending" | "approved" | "rejected";

type OperationRequestItem = {
  productId: string;
  productName: string;
  quantity: number;
  barcode?: string;
  brand?: string;
  category?: Product["category"];
};

type OperationRequest = {
  id: string;
  requestType: OperationRequestType;
  description: string;
  items?: OperationRequestItem[];
  requestedBy: string;
  requestedAt: string;
  status: OperationRequestStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  supplyOrderId?: string;
  supplierMessage?: string;
  reviewComment?: string;
};

type StockEntry = {
  id: string;
  productId: string;
  manufactureDate?: string;
  expirationDate?: string;
  quantity: number;
  description?: string;
  supplyOrderId?: string;
  costPrice?: number;
  salePrice?: number;
  createdAt: string;
};

type PaymentMethod = "efectivo" | "tarjeta debito" | "tarjeta credito" | "mercadopago";

type PaymentMethodAdjustment = {
  method: PaymentMethod;
  discountPercent: number;
  surchargePercent: number;
};

type PaymentMethodSettings = {
  methods: PaymentMethodAdjustment[];
};

type TaxMode = "add_to_total" | "show_only";

type TaxSettings = {
  ivaPercent: number;
  mode: TaxMode;
};

type OrderStatus = "por pagar" | "pagada" | "cancelada";

type OrderItem = {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
};

type Order = {
  id: string;
  items: OrderItem[];
  createdAt: string;
  status: OrderStatus;
  total: number;
  operator: string;
  paymentMethod?: PaymentMethod;
  cancelledAt?: string;
};

type Invoice = {
  id: string;
  orderId: string;
  createdAt: string;
  total: number;
  paymentMethod: PaymentMethod;
  operator: string;
};

type ReceiptItem = {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
};

type Receipt = {
  id: string;
  orderId: string;
  orderCode: string;
  invoiceId?: string;
  createdAt: string;
  operator: string;
  paymentMethod: PaymentMethod;
  items: ReceiptItem[];
  total: number;
  filePath: string;
  html: string;
};

type Workday = {
  id: string;
  operator: string;
  startedAt: string;
  endedAt?: string;
  orderIds: string[];
  status?: "open" | "pending-close" | "closed";
  openingAssignedAmount?: number;
  openingDeclaredAmount?: number;
  openingDifferenceAmount?: number;
  closeRequestedAt?: string;
  closeSummary?: WorkdayCloseSummary;
  adminReview?: WorkdayAdminReview;
};

type WorkdayCloseSummary = {
  totalSales: number;
  totalByPaymentMethod: Record<PaymentMethod, number>;
  cashSales: number;
  totalExpenses: number;
  totalSupplyReturns: number;
  expectedClosingCash: number;
  declaredClosingCash: number;
  closingDifference: number;
  balanceTotal: number;
};

type WorkdayAuditChecks = {
  openingAmount: boolean;
  cashSales: boolean;
  expenses: boolean;
  supplyReturns: boolean;
  balance: boolean;
};

type WorkdayAdminReview = {
  reviewedBy: string;
  reviewedAt: string;
  checks: WorkdayAuditChecks;
  notes?: string;
  mismatchReport?: string;
};

type CashShift = "diurno" | "nocturno";
type AppUserRole = "admin" | "operator" | "terminal";

type CashOpeningAssignment = {
  operator: string;
  amount: number;
  shift: CashShift;
  startHour: string;
  endHour: string;
  updatedBy: string;
  updatedAt: string;
};

type SupplyOrderStatus = "pending" | "received";

type SupplyOrderItem = {
  productId: string;
  productName: string;
  quantity: number;
  barcode?: string;
  brand?: string;
  category?: Product["category"];
  receivedQuantity?: number;
  missingQuantity?: number;
  expirationDate?: string;
};

type SupplyOrder = {
  id: string;
  supplierName: string;
  description: string;
  expectedTotal: number;
  items: SupplyOrderItem[];
  createdAt: string;
  createdBy: string;
  status: SupplyOrderStatus;
  isExactAmount?: boolean;
  actualTotal?: number;
  remainingAmount?: number;
  receivedAt?: string;
  receivedBy?: string;
  invoiceImageUrl?: string;
  receiveComment?: string;
};

type ExpenseType = "recurrent" | "unexpected";
type ExpenseStatus = "pending-confirmation" | "confirmed";
type ExpenseAmountMode = "assigned" | "different";

type Expense = {
  id: string;
  description: string;
  amount: number;
  assignedAmount: number;
  expenseType: ExpenseType;
  invoiceImageUrl?: string;
  unexpectedImageUrl?: string;
  createdBy: string;
  createdAt: string;
  status: ExpenseStatus;
  confirmedAmount?: number;
  confirmedBy?: string;
  confirmedAt?: string;
  confirmationComment?: string;
  amountMode?: ExpenseAmountMode;
};

type FeedbackType = "suggestion" | "claim";
type FeedbackAuthorRole = "admin" | "operator";

type FeedbackEntry = {
  id: string;
  type: FeedbackType;
  message: string;
  isAnonymous: boolean;
  createdAt: string;
  createdBy: string;
  createdByRole: FeedbackAuthorRole;
};

type FinancialAccountKind = "asset" | "income" | "expense" | "category";

type FinancialAccount = {
  id: string;
  code: string;
  name: string;
  kind: FinancialAccountKind;
  description: string;
  currentBalance: number;
  createdAt: string;
  updatedAt: string;
};

type FinancialDirection = "in" | "out";
type FinancialEntryKind = "debit" | "credit";
type FinancialReferenceModule = "sale" | "expense" | "cash" | "supply" | "system";
type FinancialTransactionType =
  | "sale-income"
  | "sale-cash"
  | "sale-tobacco"
  | "expense-payment"
  | "expense-cash"
  | "supply-payment"
  | "supply-cash"
  | "supply-return"
  | "cash-opening"
  | "cash-close";

type FinancialTransaction = {
  id: string;
  createdAt: string;
  type: FinancialTransactionType;
  title: string;
  description: string;
  amount: number;
  direction: FinancialDirection;
  entryKind: FinancialEntryKind;
  accountId: string;
  accountCode: string;
  accountName: string;
  referenceModule: FinancialReferenceModule;
  referenceId: string;
  orderId?: string;
  workdayId?: string;
  expenseId?: string;
  supplyOrderId?: string;
  invoiceId?: string;
  paymentMethod?: PaymentMethod;
  actor?: string;
  countsInBalance: boolean;
};

type AppUserRecord = {
  id: string;
  name: string;
  email: string;
  username: string;
  role?: AppUserRole;
  password: string;
  createdAt: string;
  updatedAt: string;
  startHour: string;
  endHour: string;
};

type LicenseStatus = "active" | "pending-renewal" | "expired";

type LicenseIssuance = {
  id: string;
  issuedAt: string;
  expiresAt: string;
  createdAt: string;
  notes?: string;
};

type LicenseRecord = {
  id: string;
  name: string;
  description: string;
  category?: Product["category"];
  issueDate?: string;
  expirationDate?: string;
  durationDays?: number;
  contactEmail?: string;
  contactPhone?: string;
  sourceAddress?: string;
  status: LicenseStatus;
  createdAt: string;
  updatedAt: string;
  issuances: LicenseIssuance[];
};

type NotificationType =
  | "license-required"
  | "license-expiring"
  | "product-expiring"
  | "product-low-stock"
  | "expense-created"
  | "sale-created"
  | "supply-requested"
  | "supply-approved"
  | "supply-received"
  | "supply-pending-receive"
  | "cash-opened"
  | "cash-closed"
  | "cash"
  | "user-created"
  | "user-updated"
  | "user-deleted"
  | "price-changed"
  | "product-created"
  | "stock-created"
  | "operation-request-merchandise"
  | "operation-request-permissions"
  | "operation-request-reviewed"
  | "manual-fixed"
  | "manual-action"
  | "manual-due";

type NotificationStatus = "active" | "disabled" | "received";

type NotificationRecord = {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  createdAt: string;
  dueAt?: string;
  isFixed: boolean;
  requiresAction: boolean;
  actionLabel?: string;
  category?: Product["category"];
  entityType?: string;
  entityId?: string;
  status: NotificationStatus;
  receivedAt?: string;
  disabledAt?: string;
};

type NotificationSetting = {
  type: NotificationType;
  leadDays: number;
  durationDays: number;
};

type StockThresholdByProduct = {
  productId: string;
  minUnits: number;
};

type StockThresholdSettings = {
  categoryThresholds: Record<NonNullable<Product["category"]>, number>;
  productThresholds: StockThresholdByProduct[];
};

type PriceMarginByProduct = {
  productId: string;
  marginPercent: number;
};

type CategoryPriceMarginHistoryEntry = {
  id: string;
  category: NonNullable<Product["category"]>;
  previousMarginPercent: number;
  marginPercent: number;
  createdAt: string;
};

type ProductPriceMarginHistoryEntry = {
  id: string;
  productId: string;
  previousMarginPercent: number | null;
  marginPercent: number | null;
  createdAt: string;
};

type PriceMarginSettings = {
  categoryMargins: Record<NonNullable<Product["category"]>, number>;
  productMargins: PriceMarginByProduct[];
  categoryMarginHistory: CategoryPriceMarginHistoryEntry[];
  productMarginHistory: ProductPriceMarginHistoryEntry[];
};

type MockDb = {
  products: Product[];
  productPrices: ProductPrice[];
  ingredients: Ingredient[];
  menuProducts: MenuProduct[];
  users: AppUserRecord[];
  deleteRequests: DeleteRequest[];
  requests: OperationRequest[];
  stocks: StockEntry[];
  orders: Order[];
  invoices: Invoice[];
  workdays: Workday[];
  cashOpeningAssignments: CashOpeningAssignment[];
  supplyOrders: SupplyOrder[];
  expenses: Expense[];
  feedbackEntries: FeedbackEntry[];
  financialAccounts: FinancialAccount[];
  financialTransactions: FinancialTransaction[];
  licenses: LicenseRecord[];
  notifications: NotificationRecord[];
  notificationSettings: NotificationSetting[];
  stockThresholdSettings: StockThresholdSettings;
  priceMarginSettings: PriceMarginSettings;
  paymentMethodSettings: PaymentMethodSettings;
  taxSettings: TaxSettings;
};

type DataStoreRecord = {
  id: string;
  name: string;
  dbPath: string;
  imagesDir: string;
  receiptsDir: string;
  createdAt: string;
};

type DataStoresState = {
  activeStoreId: string;
  stores: DataStoreRecord[];
};

const defaultIngredientSeed: Ingredient[] = [
  {
    id: "ing-pan-hamburguesa",
    name: "Pan de hamburguesa",
    expiresInDays: 5,
    stockMode: "unit",
    stockQuantity: 48,
    createdAt: "2026-02-01T10:00:00.000Z",
  },
  {
    id: "ing-carne-medallon",
    name: "Medallon de carne",
    expiresInDays: 3,
    stockMode: "unit",
    stockQuantity: 80,
    createdAt: "2026-02-01T10:05:00.000Z",
  },
  {
    id: "ing-queso-feta",
    name: "Queso en feta",
    expiresInDays: 7,
    stockMode: "unit",
    stockQuantity: 120,
    createdAt: "2026-02-01T10:10:00.000Z",
  },
  {
    id: "ing-cebolla",
    name: "Cebolla",
    expiresInDays: 10,
    stockMode: "weight",
    stockQuantity: 3500,
    createdAt: "2026-02-01T10:15:00.000Z",
  },
  {
    id: "ing-lechuga",
    name: "Lechuga",
    expiresInDays: 4,
    stockMode: "weight",
    stockQuantity: 1800,
    createdAt: "2026-02-01T10:20:00.000Z",
  },
  {
    id: "ing-tomate",
    name: "Tomate",
    expiresInDays: 5,
    stockMode: "weight",
    stockQuantity: 4200,
    createdAt: "2026-02-01T10:25:00.000Z",
  },
  {
    id: "ing-pan-pancho",
    name: "Pan de pancho",
    expiresInDays: 5,
    stockMode: "unit",
    stockQuantity: 60,
    createdAt: "2026-02-01T10:30:00.000Z",
  },
  {
    id: "ing-salchicha",
    name: "Salchicha",
    expiresInDays: 6,
    stockMode: "unit",
    stockQuantity: 60,
    createdAt: "2026-02-01T10:35:00.000Z",
  },
  {
    id: "ing-milanesa",
    name: "Milanesa cocida",
    expiresInDays: 2,
    stockMode: "unit",
    stockQuantity: 30,
    createdAt: "2026-02-01T10:40:00.000Z",
  },
  {
    id: "ing-papa",
    name: "Papa",
    expiresInDays: 12,
    stockMode: "weight",
    stockQuantity: 9000,
    createdAt: "2026-02-01T10:45:00.000Z",
  },
];

const defaultMenuProductSeed: MenuProduct[] = [
  {
    id: "menu-hamburguesa-simple",
    name: "Hamburguesa simple",
    price: 4500,
    description: "Pan, carne, queso, lechuga y tomate.",
    category: "hamburguesa",
    recipeItems: [
      { ingredientId: "ing-pan-hamburguesa", ingredientName: "Pan de hamburguesa", quantity: 1, stockMode: "unit" },
      { ingredientId: "ing-carne-medallon", ingredientName: "Medallon de carne", quantity: 1, stockMode: "unit" },
      { ingredientId: "ing-queso-feta", ingredientName: "Queso en feta", quantity: 1, stockMode: "unit" },
      { ingredientId: "ing-lechuga", ingredientName: "Lechuga", quantity: 20, stockMode: "weight" },
      { ingredientId: "ing-tomate", ingredientName: "Tomate", quantity: 35, stockMode: "weight" },
    ],
    createdAt: "2026-02-01T11:00:00.000Z",
  },
  {
    id: "menu-hamburguesa-doble",
    name: "Hamburguesa doble",
    price: 6200,
    description: "Pan, doble carne, doble queso, cebolla, lechuga y tomate.",
    category: "hamburguesa",
    recipeItems: [
      { ingredientId: "ing-pan-hamburguesa", ingredientName: "Pan de hamburguesa", quantity: 1, stockMode: "unit" },
      { ingredientId: "ing-carne-medallon", ingredientName: "Medallon de carne", quantity: 2, stockMode: "unit" },
      { ingredientId: "ing-queso-feta", ingredientName: "Queso en feta", quantity: 2, stockMode: "unit" },
      { ingredientId: "ing-cebolla", ingredientName: "Cebolla", quantity: 20, stockMode: "weight" },
      { ingredientId: "ing-lechuga", ingredientName: "Lechuga", quantity: 20, stockMode: "weight" },
      { ingredientId: "ing-tomate", ingredientName: "Tomate", quantity: 35, stockMode: "weight" },
    ],
    createdAt: "2026-02-01T11:05:00.000Z",
  },
  {
    id: "menu-pancho",
    name: "Pancho",
    price: 2800,
    description: "Pan y salchicha.",
    category: "pancho",
    recipeItems: [
      { ingredientId: "ing-pan-pancho", ingredientName: "Pan de pancho", quantity: 1, stockMode: "unit" },
      { ingredientId: "ing-salchicha", ingredientName: "Salchicha", quantity: 1, stockMode: "unit" },
    ],
    createdAt: "2026-02-01T11:10:00.000Z",
  },
  {
    id: "menu-sandwich-milanesa",
    name: "Sandwich de milanesa",
    price: 5800,
    description: "Pan, milanesa, lechuga y tomate.",
    category: "pollo",
    recipeItems: [
      { ingredientId: "ing-pan-hamburguesa", ingredientName: "Pan de hamburguesa", quantity: 1, stockMode: "unit" },
      { ingredientId: "ing-milanesa", ingredientName: "Milanesa cocida", quantity: 1, stockMode: "unit" },
      { ingredientId: "ing-lechuga", ingredientName: "Lechuga", quantity: 25, stockMode: "weight" },
      { ingredientId: "ing-tomate", ingredientName: "Tomate", quantity: 40, stockMode: "weight" },
    ],
    createdAt: "2026-02-01T11:15:00.000Z",
  },
];

const defaultDb: MockDb = {
  products: [],
  productPrices: [],
  ingredients: defaultIngredientSeed,
  menuProducts: defaultMenuProductSeed,
  users: [],
  deleteRequests: [],
  requests: [],
  stocks: [],
  orders: [],
  invoices: [],
  workdays: [],
  cashOpeningAssignments: [],
  supplyOrders: [],
  expenses: [],
  feedbackEntries: [],
  financialAccounts: [],
  financialTransactions: [],
  licenses: [],
  notifications: [],
  notificationSettings: [],
  stockThresholdSettings: {
    categoryThresholds: {
      bebida: 10,
      hamburguesa: 10,
      pancho: 10,
      combos: 10,
      pollo: 10,
      vegano: 10,
    },
    productThresholds: [],
  },
  priceMarginSettings: {
    categoryMargins: {
      bebida: 30,
      hamburguesa: 30,
      pancho: 30,
      combos: 30,
      pollo: 30,
      vegano: 30,
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

const FINANCIAL_ACCOUNT_DEFINITIONS: Array<{
  id: string;
  code: string;
  name: string;
  kind: FinancialAccountKind;
  description: string;
}> = [
  {
    id: "account-cash-local",
    code: "cash-local",
    name: "Caja fisica local",
    kind: "asset",
    description: "Efectivo declarado en aperturas, ventas en efectivo, pagos y vueltos del local.",
  },
  {
    id: "account-gains",
    code: "gains",
    name: "Ganancias",
    kind: "income",
    description: "Ventas pagadas registradas por la plataforma.",
  },
  {
    id: "account-expenses",
    code: "expenses",
    name: "Gastos",
    kind: "expense",
    description: "Egresos confirmados por gastos y pagos de mercaderia.",
  },
  {
    id: "account-food-categories",
    code: "food-categories",
    name: "Categorias de comida",
    kind: "category",
    description: "Movimientos asociados a ventas agrupadas por categorias de comida.",
  },
];

const ORDER_PENDING_TIMEOUT_MINUTES = parsePendingTimeoutMinutes();
const ORDER_PENDING_TIMEOUT_MS = ORDER_PENDING_TIMEOUT_MINUTES * 60_000;
const ONE_DAY_MS = 86_400_000;
const notificationTypeDefaults: Record<NotificationType, NotificationSetting> = {
  "license-required": { type: "license-required", leadDays: 21, durationDays: 0 },
  "license-expiring": { type: "license-expiring", leadDays: 21, durationDays: 7 },
  "product-expiring": { type: "product-expiring", leadDays: 21, durationDays: 7 },
  "product-low-stock": { type: "product-low-stock", leadDays: 0, durationDays: 0 },
  "expense-created": { type: "expense-created", leadDays: 0, durationDays: 7 },
  "sale-created": { type: "sale-created", leadDays: 0, durationDays: 1 },
  "supply-requested": { type: "supply-requested", leadDays: 0, durationDays: 7 },
  "supply-approved": { type: "supply-approved", leadDays: 0, durationDays: 7 },
  "supply-received": { type: "supply-received", leadDays: 0, durationDays: 7 },
  "supply-pending-receive": { type: "supply-pending-receive", leadDays: 0, durationDays: 0 },
  "cash-opened": { type: "cash-opened", leadDays: 0, durationDays: 1 },
  "cash-closed": { type: "cash-closed", leadDays: 0, durationDays: 1 },
  cash: { type: "cash", leadDays: 0, durationDays: 7 },
  "user-created": { type: "user-created", leadDays: 0, durationDays: 7 },
  "user-updated": { type: "user-updated", leadDays: 0, durationDays: 7 },
  "user-deleted": { type: "user-deleted", leadDays: 0, durationDays: 7 },
  "price-changed": { type: "price-changed", leadDays: 0, durationDays: 7 },
  "product-created": { type: "product-created", leadDays: 0, durationDays: 7 },
  "stock-created": { type: "stock-created", leadDays: 0, durationDays: 7 },
  "operation-request-merchandise": { type: "operation-request-merchandise", leadDays: 0, durationDays: 7 },
  "operation-request-permissions": { type: "operation-request-permissions", leadDays: 0, durationDays: 7 },
  "operation-request-reviewed": { type: "operation-request-reviewed", leadDays: 0, durationDays: 7 },
  "manual-fixed": { type: "manual-fixed", leadDays: 0, durationDays: 0 },
  "manual-action": { type: "manual-action", leadDays: 0, durationDays: 7 },
  "manual-due": { type: "manual-due", leadDays: 0, durationDays: 7 },
};

function parsePendingTimeoutMinutes() {
  const fromVite = Math.trunc(Number(process.env.VITE_ORDER_PENDING_TIMEOUT_MINUTES));
  if (Number.isFinite(fromVite) && fromVite > 0) return fromVite;
  const fromGeneric = Math.trunc(Number(process.env.ORDER_PENDING_TIMEOUT_MINUTES));
  if (Number.isFinite(fromGeneric) && fromGeneric > 0) return fromGeneric;
  return 15;
}

function resolveDataRoot() {
  const configured = String(process.env.DATA_ROOT || "").trim();
  if (!configured) return null;
  return isAbsolute(configured) ? configured : resolve(PROJECT_ROOT, configured);
}

function resolveStoragePath(...segments: string[]) {
  return resolve(CONFIGURED_DATA_ROOT || PROJECT_ROOT, ...segments);
}

function parsePort(input: string | undefined, fallback: number) {
  const parsed = Math.trunc(Number(input));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveAllowedHosts() {
  const hosts = new Set<string>();
  const configured = String(process.env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS || "").trim();
  if (configured) {
    for (const value of configured.split(",")) {
      const host = value.trim();
      if (host) hosts.add(host);
    }
  }

  const railwayDomain = String(process.env.RAILWAY_PUBLIC_DOMAIN || "").trim();
  if (railwayDomain) {
    hosts.add(railwayDomain);
  }

  return [...hosts];
}

function resolveReceiptsDir() {
  const configured = String(process.env.VITE_RECEIPTS_DIR || process.env.RECEIPTS_DIR || "").trim();
  if (!configured) return resolveStoragePath("mock-api", "receipts");
  if (isAbsolute(configured)) return configured;
  return resolve(CONFIGURED_DATA_ROOT || PROJECT_ROOT, configured);
}

function normalizeDataStoreId(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function buildDefaultDataStoreRecord(createdAt = new Date().toISOString()): DataStoreRecord {
  return {
    id: DEFAULT_DATA_STORE_ID,
    name: "Base principal",
    dbPath: LEGACY_DB_PATH,
    imagesDir: LEGACY_IMAGE_DIR,
    receiptsDir: LEGACY_RECEIPTS_DIR,
    createdAt,
  };
}

function buildDataStorePaths(storeId: string) {
  const safeId = normalizeDataStoreId(storeId);
  return {
    dbPath: resolve(DATA_STORES_ROOT_DIR, safeId, "db.js"),
    imagesDir: resolve(DATA_STORES_IMAGES_ROOT_DIR, safeId),
    receiptsDir: resolve(DATA_STORES_RECEIPTS_ROOT_DIR, safeId),
  };
}

function resolveDataStoreSeedPaths(storeId: string) {
  const safeId = normalizeDataStoreId(storeId);
  if (!safeId || safeId === DEFAULT_DATA_STORE_ID) {
    return {
      dbPath: resolve(REPO_MOCK_API_DIR, "db.json"),
      imagesDir: REPO_IMAGES_DIR,
      receiptsDir: resolve(REPO_MOCK_API_DIR, "receipts"),
    };
  }
  return {
    dbPath: resolve(REPO_MOCK_API_DIR, "data-stores", safeId, "db.js"),
    imagesDir: resolve(REPO_IMAGES_DIR, safeId),
    receiptsDir: resolve(REPO_MOCK_API_DIR, "receipts", "stores", safeId),
  };
}

async function seedFileIfMissing(targetPath: string, seedPath: string) {
  if (existsSync(targetPath)) return true;
  if (!existsSync(seedPath) || resolve(targetPath) === resolve(seedPath)) return false;
  await mkdir(dirname(targetPath), { recursive: true });
  await cp(seedPath, targetPath, { force: false });
  return true;
}

async function ensureDirectoryWithOptionalSeed(targetDir: string, seedDir: string) {
  if (existsSync(targetDir)) return;
  if (existsSync(seedDir) && resolve(targetDir) !== resolve(seedDir)) {
    await mkdir(dirname(targetDir), { recursive: true });
    await cp(seedDir, targetDir, { recursive: true, force: false });
    return;
  }
  await mkdir(targetDir, { recursive: true });
}

function normalizeDataStoreRecord(input: unknown): DataStoreRecord | null {
  const obj = (input || {}) as {
    id?: unknown;
    name?: unknown;
    createdAt?: unknown;
  };
  const id = normalizeDataStoreId(obj.id);
  if (!id) return null;
  const createdAt = String(obj.createdAt || "").trim() || new Date().toISOString();
  if (id === DEFAULT_DATA_STORE_ID) {
    const base = buildDefaultDataStoreRecord(createdAt);
    const name = String(obj.name || "").trim();
    return {
      ...base,
      name: name || base.name,
    };
  }
  const name = String(obj.name || "").trim() || id;
  const paths = buildDataStorePaths(id);
  return {
    id,
    name,
    ...paths,
    createdAt,
  };
}

async function ensureDataStoresFile() {
  await mkdir(dirname(DATA_STORES_PATH), { recursive: true });
  if (!existsSync(DATA_STORES_PATH)) {
    if (await seedFileIfMissing(DATA_STORES_PATH, DATA_STORES_SEED_PATH)) {
      return;
    }
    const base = buildDefaultDataStoreRecord();
    const initial: DataStoresState = {
      activeStoreId: base.id,
      stores: [base],
    };
    await writeFile(DATA_STORES_PATH, JSON.stringify(initial, null, 2) + "\n", "utf8");
  }
}

async function readDataStoresState(): Promise<DataStoresState> {
  await ensureDataStoresFile();
  let parsed: Partial<DataStoresState> = {};
  try {
    parsed = JSON.parse(await readFile(DATA_STORES_PATH, "utf8")) as Partial<DataStoresState>;
  } catch {
    parsed = {};
  }

  const stores: DataStoreRecord[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(parsed.stores) ? parsed.stores : []) {
    const normalized = normalizeDataStoreRecord(raw);
    if (!normalized || seen.has(normalized.id)) continue;
    stores.push(normalized);
    seen.add(normalized.id);
  }

  if (!seen.has(DEFAULT_DATA_STORE_ID)) {
    const fallback = buildDefaultDataStoreRecord();
    stores.push(fallback);
    seen.add(fallback.id);
  }

  const activeStoreIdRaw = normalizeDataStoreId(parsed.activeStoreId);
  const activeStoreId = seen.has(activeStoreIdRaw) ? activeStoreIdRaw : stores[0].id;

  return { activeStoreId, stores };
}

async function writeDataStoresState(state: DataStoresState) {
  await mkdir(dirname(DATA_STORES_PATH), { recursive: true });
  await writeFile(DATA_STORES_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}

async function getActiveDataStore(): Promise<DataStoreRecord> {
  const state = await readDataStoresState();
  const active = state.stores.find((item) => item.id === state.activeStoreId);
  return active || state.stores[0] || buildDefaultDataStoreRecord();
}

async function ensureDataStoreDbFile(store: DataStoreRecord) {
  await mkdir(dirname(store.dbPath), { recursive: true });
  if (!existsSync(store.dbPath)) {
    const seedPaths = resolveDataStoreSeedPaths(store.id);
    if (await seedFileIfMissing(store.dbPath, seedPaths.dbPath)) {
      return;
    }
    await writeFile(store.dbPath, JSON.stringify(defaultDb, null, 2) + "\n", "utf8");
  }
}

async function ensureDataStoreMediaDirs(store: DataStoreRecord) {
  const seedPaths = resolveDataStoreSeedPaths(store.id);
  await ensureDirectoryWithOptionalSeed(store.imagesDir, seedPaths.imagesDir);
  await ensureDirectoryWithOptionalSeed(store.receiptsDir, seedPaths.receiptsDir);
}

function validateAdminCredentials(db: MockDb, requestedBy: string, adminPasswordHash: string) {
  if (!requestedBy || requestedBy.trim().toLowerCase() !== "admin") {
    return { ok: false as const, status: 403, message: "Solo admin puede ejecutar esta accion." };
  }
  if (!adminPasswordHash || !/^[0-9a-f]{32}$/i.test(adminPasswordHash)) {
    return { ok: false as const, status: 400, message: "Clave admin invalida." };
  }
  const adminUser = db.users.find((item) => item.username.trim().toLowerCase() === "admin");
  if (!adminUser) {
    return { ok: false as const, status: 404, message: "Usuario admin no encontrado." };
  }
  if (adminUser.password.trim().toLowerCase() !== adminPasswordHash.trim().toLowerCase()) {
    return { ok: false as const, status: 401, message: "Clave admin invalida." };
  }
  return { ok: true as const };
}

function resolveAppUserRole(user: Pick<AppUserRecord, "username" | "role"> | null | undefined): AppUserRole {
  if (!user) return "operator";
  if (user.role === "admin" || user.role === "operator" || user.role === "terminal") return user.role;
  const normalizedUsername = String(user.username || "").trim().toLowerCase();
  if (normalizedUsername === "admin") return "admin";
  if (normalizedUsername === "terminal") return "terminal";
  return "operator";
}

function findUserByUsername(db: MockDb, username: string): AppUserRecord | undefined {
  const normalizedUsername = String(username || "").trim().toLowerCase();
  if (!normalizedUsername) return undefined;
  return db.users.find((item) => item.username.trim().toLowerCase() === normalizedUsername);
}

function isProductCategoryValue(value: string): value is NonNullable<Product["category"]> {
  return (
    value === "bebida" ||
    value === "hamburguesa" ||
    value === "pancho" ||
    value === "combos" ||
    value === "pollo" ||
    value === "vegano"
  );
}

function normalizeOperationRequestItems(items: unknown, products: Product[]): OperationRequestItem[] {
  if (!Array.isArray(items)) return [];

  const itemsByProductId = new Map<string, OperationRequestItem>();

  for (const rawItem of items) {
    const draft = rawItem as {
      productId?: unknown;
      productName?: unknown;
      quantity?: unknown;
      barcode?: unknown;
      brand?: unknown;
      category?: unknown;
    };
    const productId = String(draft.productId || "").trim();
    const quantity = Math.max(0, Math.trunc(Number(draft.quantity || 0)));
    if (!productId || quantity <= 0) continue;

    const existing = itemsByProductId.get(productId);
    const product = products.find((entry) => entry.id === productId);
    const rawCategory = String(draft.category || "").trim().toLowerCase();
    const category = product?.category || (isProductCategoryValue(rawCategory) ? rawCategory : existing?.category);

    itemsByProductId.set(productId, {
      productId,
      productName: product?.name || String(draft.productName || "").trim() || existing?.productName || productId,
      quantity: quantity + (existing?.quantity || 0),
      barcode: product?.barcode || String(draft.barcode || "").trim() || existing?.barcode || undefined,
      brand: product?.brand || String(draft.brand || "").trim() || existing?.brand || undefined,
      category,
    });
  }

  return [...itemsByProductId.values()];
}

function mapDataStoreForApi(store: DataStoreRecord) {
  return {
    id: store.id,
    name: store.name,
    dbPath: store.dbPath,
    imagesDir: store.imagesDir,
    receiptsDir: store.receiptsDir,
    createdAt: store.createdAt,
  };
}

function padIdPart(value: number): string {
  return String(value).padStart(2, "0");
}

function formatIdDatePart(input: Date): string {
  return `${padIdPart(input.getDate())}${padIdPart(input.getMonth() + 1)}${input.getFullYear()}${padIdPart(input.getHours())}${padIdPart(input.getMinutes())}${padIdPart(input.getSeconds())}`;
}

function buildEntityId(prefix: string, inputDate = new Date()): string {
  const suffix = Math.floor(Math.random() * 10_000).toString().padStart(4, "0");
  return `${prefix}${formatIdDatePart(inputDate)}${suffix}`;
}

function isBrowserNavigation(req: IncomingMessage): boolean {
  const mode = String(req.headers["sec-fetch-mode"] || "").trim().toLowerCase();
  const accept = String(req.headers.accept || "").trim().toLowerCase();
  return mode === "navigate" || accept.includes("text/html");
}

function mockDbPlugin(): Plugin {
  return {
    name: "mock-db-middleware",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const method = req.method || "GET";
          const url = new URL(req.url || "/", "http://localhost");
          const pathname = url.pathname;

          if (pathname === "/admin/data/stores" && method === "GET") {
            const state = await readDataStoresState();
            return sendJson(res, 200, {
              activeStoreId: state.activeStoreId,
              stores: state.stores.map((item) => mapDataStoreForApi(item)),
            });
          }

          if (pathname === "/admin/data/stores" && method === "POST") {
            const activeDb = await readDb();
            const draft = sanitizeAdminDataStoreCreateDraft(await readJsonBody(req));
            const credential = validateAdminCredentials(activeDb, draft.requestedBy, draft.adminPasswordHash);
            if (!credential.ok) {
              return sendJson(res, credential.status, { message: credential.message });
            }
            const nextStoreId = normalizeDataStoreId(draft.storeId || draft.name);
            if (!nextStoreId || nextStoreId === DEFAULT_DATA_STORE_ID) {
              return sendJson(res, 400, { message: "Debes indicar un identificador valido para la nueva base." });
            }
            const state = await readDataStoresState();
            if (state.stores.some((item) => item.id === nextStoreId)) {
              return sendJson(res, 409, { message: "Ya existe una base con ese identificador." });
            }
            const createdAt = new Date().toISOString();
            const newStore: DataStoreRecord = {
              id: nextStoreId,
              name: draft.name || nextStoreId,
              ...buildDataStorePaths(nextStoreId),
              createdAt,
            };
            await ensureDataStoreDbFile(newStore);
            await writeDb(buildClearedOperationalDb(activeDb), newStore);
            await ensureDataStoreMediaDirs(newStore);
            state.stores.push(newStore);
            await writeDataStoresState(state);
            return sendJson(res, 201, {
              ok: true,
              message: "Nueva base creada correctamente.",
              activeStoreId: state.activeStoreId,
              store: mapDataStoreForApi(newStore),
            });
          }

          if (pathname === "/admin/data/stores/active" && method === "PUT") {
            const activeDb = await readDb();
            const draft = sanitizeAdminDataStoreSwitchDraft(await readJsonBody(req));
            const credential = validateAdminCredentials(activeDb, draft.requestedBy, draft.adminPasswordHash);
            if (!credential.ok) {
              return sendJson(res, credential.status, { message: credential.message });
            }
            const targetStoreId = normalizeDataStoreId(draft.storeId);
            if (!targetStoreId) {
              return sendJson(res, 400, { message: "Base destino invalida." });
            }
            const state = await readDataStoresState();
            const targetStore = state.stores.find((item) => item.id === targetStoreId);
            if (!targetStore) {
              return sendJson(res, 404, { message: "Base no encontrada." });
            }
            await ensureDataStoreDbFile(targetStore);
            await ensureDataStoreMediaDirs(targetStore);
            state.activeStoreId = targetStore.id;
            await writeDataStoresState(state);
            return sendJson(res, 200, {
              ok: true,
              message: `Base activa cambiada a ${targetStore.name}.`,
              activeStoreId: targetStore.id,
              store: mapDataStoreForApi(targetStore),
            });
          }

          if (pathname === "/admin/data/stores/backup" && method === "POST") {
            const activeDb = await readDb();
            const draft = sanitizeAdminDataStoreSwitchDraft(await readJsonBody(req));
            const credential = validateAdminCredentials(activeDb, draft.requestedBy, draft.adminPasswordHash);
            if (!credential.ok) {
              return sendJson(res, credential.status, { message: credential.message });
            }
            const targetStoreId = normalizeDataStoreId(draft.storeId);
            if (!targetStoreId) {
              return sendJson(res, 400, { message: "Base destino invalida." });
            }
            const state = await readDataStoresState();
            const targetStore = state.stores.find((item) => item.id === targetStoreId);
            if (!targetStore) {
              return sendJson(res, 404, { message: "Base no encontrada." });
            }
            await ensureDataStoreDbFile(targetStore);
            const content = await readFile(targetStore.dbPath, "utf8");
            return sendTextDownload(res, buildDataStoreBackupFileName(targetStore), content);
          }

          if (pathname === "/admin/data/reset" && method === "POST") {
            const db = await readDb();
            const draft = sanitizeAdminDataResetDraft(await readJsonBody(req));
            const credential = validateAdminCredentials(db, draft.requestedBy, draft.adminPasswordHash);
            if (!credential.ok) {
              return sendJson(res, credential.status, { message: credential.message });
            }
            const clearedDb = buildClearedOperationalDb(db);
            await writeDb(clearedDb);
            const activeStore = await getActiveDataStore();
            return sendJson(res, 200, {
              ok: true,
              clearedAt: new Date().toISOString(),
              activeStoreId: activeStore.id,
              message: "Base de datos limpiada correctamente.",
            });
          }

          if (pathname === "/products" && method === "GET") {
            const db = await readDb();
            return sendJson(res, 200, enrichProductsWithStocks(db.products, db.stocks));
          }

          if (pathname === "/products" && method === "POST") {
            const db = await readDb();
            const draft = sanitizeDraft(await readJsonBody(req));
            const hasPrice = Number.isFinite(draft.price) && draft.price > 0;
            const hasCostPrice = Number.isFinite(draft.costPrice) && draft.costPrice > 0;
            if (!draft.name || (!hasPrice && !hasCostPrice)) {
              return sendJson(res, 400, { message: "Invalid product draft" });
            }
            if (draft.barcode) {
              const duplicate = findProductByBarcode(db, draft.barcode);
              if (duplicate) {
                return sendJson(res, 409, { message: `Barcode already exists: ${duplicate.name}` });
              }
            }
            const category = draft.category || "bebida";
            const effectiveMarginPercent =
              Number.isFinite(draft.marginPercent) && draft.marginPercent >= 0
                ? normalizeMarginPercent(draft.marginPercent)
                : getCategoryPriceMarginPercent(db, category);
            const costPrice = Math.max(1, Math.trunc(hasCostPrice ? draft.costPrice : draft.price));
            const salePrice = Math.max(1, Math.trunc(hasCostPrice ? calculateSalePriceFromCost(costPrice, effectiveMarginPercent) : draft.price));
            const now = new Date().toISOString();
            const product: Product = {
              id: buildEntityId("p"),
              name: draft.name,
              price: salePrice,
              costPrice,
              createdAt: now,
              imageUrl: draft.imageUrl,
              barcode: draft.barcode,
              brand: draft.brand,
              category,
              supplyOrderId: draft.supplyOrderId,
            };
            db.products.unshift(product);
            const productPrice: ProductPrice = {
              id: buildEntityId("pp"),
              productId: product.id,
              newPrice: product.price,
              costPrice: product.costPrice,
              marginPercent: computeMarginPercentFromPrices(product.costPrice, product.price),
              createdAt: now,
            };
            db.productPrices.unshift(productPrice);
            createDurationNotification(db, {
              type: "product-created",
              title: `Nuevo producto: ${product.name}`,
              description: `Se registro el producto ${product.name}.`,
              createdAt: now,
              category: product.category,
              entityType: "product",
              entityId: product.id,
            });
            syncLowStockNotificationForProduct(db, product.id);
            await writeDb(db);
            return sendJson(res, 201, product);
          }

          if (pathname === "/users" && method === "GET") {
            const db = await readDb();
            return sendJson(res, 200, db.users);
          }

          if (pathname === "/users" && method === "POST") {
            const db = await readDb();
            const draft = sanitizeUserDraft(await readJsonBody(req));
            if (
              !draft.name ||
              !draft.email ||
              !draft.username ||
              !draft.password ||
              draft.password.length !== 32 ||
              !/^[0-9a-f]{32}$/i.test(draft.password) ||
              !draft.startHour ||
              !draft.endHour
            ) {
              return sendJson(res, 400, { message: "Invalid user draft" });
            }
            const exists = db.users.some((item) => item.username.toLowerCase() === draft.username.toLowerCase());
            if (exists) {
              return sendJson(res, 409, { message: "Username already exists" });
            }
            const now = new Date().toISOString();
            const user: AppUserRecord = {
              id: buildEntityId("u"),
              name: draft.name,
              email: draft.email,
              username: draft.username,
              role: draft.role || resolveAppUserRole({ username: draft.username }),
              password: draft.password,
              createdAt: now,
              updatedAt: now,
              startHour: draft.startHour,
              endHour: draft.endHour,
            };
            db.users.unshift(user);
            createDurationNotification(db, {
              type: "user-created",
              title: `Usuario creado: ${user.username}`,
              description: `Se creo el usuario ${user.username}.`,
              entityType: "user",
              entityId: user.id,
            });
            await writeDb(db);
            return sendJson(res, 201, user);
          }

          const userEntityId = extractUserId(pathname);
          if (userEntityId && method === "PUT") {
            const db = await readDb();
            const draft = sanitizeUserUpdateDraft(await readJsonBody(req));
            if (!draft.name || !draft.email || !draft.username || !draft.startHour || !draft.endHour) {
              return sendJson(res, 400, { message: "Invalid user update draft" });
            }
            const index = db.users.findIndex((item) => item.id === userEntityId);
            if (index < 0) {
              return sendJson(res, 404, { message: "User not found" });
            }
            const duplicate = db.users.some((item) => item.id !== userEntityId && item.username.toLowerCase() === draft.username.toLowerCase());
            if (duplicate) {
              return sendJson(res, 409, { message: "Username already exists" });
            }
            const now = new Date().toISOString();
            db.users[index] = {
              ...db.users[index],
              name: draft.name,
              email: draft.email,
              username: draft.username,
              role: draft.role || db.users[index].role || resolveAppUserRole({ username: draft.username }),
              startHour: draft.startHour,
              endHour: draft.endHour,
              updatedAt: now,
              password: draft.password && draft.password.length === 32 ? draft.password : db.users[index].password,
            };
            createDurationNotification(db, {
              type: "user-updated",
              title: `Usuario modificado: ${db.users[index].username}`,
              description: `Se modifico el usuario ${db.users[index].username}.`,
              createdAt: now,
              entityType: "user",
              entityId: db.users[index].id,
            });
            await writeDb(db);
            return sendJson(res, 200, db.users[index]);
          }

          if (userEntityId && method === "DELETE") {
            const db = await readDb();
            const index = db.users.findIndex((item) => item.id === userEntityId);
            if (index < 0) {
              return sendJson(res, 404, { message: "User not found" });
            }
            const removed = db.users[index];
            db.users.splice(index, 1);
            createDurationNotification(db, {
              type: "user-deleted",
              title: `Usuario eliminado: ${removed.username}`,
              description: `Se elimino el usuario ${removed.username}.`,
              entityType: "user",
              entityId: removed.id,
            });
            await writeDb(db);
            return sendJson(res, 200, { ok: true, id: removed.id });
          }

          if (pathname === "/product-prices" && method === "GET") {
            const db = await readDb();
            return sendJson(res, 200, db.productPrices);
          }

          if (pathname === "/product-prices" && method === "POST") {
            const db = await readDb();
            const draft = sanitizeProductPriceDraft(await readJsonBody(req));
            if (!draft.productId || !Number.isFinite(draft.newPrice) || draft.newPrice <= 0) {
              return sendJson(res, 400, { message: "Invalid product price draft" });
            }

            const productIndex = db.products.findIndex((item) => item.id === draft.productId);
            if (productIndex < 0) {
              return sendJson(res, 404, { message: "Product not found" });
            }

            const now = new Date().toISOString();
            const nextPrice = Math.trunc(draft.newPrice);
            const product = db.products[productIndex];
            const marginPercent =
              Number.isFinite(draft.marginPercent) && draft.marginPercent >= 0
                ? normalizeMarginPercent(draft.marginPercent)
                : getEffectiveProductPriceMarginPercent(db, product.id, product.category);
            const fallbackCostPrice =
              Number.isFinite(Number(product.costPrice)) && Number(product.costPrice) > 0
                ? Math.trunc(Number(product.costPrice))
                : inferCostPriceFromSalePrice(nextPrice, marginPercent);
            const nextCostPrice =
              Number.isFinite(draft.costPrice) && draft.costPrice > 0 ? Math.trunc(draft.costPrice) : fallbackCostPrice;
            db.products[productIndex] = {
              ...product,
              price: nextPrice,
              costPrice: nextCostPrice,
            };

            const productPrice: ProductPrice = {
              id: buildEntityId("pp"),
              productId: draft.productId,
              newPrice: nextPrice,
              costPrice: nextCostPrice,
              marginPercent: computeMarginPercentFromPrices(nextCostPrice, nextPrice),
              createdAt: now,
            };
            db.productPrices.unshift(productPrice);
            createDurationNotification(db, {
              type: "price-changed",
              title: `Precio actualizado: ${db.products[productIndex].name}`,
              description: `Nuevo precio para ${db.products[productIndex].name}: ${nextPrice} (coste ${nextCostPrice}).`,
              createdAt: now,
              category: db.products[productIndex].category,
              entityType: "product",
              entityId: db.products[productIndex].id,
            });
            await writeDb(db);
            return sendJson(res, 201, productPrice);
          }

          const productId = extractProductId(pathname);
          if (productId && method === "PUT") {
            const db = await readDb();
            const draft = sanitizeDraft(await readJsonBody(req));
            if (!draft.name) {
              return sendJson(res, 400, { message: "Invalid product draft" });
            }
            const index = db.products.findIndex((item) => item.id === productId);
            if (index < 0) {
              return sendJson(res, 404, { message: "Product not found" });
            }
            const current = db.products[index];
            if (draft.barcode) {
              const duplicate = findProductByBarcode(db, draft.barcode, productId);
              if (duplicate) {
                return sendJson(res, 409, { message: `Barcode already exists: ${duplicate.name}` });
              }
            }
            const category = draft.category || current.category || "bebida";
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
              brand: draft.brand,
              category,
              supplyOrderId: typeof draft.supplyOrderId === "string" ? draft.supplyOrderId : current.supplyOrderId,
            };
            await writeDb(db);
            return sendJson(res, 200, db.products[index]);
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
              markNotificationAsReceived(db, "product", productId);
              await writeDb(db);
            }
            return sendJson(res, 200, { ok: removed });
          }

          if (pathname === "/ingredients" && method === "GET") {
            if (isBrowserNavigation(req)) return next();
            const db = await readDb();
            return sendJson(res, 200, db.ingredients);
          }

          if (pathname === "/ingredients" && method === "POST") {
            const db = await readDb();
            const draft = sanitizeIngredientDraft(await readJsonBody(req));
            if (!draft.name) {
              return sendJson(res, 400, { message: "Invalid ingredient draft" });
            }
            const now = new Date();
            const ingredient: Ingredient = {
              id: buildEntityId("ing"),
              name: draft.name,
              expiresInDays: draft.expiresInDays,
              stockMode: draft.stockMode,
              stockQuantity: draft.stockQuantity + draft.entryQuantity,
              createdAt: now.toISOString(),
              lastEntryAt: draft.entryQuantity > 0 ? now.toISOString() : undefined,
              nextExpirationDate: draft.entryQuantity > 0 ? buildIngredientExpirationDate(draft.expiresInDays, now) : undefined,
            };
            db.ingredients.unshift(ingredient);
            await writeDb(db);
            return sendJson(res, 201, ingredient);
          }

          const ingredientId = extractIngredientId(pathname);
          if (ingredientId && method === "PUT") {
            const db = await readDb();
            const draft = sanitizeIngredientDraft(await readJsonBody(req));
            if (!draft.name) {
              return sendJson(res, 400, { message: "Invalid ingredient draft" });
            }
            const index = db.ingredients.findIndex((item) => item.id === ingredientId);
            if (index < 0) {
              return sendJson(res, 404, { message: "Ingredient not found" });
            }
            const now = new Date();
            db.ingredients[index] = {
              ...db.ingredients[index],
              name: draft.name,
              expiresInDays: draft.expiresInDays,
              stockMode: draft.stockMode,
              stockQuantity: draft.stockQuantity + draft.entryQuantity,
              updatedAt: now.toISOString(),
              lastEntryAt: draft.entryQuantity > 0 ? now.toISOString() : db.ingredients[index].lastEntryAt,
              nextExpirationDate:
                draft.entryQuantity > 0
                  ? buildIngredientExpirationDate(draft.expiresInDays, now)
                  : db.ingredients[index].nextExpirationDate,
            };
            db.menuProducts = db.menuProducts.map((menuProduct) => ({
              ...menuProduct,
              recipeItems: menuProduct.recipeItems.map((item) =>
                item.ingredientId === ingredientId
                  ? {
                      ...item,
                      ingredientName: db.ingredients[index].name,
                      stockMode: db.ingredients[index].stockMode,
                    }
                  : item,
              ),
            }));
            await writeDb(db);
            return sendJson(res, 200, db.ingredients[index]);
          }

          if (ingredientId && method === "DELETE") {
            const db = await readDb();
            const before = db.ingredients.length;
            db.ingredients = db.ingredients.filter((item) => item.id !== ingredientId);
            const removed = db.ingredients.length !== before;
            if (removed) {
              db.menuProducts = db.menuProducts.map((menuProduct) => ({
                ...menuProduct,
                recipeItems: menuProduct.recipeItems.filter((item) => item.ingredientId !== ingredientId),
              }));
              await writeDb(db);
            }
            return sendJson(res, 200, { ok: removed });
          }

          if (pathname === "/menu-products" && method === "GET") {
            if (isBrowserNavigation(req)) return next();
            const db = await readDb();
            return sendJson(res, 200, db.menuProducts);
          }

          if (pathname === "/menu-products" && method === "POST") {
            const db = await readDb();
            const draft = sanitizeMenuProductDraft(await readJsonBody(req), db.ingredients);
            if (!draft.name || draft.price <= 0 || draft.recipeItems.length === 0) {
              return sendJson(res, 400, { message: "Invalid menu product draft" });
            }
            const menuProduct: MenuProduct = {
              id: buildEntityId("menu"),
              name: draft.name,
              price: draft.price,
              description: draft.description,
              imageUrl: draft.imageUrl,
              category: draft.category,
              recipeItems: draft.recipeItems,
              createdAt: new Date().toISOString(),
            };
            db.menuProducts.unshift(menuProduct);
            await writeDb(db);
            return sendJson(res, 201, menuProduct);
          }

          const menuProductId = extractMenuProductId(pathname);
          if (menuProductId && method === "PUT") {
            const db = await readDb();
            const draft = sanitizeMenuProductDraft(await readJsonBody(req), db.ingredients);
            if (!draft.name || draft.price <= 0 || draft.recipeItems.length === 0) {
              return sendJson(res, 400, { message: "Invalid menu product draft" });
            }
            const index = db.menuProducts.findIndex((item) => item.id === menuProductId);
            if (index < 0) {
              return sendJson(res, 404, { message: "Menu product not found" });
            }
            db.menuProducts[index] = {
              ...db.menuProducts[index],
              name: draft.name,
              price: draft.price,
              description: draft.description,
              imageUrl: draft.imageUrl,
              category: draft.category,
              recipeItems: draft.recipeItems,
              updatedAt: new Date().toISOString(),
            };
            await writeDb(db);
            return sendJson(res, 200, db.menuProducts[index]);
          }

          if (menuProductId && method === "DELETE") {
            const db = await readDb();
            const before = db.menuProducts.length;
            db.menuProducts = db.menuProducts.filter((item) => item.id !== menuProductId);
            const removed = db.menuProducts.length !== before;
            if (removed) await writeDb(db);
            return sendJson(res, 200, { ok: removed });
          }

          if (pathname === "/delete-requests" && method === "GET") {
            const db = await readDb();
            return sendJson(res, 200, db.deleteRequests);
          }

          if (pathname === "/delete-requests" && method === "POST") {
            const db = await readDb();
            const body = sanitizeDeleteRequestDraft(await readJsonBody(req));
            if (!body.title) {
              return sendJson(res, 400, { message: "Request title is required" });
            }

            const request: DeleteRequest = {
              id: buildEntityId("dr"),
              requestType: body.requestType,
              title: body.title,
              description: body.description,
              productId: body.productId,
              productName: body.productName,
              requestedBy: body.requestedBy || "operator",
              requestedAt: new Date().toISOString(),
              status: "pending",
            };
            db.deleteRequests.unshift(request);
            await writeDb(db);
            return sendJson(res, 201, request);
          }

          const deleteRequestId = extractDeleteRequestId(pathname);
          if (deleteRequestId && method === "PUT") {
            const db = await readDb();
            const body = sanitizeDeleteRequestStatusDraft(await readJsonBody(req));
            if (!body.status) {
              return sendJson(res, 400, { message: "Status is required" });
            }

            const index = db.deleteRequests.findIndex((item) => item.id === deleteRequestId);
            if (index < 0) {
              return sendJson(res, 404, { message: "Request not found" });
            }

            const current = db.deleteRequests[index];
            if (current.status !== "pending") {
              return sendJson(res, 409, { message: "Request is already resolved" });
            }

            db.deleteRequests[index] = {
              ...current,
              status: body.status,
              reviewedBy: body.reviewedBy || "admin",
              reviewedAt: new Date().toISOString(),
            };

            await writeDb(db);
            return sendJson(res, 200, db.deleteRequests[index]);
          }

          if (pathname === "/operation-requests" && method === "GET") {
            const db = await readDb();
            return sendJson(res, 200, db.requests);
          }

          if (pathname === "/operation-requests" && method === "POST") {
            const db = await readDb();
            const body = sanitizeOperationRequestDraft(await readJsonBody(req));
            const requestItems =
              body.requestType === "merchandise" ? normalizeOperationRequestItems(body.items || [], db.products) : [];
            if (!body.description) {
              return sendJson(res, 400, { message: "Request description is required" });
            }
            if (body.requestType === "merchandise" && requestItems.length === 0) {
              return sendJson(res, 400, { message: "Merchandise request items are required" });
            }

            const request: OperationRequest = {
              id: buildEntityId("rq"),
              requestType: body.requestType,
              description: body.description,
              items: requestItems,
              requestedBy: body.requestedBy || "operator",
              requestedAt: new Date().toISOString(),
              status: "pending",
            };
            db.requests.unshift(request);
            if (request.requestType === "merchandise") {
              createDurationNotification(db, {
                type: "operation-request-merchandise",
                title: `Solicitud de mercancia: ${request.requestedBy}`,
                description: request.description,
                createdAt: request.requestedAt,
                requiresAction: true,
                actionLabel: "Revisar solicitud",
                entityType: "operation-request",
                entityId: request.id,
              });
            } else {
              createDurationNotification(db, {
                type: "operation-request-permissions",
                title: `Solicitud de permiso: ${request.requestedBy}`,
                description: request.description,
                createdAt: request.requestedAt,
                requiresAction: true,
                actionLabel: "Revisar solicitud",
                entityType: "operation-request",
                entityId: request.id,
              });
            }
            await writeDb(db);
            return sendJson(res, 201, request);
          }

          const operationRequestEntityId = extractOperationRequestEntityId(pathname);
          if (operationRequestEntityId && method === "PUT") {
            const db = await readDb();
            const body = sanitizeOperationRequestUpdateDraft(await readJsonBody(req));
            const requestItems =
              body.requestType === "merchandise" ? normalizeOperationRequestItems(body.items || [], db.products) : [];
            if (!body.description) {
              return sendJson(res, 400, { message: "Request description is required" });
            }

            const index = db.requests.findIndex((item) => item.id === operationRequestEntityId);
            if (index < 0) {
              return sendJson(res, 404, { message: "Request not found" });
            }

            const current = db.requests[index];
            if (current.status !== "pending") {
              return sendJson(res, 409, { message: "Only pending requests can be updated" });
            }
            if (body.requestType === "merchandise" && requestItems.length === 0) {
              return sendJson(res, 400, { message: "Merchandise request items are required" });
            }

            db.requests[index] = {
              ...current,
              requestType: body.requestType,
              description: body.description,
              items: requestItems,
            };

            await writeDb(db);
            return sendJson(res, 200, db.requests[index]);
          }

          if (operationRequestEntityId && method === "DELETE") {
            const db = await readDb();
            const index = db.requests.findIndex((item) => item.id === operationRequestEntityId);
            if (index < 0) {
              return sendJson(res, 404, { message: "Request not found" });
            }
            const current = db.requests[index];
            if (current.status !== "pending") {
              return sendJson(res, 409, { message: "Only pending requests can be cancelled" });
            }
            db.requests.splice(index, 1);
            await writeDb(db);
            return sendJson(res, 200, { ok: true, id: operationRequestEntityId });
          }

          const operationRequestStatusId = extractOperationRequestStatusId(pathname);
          if (operationRequestStatusId && method === "PUT") {
            const db = await readDb();
            const body = sanitizeOperationRequestStatusDraft(await readJsonBody(req));
            if (!body.status) {
              return sendJson(res, 400, { message: "Status is required" });
            }

            const index = db.requests.findIndex((item) => item.id === operationRequestStatusId);
            if (index < 0) {
              return sendJson(res, 404, { message: "Request not found" });
            }

            const current = db.requests[index];
            if (current.status !== "pending") {
              return sendJson(res, 409, { message: "Request is already resolved" });
            }
            const nextItems =
              current.requestType === "merchandise" || body.items
                ? normalizeOperationRequestItems(body.items ?? current.items ?? [], db.products)
                : [];

            db.requests[index] = {
              ...current,
              status: body.status,
              reviewedBy: body.reviewedBy || "admin",
              reviewedAt: new Date().toISOString(),
              items: nextItems,
              supplyOrderId: body.supplyOrderId || current.supplyOrderId,
              supplierMessage: body.supplierMessage || current.supplierMessage,
              reviewComment: body.reviewComment || current.reviewComment,
            };
            markNotificationAsReceived(db, "operation-request", current.id);
            createDurationNotification(db, {
              type: "operation-request-reviewed",
              title: `Solicitud revisada: ${current.requestedBy}`,
              description: `La solicitud ${current.id} fue ${body.status === "approved" ? "aprobada" : "rechazada"}.`,
              createdAt: db.requests[index].reviewedAt,
              entityType: "operation-request",
              entityId: current.id,
            });
            if (body.status === "approved" && db.requests[index].supplyOrderId) {
              createDurationNotification(db, {
                type: "supply-approved",
                title: `Solicitud de mercancia aprobada`,
                description: `La solicitud ${current.id} fue aprobada y genero pedido ${db.requests[index].supplyOrderId}.`,
                createdAt: db.requests[index].reviewedAt,
                entityType: "operation-request",
                entityId: current.id,
              });
            }

            await writeDb(db);
            return sendJson(res, 200, db.requests[index]);
          }

          if (pathname === "/stocks" && method === "GET") {
            const db = await readDb();
            return sendJson(res, 200, db.stocks);
          }

          if (pathname === "/stocks" && method === "POST") {
            const db = await readDb();
            const body = sanitizeStockEntryDraft(await readJsonBody(req));
            try {
              const entry = createStockEntryRecord(db, body);
              await writeDb(db);
              return sendJson(res, 201, entry);
            } catch (error) {
              return sendJson(res, 400, { message: error instanceof Error ? error.message : "Invalid stock entry" });
            }
          }

          if (pathname === "/expenses" && method === "GET") {
            const db = await readDb();
            return sendJson(res, 200, db.expenses);
          }

          if (pathname === "/feedback" && method === "GET") {
            const db = await readDb();
            return sendJson(
              res,
              200,
              [...db.feedbackEntries].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
            );
          }

          if (pathname === "/feedback" && method === "POST") {
            const db = await readDb();
            const draft = sanitizeFeedbackDraft(await readJsonBody(req));
            if (!draft.message || !draft.type || !draft.createdBy || !draft.createdByRole) {
              return sendJson(res, 400, { message: "Invalid feedback draft" });
            }

            const entry: FeedbackEntry = {
              id: buildEntityId("fb"),
              type: draft.type,
              message: draft.message,
              isAnonymous: draft.isAnonymous,
              createdAt: new Date().toISOString(),
              createdBy: draft.createdBy,
              createdByRole: draft.createdByRole,
            };

            db.feedbackEntries.unshift(entry);
            await writeDb(db);
            return sendJson(res, 201, entry);
          }

          if (pathname === "/expenses" && method === "POST") {
            const db = await readDb();
            const draft = sanitizeExpenseDraft(await readJsonBody(req));
            if (
              !draft.description ||
              !Number.isFinite(draft.amount) ||
              draft.amount <= 0 ||
              !draft.expenseType
            ) {
              return sendJson(res, 400, { message: "Invalid expense draft" });
            }

            const expense: Expense = {
              id: buildEntityId("ex"),
              description: draft.description,
              amount: Math.trunc(draft.amount),
              assignedAmount: Math.trunc(draft.amount),
              expenseType: draft.expenseType,
              invoiceImageUrl: draft.invoiceImageUrl,
              unexpectedImageUrl: draft.unexpectedImageUrl,
              createdBy: draft.createdBy || "operator",
              createdAt: new Date().toISOString(),
              status: "pending-confirmation",
            };
            db.expenses.unshift(expense);
            createDurationNotification(db, {
              type: "expense-created",
              title: `Gasto registrado: ${expense.createdBy}`,
              description: `${expense.description} (${expense.assignedAmount}).`,
              createdAt: expense.createdAt,
              entityType: "expense",
              entityId: expense.id,
            });
            await writeDb(db);
            return sendJson(res, 201, expense);
          }

          const expenseConfirmId = extractExpenseConfirmId(pathname);
          if (expenseConfirmId && method === "PUT") {
            const db = await readDb();
            const body = sanitizeExpenseConfirmDraft(await readJsonBody(req));
            const index = db.expenses.findIndex((item) => item.id === expenseConfirmId);
            if (index < 0) {
              return sendJson(res, 404, { message: "Expense not found" });
            }

            const current = db.expenses[index];
            if (current.status === "confirmed") {
              return sendJson(res, 409, { message: "Expense already confirmed" });
            }

            if (!body.amountMode) {
              return sendJson(res, 400, { message: "Amount mode is required" });
            }

            const confirmedAmount =
              body.amountMode === "different" ? Math.trunc(Number(body.confirmedAmount)) : Math.trunc(Number(current.assignedAmount));

            if (!Number.isFinite(confirmedAmount) || confirmedAmount <= 0) {
              return sendJson(res, 400, { message: "Confirmed amount must be a positive number" });
            }
            if (body.amountMode === "different" && confirmedAmount === current.assignedAmount) {
              return sendJson(res, 400, { message: "Different amount must actually change the assigned amount" });
            }
            if (body.amountMode === "different" && !body.confirmationComment) {
              return sendJson(res, 400, { message: "Comment is required when amount is different" });
            }

            const confirmedAt = new Date().toISOString();
            db.expenses[index] = {
              ...current,
              amount: confirmedAmount,
              status: "confirmed",
              confirmedAmount,
              confirmedBy: body.confirmedBy || "operator",
              confirmedAt,
              confirmationComment: body.confirmationComment || undefined,
              amountMode: body.amountMode,
            };
            await writeDb(db);
            return sendJson(res, 200, db.expenses[index]);
          }

          if (pathname === "/financial-accounts" && method === "GET") {
            const db = await readDb();
            return sendJson(res, 200, db.financialAccounts);
          }

          if (pathname === "/financial-transactions" && method === "GET") {
            const db = await readDb();
            return sendJson(res, 200, db.financialTransactions);
          }

          if (pathname === "/orders" && method === "GET") {
            const db = await readDb();
            if (expirePendingOrders(db)) {
              await writeDb(db);
            }
            return sendJson(res, 200, db.orders);
          }

          if (pathname === "/orders" && method === "POST") {
            const db = await readDb();
            expirePendingOrders(db);
            const draft = sanitizeOrderDraft(await readJsonBody(req));
            if (!draft.items.length) {
              return sendJson(res, 400, { message: "Invalid order: empty items" });
            }

            const order: Order = {
              id: buildEntityId("or"),
              items: draft.items,
              createdAt: new Date().toISOString(),
              status: "por pagar",
              total: draft.items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0),
              operator: draft.operator || "operator",
            };

            db.orders.unshift(order);
            await writeDb(db);
            return sendJson(res, 201, order);
          }

          const orderId = extractOrderId(pathname);
          if (orderId && method === "PUT") {
            const db = await readDb();
            expirePendingOrders(db);
            const body = sanitizeOrderStatusDraft(await readJsonBody(req));
            if (!body.status) {
              return sendJson(res, 400, { message: "Invalid order status" });
            }

            const index = db.orders.findIndex((item) => item.id === orderId);
            if (index < 0) {
              return sendJson(res, 404, { message: "Order not found" });
            }

            const currentOrder = db.orders[index];
            if (body.status === "pagada" && currentOrder.status !== "por pagar") {
              return sendJson(res, 409, { message: "Only pending orders can be marked as paid" });
            }
            if (body.status === "cancelada" && currentOrder.status !== "por pagar") {
              return sendJson(res, 409, { message: "Only pending orders can be canceled" });
            }

            db.orders[index] = {
              ...currentOrder,
              status: body.status,
              paymentMethod: body.status === "pagada" ? body.paymentMethod || currentOrder.paymentMethod : currentOrder.paymentMethod,
              total:
                body.status === "pagada" && Number.isFinite(body.total) && Number(body.total) > 0
                  ? Math.trunc(Number(body.total))
                  : currentOrder.total,
              cancelledAt: body.status === "cancelada" ? new Date().toISOString() : currentOrder.cancelledAt,
            };
            if (body.status === "pagada") {
              createDurationNotification(db, {
                type: "sale-created",
                title: `Venta registrada: ${db.orders[index].id}`,
                description: `Venta por ${db.orders[index].total} (${db.orders[index].operator}).`,
                entityType: "order",
                entityId: db.orders[index].id,
              });
            }
            await writeDb(db);
            return sendJson(res, 200, db.orders[index]);
          }

          if (pathname === "/invoices" && method === "GET") {
            const db = await readDb();
            return sendJson(res, 200, db.invoices);
          }

          if (pathname === "/invoices" && method === "POST") {
            const db = await readDb();
            expirePendingOrders(db);
            const draft = sanitizeInvoiceDraft(await readJsonBody(req));
            if (!draft.orderId || !Number.isFinite(draft.total) || draft.total <= 0 || !draft.paymentMethod) {
              return sendJson(res, 400, { message: "Invalid invoice draft" });
            }

            const orderForInvoice = db.orders.find((order) => order.id === draft.orderId);
            if (!orderForInvoice) {
              return sendJson(res, 404, { message: "Order not found for invoice" });
            }
            if (orderForInvoice.status !== "pagada") {
              return sendJson(res, 409, { message: "Invoice can only be created for paid orders" });
            }

            const invoice: Invoice = {
              id: buildEntityId("fc"),
              orderId: draft.orderId,
              createdAt: new Date().toISOString(),
              total: Math.trunc(draft.total),
              paymentMethod: draft.paymentMethod,
              operator: draft.operator || "operator",
            };
            db.invoices.unshift(invoice);
            await writeDb(db);
            return sendJson(res, 201, invoice);
          }

          if (pathname === "/receipts" && method === "POST") {
            const db = await readDb();
            const draft = sanitizeReceiptDraft(await readJsonBody(req));
            if (!draft.orderId) {
              return sendJson(res, 400, { message: "Invalid receipt draft: orderId is required" });
            }

            const order = db.orders.find((item) => item.id === draft.orderId);
            if (!order) {
              return sendJson(res, 404, { message: "Order not found for receipt" });
            }
            if (order.status !== "pagada") {
              return sendJson(res, 409, { message: "Receipt can only be created for paid orders" });
            }

            const invoice =
              (draft.invoiceId ? db.invoices.find((item) => item.id === draft.invoiceId) : undefined) ||
              db.invoices.find((item) => item.orderId === order.id);
            if (draft.invoiceId && !invoice) {
              return sendJson(res, 404, { message: "Invoice not found for receipt" });
            }

            const items = draft.items.length ? draft.items : order.items;
            if (!items.length) {
              return sendJson(res, 400, { message: "Invalid receipt draft: items are required" });
            }

            const paymentMethod = draft.paymentMethod || order.paymentMethod || invoice?.paymentMethod;
            if (!paymentMethod) {
              return sendJson(res, 400, { message: "Invalid receipt draft: paymentMethod is required" });
            }

            const computedItemsTotal = items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
            const fallbackTotal = Number.isFinite(order.total) && order.total > 0 ? order.total : computedItemsTotal;
            const total =
              Number.isFinite(draft.total) && draft.total > 0 ? Math.trunc(draft.total) : Math.max(0, Math.trunc(fallbackTotal));

            const receipt: Receipt = {
              id: buildEntityId("rc"),
              orderId: order.id,
              orderCode: draft.orderCode || order.id,
              invoiceId: invoice?.id,
              createdAt: draft.createdAt || invoice?.createdAt || order.createdAt || new Date().toISOString(),
              operator: draft.operator || order.operator || invoice?.operator || "operator",
              paymentMethod,
              items,
              total,
              filePath: "",
              html: "",
            };

            receipt.html = buildSaleReceiptHtml(receipt);
            receipt.filePath = await writeReceiptCopy(receipt.id, receipt.html);
            return sendJson(res, 201, receipt);
          }

          if (pathname === "/cash-opening-assignments" && method === "GET") {
            const db = await readDb();
            return sendJson(res, 200, db.cashOpeningAssignments);
          }

          const cashOpeningAssignmentOperator = extractCashOpeningAssignmentOperator(pathname);
          if (cashOpeningAssignmentOperator && method === "PUT") {
            const db = await readDb();
            const body = sanitizeCashOpeningAssignmentDraft(await readJsonBody(req));
            if (!Number.isFinite(body.amount) || body.amount < 0) {
              return sendJson(res, 400, { message: "Amount must be a non-negative number" });
            }
            const shift = normalizeCashShift(body.shift);
            const shiftWindow = CASH_SHIFT_WINDOWS[shift];
            const index = db.cashOpeningAssignments.findIndex((item) => item.operator === cashOpeningAssignmentOperator);
            const assignment: CashOpeningAssignment = {
              operator: cashOpeningAssignmentOperator,
              amount: Math.trunc(body.amount),
              shift,
              startHour: shiftWindow.startHour,
              endHour: shiftWindow.endHour,
              updatedBy: body.updatedBy || "admin",
              updatedAt: new Date().toISOString(),
            };
            if (index >= 0) {
              db.cashOpeningAssignments[index] = assignment;
            } else {
              db.cashOpeningAssignments.push(assignment);
              db.cashOpeningAssignments.sort((a, b) => a.operator.localeCompare(b.operator));
            }
            await writeDb(db);
            return sendJson(res, 200, assignment);
          }

          if (pathname === "/workdays" && method === "GET") {
            const db = await readDb();
            return sendJson(res, 200, db.workdays);
          }

          if (pathname === "/workdays/current" && method === "GET") {
            const db = await readDb();
            const operator = String(url.searchParams.get("operator") || "").trim();
            if (!operator) {
              return sendJson(res, 400, { message: "Operator is required" });
            }
            const current =
              db.workdays.find((item) => item.operator === operator && !item.endedAt && item.status !== "closed") || null;
            if (!current) {
              return sendJson(res, 200, null);
            }
            return sendJson(res, 200, current);
          }

          if (pathname === "/workdays/open" && method === "POST") {
            const db = await readDb();
            const body = sanitizeWorkdayOpenDraft(await readJsonBody(req));
            if (!body.operator) {
              return sendJson(res, 400, { message: "Operator is required" });
            }
            if (!Number.isFinite(body.openingAmount) || body.openingAmount < 0) {
              return sendJson(res, 400, { message: "Opening amount must be a non-negative number" });
            }

            const existing = db.workdays.find((item) => item.operator === body.operator && !item.endedAt && item.status !== "closed");
            if (existing) {
              return sendJson(res, 200, existing);
            }

            const userRecord = findUserByUsername(db, body.operator);
            const isAdminOperator = resolveAppUserRole(userRecord || { username: body.operator }) === "admin";
            const assignment = isAdminOperator ? undefined : findCashOpeningAssignment(db, body.operator);
            if (!assignment && !isAdminOperator) {
              return sendJson(res, 403, {
                message: "No tienes un turno y monto de apertura asignados. Contacta al administrador.",
              });
            }
            if (assignment && !isNowWithinRange(assignment.startHour, assignment.endHour)) {
              return sendJson(res, 403, {
                message: `Fuera del horario asignado (${assignment.startHour} a ${assignment.endHour}) para el turno ${assignment.shift}.`,
              });
            }
            const openingDeclaredAmount = Math.trunc(body.openingAmount);
            const openingAssignedAmount = assignment ? Math.trunc(assignment.amount) : undefined;
            const openingDifferenceAmount =
              typeof openingAssignedAmount === "number" ? openingDeclaredAmount - openingAssignedAmount : 0;

            const workday: Workday = {
              id: buildEntityId("wd"),
              operator: body.operator,
              startedAt: new Date().toISOString(),
              orderIds: [],
              status: "open",
              openingAssignedAmount,
              openingDeclaredAmount,
              openingDifferenceAmount,
            };
            db.workdays.unshift(workday);
            createDurationNotification(db, {
              type: "cash-opened",
              title: `Caja abierta: ${workday.operator}`,
              description: `Se abrio caja para ${workday.operator} con ${openingDeclaredAmount}.`,
              createdAt: workday.startedAt,
              entityType: "workday",
              entityId: workday.id,
            });
            if (typeof openingAssignedAmount === "number" && openingDifferenceAmount !== 0) {
              createDurationNotification(db, {
                type: "cash",
                title: `Diferencia en apertura de caja: ${workday.operator}`,
                description: `Asignado ${openingAssignedAmount}, declarado ${openingDeclaredAmount}. Diferencia ${openingDifferenceAmount > 0 ? "sobrante" : "faltante"} de ${Math.abs(openingDifferenceAmount)}.`,
                createdAt: workday.startedAt,
                requiresAction: true,
                actionLabel: "Revisar diferencia",
                entityType: "workday",
                entityId: workday.id,
              });
            }
            await writeDb(db);
            return sendJson(res, 201, workday);
          }

          if (pathname === "/workdays/current/add-order" && method === "POST") {
            const db = await readDb();
            const body = sanitizeWorkdayAddOrderDraft(await readJsonBody(req));
            if (!body.operator || !body.orderId) {
              return sendJson(res, 400, { message: "Operator and orderId are required" });
            }

            const index = db.workdays.findIndex(
              (item) => item.operator === body.operator && !item.endedAt && (item.status || "open") === "open",
            );
            if (index < 0) {
              return sendJson(res, 404, { message: "Open workday not found" });
            }

            const current = db.workdays[index];
            const hasOrder = current.orderIds.includes(body.orderId);
            db.workdays[index] = {
              ...current,
              status: "open",
              orderIds: hasOrder ? current.orderIds : [...current.orderIds, body.orderId],
            };
            await writeDb(db);
            return sendJson(res, 200, db.workdays[index]);
          }

          const workdayRequestCloseId = extractWorkdayRequestCloseId(pathname);
          if (workdayRequestCloseId && method === "PUT") {
            const db = await readDb();
            const body = sanitizeWorkdayRequestCloseDraft(await readJsonBody(req));
            if (!body.operator) {
              return sendJson(res, 400, { message: "Operator is required" });
            }
            if (!Number.isFinite(body.declaredClosingCash) || body.declaredClosingCash < 0) {
              return sendJson(res, 400, { message: "Declared closing cash must be a non-negative number" });
            }

            const index = db.workdays.findIndex((item) => item.id === workdayRequestCloseId);
            if (index < 0) {
              return sendJson(res, 404, { message: "Workday not found" });
            }
            const current = db.workdays[index];
            if (current.operator !== body.operator) {
              return sendJson(res, 403, { message: "Only the owner operator can request close" });
            }
            if (current.endedAt || current.status === "closed") {
              return sendJson(res, 409, { message: "Workday already closed" });
            }

            const closeRequestedAt = new Date().toISOString();
            const pendingDraft: Workday = {
              ...current,
              status: "pending-close",
              closeRequestedAt,
              orderIds: body.orderIds.length ? body.orderIds : current.orderIds,
            };
            const closeSummary = computeWorkdayCloseSummary(db, pendingDraft, body.declaredClosingCash);

            db.workdays[index] = {
              ...pendingDraft,
              closeSummary,
            };
            createDurationNotification(db, {
              type: "cash",
              title: `Cierre de caja pendiente: ${pendingDraft.operator}`,
              description: `La jornada ${pendingDraft.id} fue enviada para auditoria.`,
              createdAt: closeRequestedAt,
              requiresAction: true,
              actionLabel: "Auditar cierre",
              entityType: "workday",
              entityId: pendingDraft.id,
            });
            await writeDb(db);
            return sendJson(res, 200, db.workdays[index]);
          }

          const workdayAdminCloseId = extractWorkdayAdminCloseId(pathname);
          if (workdayAdminCloseId && method === "PUT") {
            const db = await readDb();
            const body = sanitizeWorkdayAdminCloseDraft(await readJsonBody(req));
            if (!body.reviewedBy) {
              return sendJson(res, 400, { message: "reviewedBy is required" });
            }

            const index = db.workdays.findIndex((item) => item.id === workdayAdminCloseId);
            if (index < 0) {
              return sendJson(res, 404, { message: "Workday not found" });
            }
            const current = db.workdays[index];
            if (current.endedAt || current.status === "closed") {
              return sendJson(res, 409, { message: "Workday already closed" });
            }

            const checks = normalizeWorkdayAuditChecks(body.checks);
            const declaredClosingCash =
              current.closeSummary?.declaredClosingCash ??
              Math.max(0, Math.trunc(Number(current.openingDeclaredAmount || 0)));
            const closeSummary =
              current.closeSummary ||
              computeWorkdayCloseSummary(
                db,
                {
                  ...current,
                  closeRequestedAt: current.closeRequestedAt || new Date().toISOString(),
                },
                declaredClosingCash,
              );
            const generatedMismatchReport = buildWorkdayMismatchReport(current, closeSummary, checks);
            const mismatchReport = body.mismatchReport || generatedMismatchReport || undefined;
            const endedAt = new Date().toISOString();

            db.workdays[index] = {
              ...current,
              status: "closed",
              endedAt,
              closeSummary,
              adminReview: {
                reviewedBy: body.reviewedBy,
                reviewedAt: endedAt,
                checks,
                notes: body.notes || undefined,
                mismatchReport,
              },
            };
            markNotificationAsReceived(db, "workday", db.workdays[index].id);
            createDurationNotification(db, {
              type: "cash-closed",
              title: `Caja cerrada: ${db.workdays[index].operator}`,
              description: `Se cerro la jornada ${db.workdays[index].id}.`,
              createdAt: endedAt,
              entityType: "workday",
              entityId: db.workdays[index].id,
            });
            if (mismatchReport) {
              createDurationNotification(db, {
                type: "cash",
                title: `Diferencias detectadas en cierre: ${db.workdays[index].operator}`,
                description: mismatchReport,
                createdAt: endedAt,
                entityType: "workday",
                entityId: db.workdays[index].id,
              });
            }
            await writeDb(db);
            return sendJson(res, 200, db.workdays[index]);
          }

          const workdayId = extractWorkdayId(pathname);
          if (workdayId && method === "PUT") {
            const db = await readDb();
            const body = sanitizeWorkdayCloseDraft(await readJsonBody(req));
            const index = db.workdays.findIndex((item) => item.id === workdayId);
            if (index < 0) {
              return sendJson(res, 404, { message: "Workday not found" });
            }
            const current = db.workdays[index];
            const endedAt = body.endedAt || new Date().toISOString();
            const orderIds = body.orderIds.length ? body.orderIds : current.orderIds;
            const fallbackDeclaredCash =
              current.closeSummary?.declaredClosingCash ??
              Math.max(0, Math.trunc(Number(current.openingDeclaredAmount || current.openingAssignedAmount || 0)));
            const closeSummary =
              current.closeSummary ||
              computeWorkdayCloseSummary(
                db,
                {
                  ...current,
                  closeRequestedAt: current.closeRequestedAt || endedAt,
                  orderIds,
                },
                fallbackDeclaredCash,
              );

            db.workdays[index] = {
              ...current,
              endedAt,
              status: "closed",
              orderIds,
              closeSummary,
            };
            createDurationNotification(db, {
              type: "cash-closed",
              title: `Caja cerrada: ${db.workdays[index].operator}`,
              description: `Se cerro la jornada ${db.workdays[index].id}.`,
              createdAt: db.workdays[index].endedAt,
              entityType: "workday",
              entityId: db.workdays[index].id,
            });
            await writeDb(db);
            return sendJson(res, 200, db.workdays[index]);
          }

          if (pathname === "/supply-orders" && method === "GET") {
            const db = await readDb();
            return sendJson(res, 200, db.supplyOrders);
          }

          if (pathname === "/supply-orders" && method === "POST") {
            const db = await readDb();
            const draft = sanitizeSupplyOrderDraft(await readJsonBody(req));
            if (!draft.supplierName || !Number.isFinite(draft.expectedTotal) || draft.expectedTotal <= 0) {
              return sendJson(res, 400, { message: "Invalid supply order draft" });
            }
            let items: SupplyOrderItem[] = [];
            try {
              items = buildSupplyOrderItemsFromDraft(db, draft.items);
            } catch (error) {
              return sendJson(res, 400, { message: error instanceof Error ? error.message : "Invalid supply order item" });
            }
            if (!items.length && !draft.description) {
              return sendJson(res, 400, { message: "Supply order requires items or description" });
            }

            const supplyOrder: SupplyOrder = {
              id: buildEntityId("so"),
              supplierName: draft.supplierName,
              description: draft.description,
              expectedTotal: Math.trunc(draft.expectedTotal),
              items,
              createdAt: new Date().toISOString(),
              createdBy: draft.createdBy || "operator",
              status: "pending",
            };
            db.supplyOrders.unshift(supplyOrder);
            createDurationNotification(db, {
              type: "supply-requested",
              title: `Pedido a proveedor: ${supplyOrder.supplierName}`,
              description: `Se genero pedido ${supplyOrder.id} por ${supplyOrder.expectedTotal}. Productos: ${supplyOrder.items.length}.`,
              createdAt: supplyOrder.createdAt,
              entityType: "supply-order",
              entityId: supplyOrder.id,
            });
            createNotificationRecord(db, {
              type: "supply-pending-receive",
              title: `Pendiente recepcion: ${supplyOrder.supplierName}`,
              description: `Pedido ${supplyOrder.id} pendiente de recepcion.`,
              isFixed: true,
              requiresAction: true,
              actionLabel: "Registrar recepcion",
              status: "active",
              entityType: "supply-order",
              entityId: supplyOrder.id,
            });
            await writeDb(db);
            return sendJson(res, 201, supplyOrder);
          }

          const supplyOrderEntityId = extractSupplyOrderEntityId(pathname);
          if (supplyOrderEntityId && method === "PUT") {
            const db = await readDb();
            const draft = sanitizeSupplyOrderUpdateDraft(await readJsonBody(req));
            if (!draft.supplierName || !Number.isFinite(draft.expectedTotal) || draft.expectedTotal <= 0) {
              return sendJson(res, 400, { message: "Invalid supply order draft" });
            }

            const index = db.supplyOrders.findIndex((item) => item.id === supplyOrderEntityId);
            if (index < 0) {
              return sendJson(res, 404, { message: "Supply order not found" });
            }

            const current = db.supplyOrders[index];
            if (current.status !== "pending") {
              return sendJson(res, 409, { message: "Only pending supply orders can be updated" });
            }
            let items: SupplyOrderItem[] = [];
            try {
              items = buildSupplyOrderItemsFromDraft(db, draft.items);
            } catch (error) {
              return sendJson(res, 400, { message: error instanceof Error ? error.message : "Invalid supply order item" });
            }
            if (!items.length && !draft.description) {
              return sendJson(res, 400, { message: "Supply order requires items or description" });
            }

            db.supplyOrders[index] = {
              ...current,
              supplierName: draft.supplierName,
              description: draft.description,
              expectedTotal: Math.trunc(draft.expectedTotal),
              items,
            };
            await writeDb(db);
            return sendJson(res, 200, db.supplyOrders[index]);
          }

          if (supplyOrderEntityId && method === "DELETE") {
            const db = await readDb();
            const index = db.supplyOrders.findIndex((item) => item.id === supplyOrderEntityId);
            if (index < 0) {
              return sendJson(res, 404, { message: "Supply order not found" });
            }
            const current = db.supplyOrders[index];
            if (current.status !== "pending") {
              return sendJson(res, 409, { message: "Only pending supply orders can be cancelled" });
            }
            db.supplyOrders.splice(index, 1);
            await writeDb(db);
            return sendJson(res, 200, { ok: true, id: supplyOrderEntityId });
          }

          const supplyOrderReceiveId = extractSupplyOrderReceiveId(pathname);
          if (supplyOrderReceiveId && method === "PUT") {
            const db = await readDb();
            const body = sanitizeSupplyOrderReceiveDraft(await readJsonBody(req));
            if (!Number.isFinite(body.actualTotal) || body.actualTotal <= 0) {
              return sendJson(res, 400, { message: "Invalid receive payload: actualTotal" });
            }
            if (!body.invoiceImageUrl) {
              return sendJson(res, 400, { message: "Invoice image is required" });
            }

            const index = db.supplyOrders.findIndex((item) => item.id === supplyOrderReceiveId);
            if (index < 0) {
              return sendJson(res, 404, { message: "Supply order not found" });
            }

            const current = db.supplyOrders[index];
            if (current.status === "received") {
              return sendJson(res, 409, { message: "Supply order already received" });
            }

            const actualTotal = Math.trunc(body.actualTotal);
            if (actualTotal > current.expectedTotal) {
              return sendJson(res, 400, { message: "Actual total cannot be greater than expected total" });
            }
            if (body.isExactAmount && actualTotal !== current.expectedTotal) {
              return sendJson(res, 400, { message: "Exact amount must match expected total" });
            }
            if (!body.isExactAmount && actualTotal >= current.expectedTotal) {
              return sendJson(res, 400, { message: "Different amount must be less than expected total" });
            }
            if (!body.isExactAmount && !body.receiveComment) {
              return sendJson(res, 400, { message: "Comment is required when amount is different" });
            }

            const remainingAmount = current.expectedTotal - actualTotal;
            const receivedAt = new Date().toISOString();
            let nextItems = current.items;

            if (current.items.length > 0) {
              const incomingByProductId = new Map(body.items.map((item) => [item.productId, item]));
              const unknownReceiptItem = body.items.find((item) => !current.items.some((currentItem) => currentItem.productId === item.productId));
              if (unknownReceiptItem) {
                return sendJson(res, 400, { message: `Received item does not belong to order: ${unknownReceiptItem.productId}` });
              }

              for (const item of current.items) {
                const draftItem = incomingByProductId.get(item.productId);
                const missingQuantity = draftItem ? Math.max(0, Math.trunc(draftItem.missingQuantity)) : 0;
                if (missingQuantity > item.quantity) {
                  return sendJson(res, 400, { message: `Missing quantity exceeds expected quantity for ${item.productName}` });
                }
                const receivedQuantity = item.quantity - missingQuantity;
                if (receivedQuantity > 0 && !draftItem?.expirationDate) {
                  return sendJson(res, 400, { message: `Expiration date is required for ${item.productName}` });
                }
                if (receivedQuantity > 0) {
                  const product = db.products.find((productNode) => productNode.id === item.productId);
                  if (!product) {
                    return sendJson(res, 400, { message: `Product not found while receiving order: ${item.productName}` });
                  }
                }
              }

              nextItems = current.items.map((item) => {
                const draftItem = incomingByProductId.get(item.productId);
                const missingQuantity = draftItem ? Math.max(0, Math.trunc(draftItem.missingQuantity)) : 0;
                const receivedQuantity = Math.max(0, item.quantity - missingQuantity);
                return {
                  ...item,
                  receivedQuantity,
                  missingQuantity,
                  expirationDate: receivedQuantity > 0 ? draftItem?.expirationDate : undefined,
                };
              });
            }

            db.supplyOrders[index] = {
              ...current,
              items: nextItems,
              status: "received",
              isExactAmount: body.isExactAmount,
              actualTotal,
              remainingAmount,
              receivedAt,
              receivedBy: body.receivedBy || "operator",
              invoiceImageUrl: body.invoiceImageUrl,
              receiveComment: body.receiveComment || undefined,
            };

            if (nextItems.length > 0) {
              for (const item of nextItems) {
                const receivedQuantity = Math.max(0, Math.trunc(Number(item.receivedQuantity || 0)));
                if (receivedQuantity <= 0) continue;

                const product = db.products.find((node) => node.id === item.productId);
                const fallbackCostPrice =
                  Number.isFinite(Number(product?.costPrice)) && Number(product?.costPrice) > 0
                    ? Math.trunc(Number(product?.costPrice))
                    : Number.isFinite(Number(product?.price)) && Number(product?.price) > 0
                      ? Math.trunc(Number(product?.price))
                      : undefined;
                const fallbackSalePrice =
                  Number.isFinite(Number(product?.price)) && Number(product?.price) > 0 ? Math.trunc(Number(product?.price)) : undefined;

                createStockEntryRecord(
                  db,
                  {
                    productId: item.productId,
                    expirationDate: item.expirationDate,
                    quantity: receivedQuantity,
                    description: `Ingreso automatico por recepcion del pedido ${current.id}.`,
                    supplyOrderId: current.id,
                    costPrice: fallbackCostPrice,
                    salePrice: fallbackSalePrice,
                  },
                  { createdAt: receivedAt },
                );
              }
            }
            markNotificationAsReceived(db, "supply-order", current.id);
            createDurationNotification(db, {
              type: "supply-received",
              title: `Mercancia recibida: ${current.supplierName}`,
              description: `Pedido ${current.id} recibido por ${db.supplyOrders[index].receivedBy || "operator"}.`,
              createdAt: db.supplyOrders[index].receivedAt,
              entityType: "supply-order",
              entityId: current.id,
            });
            await writeDb(db);
            return sendJson(res, 200, db.supplyOrders[index]);
          }

          if (pathname === "/licenses" && method === "GET") {
            const db = await readDb();
            return sendJson(res, 200, db.licenses);
          }

          if (pathname === "/licenses" && method === "POST") {
            const db = await readDb();
            const draft = sanitizeLicenseDraft(await readJsonBody(req));
            if (!draft.name || !draft.description) {
              return sendJson(res, 400, { message: "Invalid license draft" });
            }
            if ((draft.issueDate && !draft.expirationDate) || (!draft.issueDate && draft.expirationDate)) {
              return sendJson(res, 400, { message: "Issue and expiration must be both set or both empty" });
            }
            const now = new Date().toISOString();
            const durationDays = computeDurationDays(draft.issueDate, draft.expirationDate);
            const status = resolveLicenseStatus(draft.issueDate, draft.expirationDate);
            const issuances: LicenseIssuance[] =
              draft.issueDate && draft.expirationDate
                ? [
                    {
                      id: buildEntityId("li"),
                      issuedAt: draft.issueDate,
                      expiresAt: draft.expirationDate,
                      createdAt: now,
                    },
                  ]
                : [];
            const license: LicenseRecord = {
              id: buildEntityId("lc"),
              name: draft.name,
              description: draft.description,
              category: draft.category,
              issueDate: draft.issueDate,
              expirationDate: draft.expirationDate,
              durationDays,
              contactEmail: draft.contactEmail,
              contactPhone: draft.contactPhone,
              sourceAddress: draft.sourceAddress,
              status,
              createdAt: now,
              updatedAt: now,
              issuances,
            };
            db.licenses.unshift(license);
            ensureLicenseNotifications(db, license);
            await writeDb(db);
            return sendJson(res, 201, license);
          }

          const licenseEntityId = extractLicenseId(pathname);
          if (licenseEntityId && method === "PUT") {
            const db = await readDb();
            const draft = sanitizeLicenseDraft(await readJsonBody(req));
            if (!draft.name || !draft.description) {
              return sendJson(res, 400, { message: "Invalid license draft" });
            }
            if ((draft.issueDate && !draft.expirationDate) || (!draft.issueDate && draft.expirationDate)) {
              return sendJson(res, 400, { message: "Issue and expiration must be both set or both empty" });
            }
            const index = db.licenses.findIndex((item) => item.id === licenseEntityId);
            if (index < 0) {
              return sendJson(res, 404, { message: "License not found" });
            }
            const now = new Date().toISOString();
            const durationDays = computeDurationDays(draft.issueDate, draft.expirationDate);
            const status = resolveLicenseStatus(draft.issueDate, draft.expirationDate);
            db.licenses[index] = {
              ...db.licenses[index],
              name: draft.name,
              description: draft.description,
              category: draft.category,
              issueDate: draft.issueDate,
              expirationDate: draft.expirationDate,
              durationDays,
              contactEmail: draft.contactEmail,
              contactPhone: draft.contactPhone,
              sourceAddress: draft.sourceAddress,
              status,
              updatedAt: now,
            };
            ensureLicenseNotifications(db, db.licenses[index]);
            await writeDb(db);
            return sendJson(res, 200, db.licenses[index]);
          }

          const licenseIssuanceId = extractLicenseIssuanceId(pathname);
          if (licenseIssuanceId && method === "POST") {
            const db = await readDb();
            const index = db.licenses.findIndex((item) => item.id === licenseIssuanceId);
            if (index < 0) {
              return sendJson(res, 404, { message: "License not found" });
            }
            const draft = sanitizeLicenseIssuanceDraft(await readJsonBody(req));
            if (!draft.issuedAt || !draft.expiresAt) {
              return sendJson(res, 400, { message: "Invalid issuance draft" });
            }
            const fromMs = new Date(draft.issuedAt).getTime();
            const toMs = new Date(draft.expiresAt).getTime();
            if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
              return sendJson(res, 400, { message: "Invalid issuance dates" });
            }
            const now = new Date().toISOString();
            const issuance: LicenseIssuance = {
              id: buildEntityId("li"),
              issuedAt: draft.issuedAt,
              expiresAt: draft.expiresAt,
              createdAt: now,
              notes: draft.notes,
            };
            const current = db.licenses[index];
            const nextDuration = computeDurationDays(issuance.issuedAt, issuance.expiresAt);
            db.licenses[index] = {
              ...current,
              issueDate: issuance.issuedAt,
              expirationDate: issuance.expiresAt,
              durationDays: nextDuration,
              status: resolveLicenseStatus(issuance.issuedAt, issuance.expiresAt),
              updatedAt: now,
              issuances: [issuance, ...current.issuances],
            };
            ensureLicenseNotifications(db, db.licenses[index]);
            await writeDb(db);
            return sendJson(res, 200, db.licenses[index]);
          }

          if (pathname === "/notifications" && method === "GET") {
            const db = await readDb();
            return sendJson(res, 200, db.notifications);
          }

          if (pathname === "/notifications" && method === "POST") {
            const db = await readDb();
            const draft = sanitizeNotificationDraft(await readJsonBody(req));
            if (!draft.type || !draft.title || !draft.description) {
              return sendJson(res, 400, { message: "Invalid notification draft" });
            }
            const created = createNotificationRecord(db, {
              type: draft.type,
              title: draft.title,
              description: draft.description,
              dueAt: draft.dueAt,
              isFixed: draft.isFixed,
              requiresAction: draft.requiresAction,
              actionLabel: draft.actionLabel,
              category: draft.category,
              entityType: draft.entityType,
              entityId: draft.entityId,
              status: "active",
            });
            await writeDb(db);
            return sendJson(res, 201, created);
          }

          const notificationEntityId = extractNotificationId(pathname);
          if (notificationEntityId && method === "PUT") {
            const db = await readDb();
            const body = sanitizeNotificationUpdateDraft(await readJsonBody(req));
            const index = db.notifications.findIndex((item) => item.id === notificationEntityId);
            if (index < 0) {
              return sendJson(res, 404, { message: "Notification not found" });
            }
            const current = db.notifications[index];
            const nextStatus = body.status || current.status;
            const now = new Date().toISOString();
            db.notifications[index] = {
              ...current,
              title: body.title || current.title,
              description: body.description || current.description,
              dueAt: typeof body.dueAt !== "undefined" ? body.dueAt : current.dueAt,
              isFixed: typeof body.isFixed === "boolean" ? body.isFixed : current.isFixed,
              requiresAction: typeof body.requiresAction === "boolean" ? body.requiresAction : current.requiresAction,
              status: nextStatus,
              receivedAt: nextStatus === "received" ? now : current.receivedAt,
              disabledAt: nextStatus === "disabled" ? now : current.disabledAt,
            };
            await writeDb(db);
            return sendJson(res, 200, db.notifications[index]);
          }

          if (pathname === "/notification-settings" && method === "GET") {
            const db = await readDb();
            return sendJson(res, 200, db.notificationSettings);
          }

          const notificationSettingType = extractNotificationSettingType(pathname);
          if (notificationSettingType && method === "PUT") {
            const db = await readDb();
            const draft = sanitizeNotificationSettingDraft(await readJsonBody(req));
            const index = db.notificationSettings.findIndex((item) => item.type === notificationSettingType);
            if (index < 0) {
              return sendJson(res, 404, { message: "Notification setting not found" });
            }
            db.notificationSettings[index] = {
              ...db.notificationSettings[index],
              leadDays: typeof draft.leadDays === "number" ? Math.max(0, Math.trunc(draft.leadDays)) : db.notificationSettings[index].leadDays,
              durationDays:
                typeof draft.durationDays === "number"
                  ? Math.max(0, Math.trunc(draft.durationDays))
                  : db.notificationSettings[index].durationDays,
            };
            await writeDb(db);
            return sendJson(res, 200, db.notificationSettings[index]);
          }

          if (pathname === "/stock-threshold-settings" && method === "GET") {
            const db = await readDb();
            return sendJson(res, 200, db.stockThresholdSettings);
          }

          const stockThresholdCategory = extractStockThresholdCategory(pathname);
          if (stockThresholdCategory && method === "PUT") {
            const db = await readDb();
            const draft = sanitizeStockThresholdDraft(await readJsonBody(req));
            if (!Number.isFinite(draft.minUnits)) {
              return sendJson(res, 400, { message: "Invalid minUnits" });
            }
            db.stockThresholdSettings.categoryThresholds[stockThresholdCategory] = Math.max(10, Math.trunc(draft.minUnits));
            syncAllLowStockNotifications(db);
            await writeDb(db);
            return sendJson(res, 200, db.stockThresholdSettings);
          }

          const stockThresholdProductId = extractStockThresholdProductId(pathname);
          if (stockThresholdProductId && method === "PUT") {
            const db = await readDb();
            const draft = sanitizeStockThresholdDraft(await readJsonBody(req));
            if (!Number.isFinite(draft.minUnits)) {
              return sendJson(res, 400, { message: "Invalid minUnits" });
            }
            const minUnits = Math.max(10, Math.trunc(draft.minUnits));
            const existingIndex = db.stockThresholdSettings.productThresholds.findIndex((item) => item.productId === stockThresholdProductId);
            if (existingIndex < 0) {
              db.stockThresholdSettings.productThresholds.push({ productId: stockThresholdProductId, minUnits });
            } else {
              db.stockThresholdSettings.productThresholds[existingIndex] = { productId: stockThresholdProductId, minUnits };
            }
            syncLowStockNotificationForProduct(db, stockThresholdProductId);
            await writeDb(db);
            return sendJson(res, 200, db.stockThresholdSettings);
          }

          if (stockThresholdProductId && method === "DELETE") {
            const db = await readDb();
            db.stockThresholdSettings.productThresholds = db.stockThresholdSettings.productThresholds.filter(
              (item) => item.productId !== stockThresholdProductId,
            );
            syncLowStockNotificationForProduct(db, stockThresholdProductId);
            await writeDb(db);
            return sendJson(res, 200, db.stockThresholdSettings);
          }

          if (pathname === "/price-margin-settings" && method === "GET") {
            const db = await readDb();
            return sendJson(res, 200, db.priceMarginSettings);
          }

          const priceMarginCategory = extractPriceMarginCategory(pathname);
          if (priceMarginCategory && method === "PUT") {
            const db = await readDb();
            const draft = sanitizePriceMarginDraft(await readJsonBody(req));
            if (!Number.isFinite(draft.marginPercent)) {
              return sendJson(res, 400, { message: "Invalid marginPercent" });
            }
            const previousMarginPercent = normalizeMarginPercent(db.priceMarginSettings.categoryMargins[priceMarginCategory] ?? 30);
            const nextMarginPercent = normalizeMarginPercent(draft.marginPercent);
            db.priceMarginSettings.categoryMargins[priceMarginCategory] = nextMarginPercent;
            pushCategoryMarginHistory(db, priceMarginCategory, previousMarginPercent, nextMarginPercent);
            await writeDb(db);
            return sendJson(res, 200, db.priceMarginSettings);
          }

          const priceMarginProductId = extractPriceMarginProductId(pathname);
          if (priceMarginProductId && method === "PUT") {
            const db = await readDb();
            const draft = sanitizePriceMarginDraft(await readJsonBody(req));
            if (!Number.isFinite(draft.marginPercent)) {
              return sendJson(res, 400, { message: "Invalid marginPercent" });
            }
            const marginPercent = normalizeMarginPercent(draft.marginPercent);
            const existingIndex = db.priceMarginSettings.productMargins.findIndex((item) => item.productId === priceMarginProductId);
            const previousMarginPercent =
              existingIndex < 0 ? null : normalizeMarginPercent(db.priceMarginSettings.productMargins[existingIndex].marginPercent);
            if (existingIndex < 0) {
              db.priceMarginSettings.productMargins.push({ productId: priceMarginProductId, marginPercent });
            } else {
              db.priceMarginSettings.productMargins[existingIndex] = { productId: priceMarginProductId, marginPercent };
            }
            pushProductMarginHistory(db, priceMarginProductId, previousMarginPercent, marginPercent);
            await writeDb(db);
            return sendJson(res, 200, db.priceMarginSettings);
          }

          if (priceMarginProductId && method === "DELETE") {
            const db = await readDb();
            const existing = db.priceMarginSettings.productMargins.find((item) => item.productId === priceMarginProductId);
            db.priceMarginSettings.productMargins = db.priceMarginSettings.productMargins.filter(
              (item) => item.productId !== priceMarginProductId,
            );
            if (existing) {
              pushProductMarginHistory(db, priceMarginProductId, normalizeMarginPercent(existing.marginPercent), null);
            }
            await writeDb(db);
            return sendJson(res, 200, db.priceMarginSettings);
          }

          if (pathname === "/payment-method-settings" && method === "GET") {
            const db = await readDb();
            return sendJson(res, 200, db.paymentMethodSettings);
          }

          const paymentMethodSetting = extractPaymentMethodSettingMethod(pathname);
          if (paymentMethodSetting && method === "PUT") {
            const db = await readDb();
            const draft = sanitizePaymentMethodSettingDraft(await readJsonBody(req));
            if (!Number.isFinite(draft.discountPercent) || !Number.isFinite(draft.surchargePercent)) {
              return sendJson(res, 400, { message: "Invalid payment method settings draft" });
            }

            const normalizedDiscount = normalizeMarginPercent(draft.discountPercent);
            const normalizedSurcharge = normalizeMarginPercent(draft.surchargePercent);
            const index = db.paymentMethodSettings.methods.findIndex((item) => item.method === paymentMethodSetting);
            const nextItem = {
              method: paymentMethodSetting,
              discountPercent: normalizedDiscount,
              surchargePercent: normalizedSurcharge,
            } as PaymentMethodAdjustment;

            if (index < 0) {
              db.paymentMethodSettings.methods.push(nextItem);
            } else {
              db.paymentMethodSettings.methods[index] = nextItem;
            }
            db.paymentMethodSettings = resolvePaymentMethodSettings(db.paymentMethodSettings);
            await writeDb(db);
            return sendJson(res, 200, db.paymentMethodSettings);
          }

          if (pathname === "/tax-settings" && method === "GET") {
            const db = await readDb();
            return sendJson(res, 200, db.taxSettings);
          }

          if (pathname === "/tax-settings" && method === "PUT") {
            const db = await readDb();
            const draft = sanitizeTaxSettingsDraft(await readJsonBody(req));
            if (
              (typeof draft.ivaPercent !== "number" || !Number.isFinite(draft.ivaPercent)) &&
              typeof draft.mode === "undefined"
            ) {
              return sendJson(res, 400, { message: "Invalid tax settings draft" });
            }
            if (typeof draft.ivaPercent === "number" && Number.isFinite(draft.ivaPercent)) {
              db.taxSettings.ivaPercent = normalizeMarginPercent(draft.ivaPercent);
            }
            if (draft.mode) {
              db.taxSettings.mode = draft.mode;
            }
            db.taxSettings = resolveTaxSettings(db.taxSettings);
            await writeDb(db);
            return sendJson(res, 200, db.taxSettings);
          }

          if (pathname === "/notifications/generate-test-cases" && method === "POST") {
            const db = await readDb();
            const createdCases = generateNotificationTestCases(db);
            await writeDb(db);
            return sendJson(res, 200, { ok: true, createdCases });
          }

          if (pathname === "/uploads/images" && method === "POST") {
            const activeStore = await getActiveDataStore();
            await ensureImageDir(activeStore);
            const contentType = String(req.headers["content-type"] || "").toLowerCase();
            if (!contentType.startsWith("image/")) {
              return sendJson(res, 400, { message: "Invalid image content-type" });
            }

            const body = await readBinaryBody(req);
            if (!body.length) {
              return sendJson(res, 400, { message: "Empty image payload" });
            }

            const requestedName = safeFileName(url.searchParams.get("name") || "");
            const requestedExt = extname(requestedName);
            const ext = requestedExt || guessExtFromContentType(contentType);
            const baseName = requestedExt ? requestedName.slice(0, -requestedExt.length) : requestedName;
            const finalName = `${baseName || `img-${Date.now()}`}-${Math.floor(Math.random() * 100000)}${ext}`;
            const filePath = resolve(activeStore.imagesDir, finalName);
            if (!filePath.startsWith(activeStore.imagesDir)) {
              return sendJson(res, 400, { message: "Invalid image path" });
            }

            await writeFile(filePath, body);
            return sendJson(res, 201, {
              path: `/images/${finalName}`,
              url: `/images/${finalName}`,
            });
          }

          if (pathname.startsWith("/images/") && method === "GET") {
            const activeStore = await getActiveDataStore();
            await ensureImageDir(activeStore);
            const rel = pathname.slice("/images/".length);
            const safeName = safeFileName(rel);
            const filePath = resolve(activeStore.imagesDir, safeName);
            if (!filePath.startsWith(activeStore.imagesDir) || !existsSync(filePath)) {
              return sendJson(res, 404, { message: "Image not found" });
            }
            const buffer = await readFile(filePath);
            res.statusCode = 200;
            res.setHeader("Content-Type", contentTypeFromExt(extname(safeName).toLowerCase()));
            res.end(buffer);
            return;
          }

          next();
        } catch (error) {
          sendJson(res, 500, { message: error instanceof Error ? error.message : "Mock server error" });
        }
      });
    },
  };
}

async function ensureDbFile(store?: DataStoreRecord) {
  const targetStore = store || (await getActiveDataStore());
  await ensureDataStoreDbFile(targetStore);
}

async function readDb(store?: DataStoreRecord): Promise<MockDb> {
  const targetStore = store || (await getActiveDataStore());
  await ensureDbFile(targetStore);
  const raw = await readFile(targetStore.dbPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<MockDb>;
  const normalizedIngredients = Array.isArray((parsed as { ingredients?: unknown[] }).ingredients)
    ? ((parsed as { ingredients: unknown[] }).ingredients)
        .map((item) => normalizeIngredientRecord(item))
        .filter((item): item is Ingredient => !!item)
    : defaultIngredientSeed;
  const normalizedMenuProducts = Array.isArray((parsed as { menuProducts?: unknown[] }).menuProducts)
    ? ((parsed as { menuProducts: unknown[] }).menuProducts)
        .map((item) => normalizeMenuProductRecord(item, normalizedIngredients))
        .filter((item): item is MenuProduct => !!item)
    : defaultMenuProductSeed;
  const db: MockDb = {
    products: Array.isArray(parsed.products)
      ? parsed.products
          .map((item) => normalizeProductRecord(item))
          .filter((item): item is Product => !!item)
      : [],
    productPrices: Array.isArray((parsed as { productPrices?: unknown[] }).productPrices)
      ? ((parsed as { productPrices: ProductPrice[] }).productPrices)
      : [],
    ingredients: normalizedIngredients,
    menuProducts: normalizedMenuProducts,
    users: Array.isArray((parsed as { users?: unknown[] }).users)
      ? ((parsed as { users: AppUserRecord[] }).users)
      : [],
    deleteRequests: Array.isArray(parsed.deleteRequests)
      ? parsed.deleteRequests.map((item) => {
          const draft = item as Partial<DeleteRequest> & { requestType?: unknown; title?: unknown; status?: unknown };
          const requestTypeValue = String(draft.requestType || "").trim().toLowerCase();
          const requestType: RequestType =
            requestTypeValue === "operation-order" || requestTypeValue === "product-delete"
              ? (requestTypeValue as RequestType)
              : draft.productId || draft.productName
                ? "product-delete"
                : "operation-order";
          const title =
            String(draft.title || "").trim() ||
            (requestType === "product-delete"
              ? `Eliminar producto: ${String(draft.productName || "").trim() || "sin nombre"}`
              : "Solicitud operativa");
          const statusValue = String(draft.status || "").trim().toLowerCase();
          const status: RequestStatus =
            statusValue === "approved" || statusValue === "rejected" || statusValue === "pending"
              ? (statusValue as RequestStatus)
              : "pending";
          return {
            id: String(draft.id || ""),
            requestType,
            title,
            description: String(draft.description || "").trim() || undefined,
            productId: String(draft.productId || "").trim() || undefined,
            productName: String(draft.productName || "").trim() || undefined,
            requestedBy: String(draft.requestedBy || "").trim() || "operator",
            requestedAt: String(draft.requestedAt || "").trim() || new Date().toISOString(),
            status,
            reviewedBy: String(draft.reviewedBy || "").trim() || undefined,
            reviewedAt: String(draft.reviewedAt || "").trim() || undefined,
          };
        })
      : [],
    requests: Array.isArray((parsed as { requests?: unknown[] }).requests)
      ? ((parsed as { requests: unknown[] }).requests)
          .map((item) => {
            const draft = item as Partial<OperationRequest> & { requestType?: unknown; status?: unknown };
            const typeValue = String(draft.requestType || "").trim().toLowerCase();
            const requestType: OperationRequestType =
              typeValue === "merchandise" || typeValue === "permissions"
                ? (typeValue as OperationRequestType)
                : "merchandise";
            const statusValue = String(draft.status || "").trim().toLowerCase();
            const status: OperationRequestStatus =
              statusValue === "approved" || statusValue === "rejected" || statusValue === "pending"
                ? (statusValue as OperationRequestStatus)
                : "pending";
            const description = String(draft.description || "").trim();
            if (!description) return null;
            return {
              id: String(draft.id || ""),
              requestType,
              description,
              items: normalizeOperationRequestItems(
                (draft as { items?: unknown }).items,
                Array.isArray(parsed.products) ? (parsed.products as Product[]) : [],
              ),
              requestedBy: String(draft.requestedBy || "").trim() || "operator",
              requestedAt: String(draft.requestedAt || "").trim() || new Date().toISOString(),
              status,
              reviewedBy: String(draft.reviewedBy || "").trim() || undefined,
              reviewedAt: String(draft.reviewedAt || "").trim() || undefined,
              supplyOrderId: String(draft.supplyOrderId || "").trim() || undefined,
              supplierMessage: String(draft.supplierMessage || "").trim() || undefined,
              reviewComment: String(draft.reviewComment || "").trim() || undefined,
            } as OperationRequest;
          })
          .filter((item): item is OperationRequest => !!item)
      : Array.isArray(parsed.deleteRequests)
        ? parsed.deleteRequests
            .map((item) => {
              const draft = item as Partial<DeleteRequest> & { requestType?: unknown };
              const requestTypeValue = String(draft.requestType || "").trim().toLowerCase();
              if (requestTypeValue !== "operation-order") return null;
              const description = String(draft.description || draft.title || "").trim();
              if (!description) return null;
              const statusValue = String(draft.status || "").trim().toLowerCase();
              const status: OperationRequestStatus =
                statusValue === "approved" || statusValue === "rejected" || statusValue === "pending"
                  ? (statusValue as OperationRequestStatus)
                  : "pending";
              return {
                id: String(draft.id || ""),
                requestType: "merchandise",
                description,
                requestedBy: String(draft.requestedBy || "").trim() || "operator",
                requestedAt: String(draft.requestedAt || "").trim() || new Date().toISOString(),
                status,
                reviewedBy: String(draft.reviewedBy || "").trim() || undefined,
                reviewedAt: String(draft.reviewedAt || "").trim() || undefined,
              } as OperationRequest;
            })
            .filter((item): item is OperationRequest => !!item)
        : [],
    stocks: Array.isArray(parsed.stocks)
      ? parsed.stocks
      : Array.isArray((parsed as { stockEntries?: unknown[] }).stockEntries)
        ? ((parsed as { stockEntries: StockEntry[] }).stockEntries)
        : [],
    orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    invoices: Array.isArray(parsed.invoices) ? parsed.invoices : [],
    workdays: Array.isArray((parsed as { workdays?: unknown[] }).workdays)
      ? ((parsed as { workdays: unknown[] }).workdays)
          .map((item) => normalizeWorkdayRecord(item))
          .filter((item): item is Workday => !!item)
      : [],
    cashOpeningAssignments: resolveCashOpeningAssignments(
      Array.isArray((parsed as { cashOpeningAssignments?: unknown[] }).cashOpeningAssignments)
        ? ((parsed as { cashOpeningAssignments: unknown[] }).cashOpeningAssignments)
        : [],
    ),
    supplyOrders: Array.isArray((parsed as { supplyOrders?: unknown[] }).supplyOrders)
      ? ((parsed as { supplyOrders: unknown[] }).supplyOrders)
          .map((item) => normalizeSupplyOrderRecord(item))
          .filter((item): item is SupplyOrder => !!item)
      : [],
    expenses: Array.isArray((parsed as { expenses?: unknown[] }).expenses)
      ? ((parsed as { expenses: Expense[] }).expenses)
          .map((item) => normalizeExpenseRecord(item))
          .filter((item): item is Expense => !!item)
      : [],
    feedbackEntries: Array.isArray((parsed as { feedbackEntries?: unknown[] }).feedbackEntries)
      ? ((parsed as { feedbackEntries: unknown[] }).feedbackEntries)
          .map((item) => normalizeFeedbackEntryRecord(item))
          .filter((item): item is FeedbackEntry => !!item)
      : [],
    financialAccounts: Array.isArray((parsed as { financialAccounts?: unknown[] }).financialAccounts)
      ? ((parsed as { financialAccounts: FinancialAccount[] }).financialAccounts)
      : [],
    financialTransactions: Array.isArray((parsed as { financialTransactions?: unknown[] }).financialTransactions)
      ? ((parsed as { financialTransactions: FinancialTransaction[] }).financialTransactions)
      : [],
    licenses: Array.isArray((parsed as { licenses?: unknown[] }).licenses)
      ? ((parsed as { licenses: unknown[] }).licenses)
          .map((item) => normalizeLicenseRecord(item))
          .filter((item): item is LicenseRecord => !!item)
      : [],
    notifications: Array.isArray((parsed as { notifications?: unknown[] }).notifications)
      ? ((parsed as { notifications: unknown[] }).notifications)
          .map((item) => normalizeNotificationRecord(item))
          .filter((item): item is NotificationRecord => !!item)
      : [],
    notificationSettings: resolveNotificationSettings(
      Array.isArray((parsed as { notificationSettings?: unknown[] }).notificationSettings)
        ? ((parsed as { notificationSettings: unknown[] }).notificationSettings)
        : [],
    ),
    stockThresholdSettings: resolveStockThresholdSettings(
      (parsed as { stockThresholdSettings?: unknown }).stockThresholdSettings,
    ),
    priceMarginSettings: resolvePriceMarginSettings(
      (parsed as { priceMarginSettings?: unknown }).priceMarginSettings,
    ),
    paymentMethodSettings: resolvePaymentMethodSettings(
      (parsed as { paymentMethodSettings?: unknown }).paymentMethodSettings,
    ),
    taxSettings: resolveTaxSettings((parsed as { taxSettings?: unknown }).taxSettings),
  };
  syncFinancialData(db);
  return db;
}

async function writeDb(db: MockDb, store?: DataStoreRecord) {
  const targetStore = store || (await getActiveDataStore());
  await ensureDbFile(targetStore);
  syncFinancialData(db);
  await writeFile(targetStore.dbPath, JSON.stringify(db, null, 2) + "\n", "utf8");
}

function buildClearedOperationalDb(db: MockDb): MockDb {
  return {
    ...db,
    products: [],
    productPrices: [],
    ingredients: [],
    menuProducts: [],
    deleteRequests: [],
    requests: [],
    stocks: [],
    orders: [],
    invoices: [],
    workdays: [],
    supplyOrders: [],
    expenses: [],
    feedbackEntries: [],
    financialAccounts: [],
    financialTransactions: [],
    licenses: [],
    notifications: [],
  };
}

function normalizeBarcodeValue(value: string | undefined) {
  return String(value || "").trim();
}

function findProductByBarcode(db: MockDb, barcode: string, excludeProductId?: string) {
  const normalized = normalizeBarcodeValue(barcode);
  if (!normalized) return undefined;
  return db.products.find(
    (item) => normalizeBarcodeValue(item.barcode) === normalized && (!excludeProductId || item.id !== excludeProductId),
  );
}

function buildSupplyOrderItemsFromDraft(
  db: MockDb,
  items: Array<{ productId: string; quantity: number }>,
): SupplyOrderItem[] {
  const mergedByProductId = new Map<string, SupplyOrderItem>();

  for (const item of items) {
    const productId = String(item.productId || "").trim();
    const quantity = Math.trunc(Number(item.quantity));
    if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Invalid supply order item");
    }

    const product = db.products.find((node) => node.id === productId);
    if (!product) {
      throw new Error(`Product not found for supply order item: ${productId}`);
    }

    const existing = mergedByProductId.get(productId);
    const nextQuantity = (existing?.quantity || 0) + quantity;
    mergedByProductId.set(productId, {
      productId: product.id,
      productName: product.name,
      quantity: nextQuantity,
      barcode: product.barcode,
      brand: product.brand,
      category: product.category,
      receivedQuantity: existing?.receivedQuantity,
      missingQuantity: existing?.missingQuantity,
      expirationDate: existing?.expirationDate,
    });
  }

  return [...mergedByProductId.values()];
}

function createStockEntryRecord(
  db: MockDb,
  body: {
    productId: string;
    manufactureDate?: string;
    expirationDate?: string;
    quantity: number;
    description?: string;
    supplyOrderId?: string;
    costPrice?: number;
    salePrice?: number;
  },
  options?: { createdAt?: string },
): StockEntry {
  if (!body.productId) {
    throw new Error("Invalid stock entry: productId");
  }
  if (!Number.isFinite(body.quantity) || body.quantity === 0) {
    throw new Error("Invalid stock entry: quantity must be non-zero");
  }

  const product = db.products.find((item) => item.id === body.productId);
  if (body.quantity > 0 && !body.expirationDate) {
    throw new Error("Invalid stock entry: expirationDate required");
  }
  if (body.supplyOrderId) {
    const supplyOrder = db.supplyOrders.find((item) => item.id === body.supplyOrderId);
    if (!supplyOrder || supplyOrder.status !== "received") {
      throw new Error("Invalid stock entry: supplyOrderId must be a received order");
    }
  }

  const rawCostPrice = Number(body.costPrice);
  const rawSalePrice = Number(body.salePrice);
  const normalizedCostPrice = Number.isFinite(rawCostPrice) && rawCostPrice > 0 ? Math.trunc(rawCostPrice) : undefined;
  const normalizedSalePrice = Number.isFinite(rawSalePrice) && rawSalePrice > 0 ? Math.trunc(rawSalePrice) : undefined;

  const entry: StockEntry = {
    id: buildEntityId("se"),
    productId: body.productId,
    manufactureDate: body.manufactureDate,
    expirationDate: body.expirationDate,
    quantity: Math.trunc(body.quantity),
    description: body.description,
    supplyOrderId: body.supplyOrderId,
    costPrice: normalizedCostPrice,
    salePrice: normalizedSalePrice,
    createdAt: options?.createdAt || new Date().toISOString(),
  };

  db.stocks.unshift(entry);
  if (product && entry.supplyOrderId) {
    const productIndex = db.products.findIndex((item) => item.id === product.id);
    if (productIndex >= 0) {
      db.products[productIndex] = {
        ...db.products[productIndex],
        supplyOrderId: entry.supplyOrderId,
      };
    }
  }

  createDurationNotification(db, {
    type: "stock-created",
    title: `Ingreso de stock: ${product?.name || entry.productId}`,
    description: `Se registro un ingreso de ${entry.quantity} unidades para ${product?.name || entry.productId}.`,
    createdAt: entry.createdAt,
    category: product?.category,
    entityType: "stock",
    entityId: entry.id,
  });
  if (entry.expirationDate) {
    createExpirationNotification(db, {
      type: "product-expiring",
      title: `Producto por vencer: ${product?.name || entry.productId}`,
      description: `Lote con vencimiento ${entry.expirationDate} para ${product?.name || entry.productId}.`,
      expirationDate: entry.expirationDate,
      category: product?.category,
      entityType: "stock",
      entityId: entry.id,
    });
  }
  syncLowStockNotificationForProduct(db, entry.productId);
  return entry;
}

function normalizeExpenseRecord(input: unknown): Expense | null {
  const draft = input as Partial<Expense> & {
    status?: unknown;
    assignedAmount?: unknown;
    confirmedAmount?: unknown;
    confirmedBy?: unknown;
    confirmedAt?: unknown;
    confirmationComment?: unknown;
    amountMode?: unknown;
  };
  const id = String(draft.id || "").trim();
  const description = String(draft.description || "").trim();
  const rawAmount = Math.trunc(Number(draft.amount));
  const typeValue = String(draft.expenseType || "").trim().toLowerCase();
  const expenseType = typeValue === "recurrent" || typeValue === "unexpected" ? (typeValue as ExpenseType) : undefined;
  if (!id || !description || !expenseType || !Number.isFinite(rawAmount) || rawAmount <= 0) return null;

  const statusValue = String(draft.status || "").trim().toLowerCase();
  const status =
    statusValue === "pending-confirmation" || statusValue === "confirmed"
      ? (statusValue as ExpenseStatus)
      : "confirmed";

  const assignedAmountRaw = Math.trunc(Number(draft.assignedAmount));
  const assignedAmount = Number.isFinite(assignedAmountRaw) && assignedAmountRaw > 0 ? assignedAmountRaw : rawAmount;
  const confirmedAmountRaw = Math.trunc(Number(draft.confirmedAmount));
  const confirmedAmount =
    status === "confirmed"
      ? Number.isFinite(confirmedAmountRaw) && confirmedAmountRaw > 0
        ? confirmedAmountRaw
        : rawAmount
      : undefined;

  const amountModeValue = String(draft.amountMode || "").trim().toLowerCase();
  const amountMode =
    amountModeValue === "assigned" || amountModeValue === "different"
      ? (amountModeValue as ExpenseAmountMode)
      : confirmedAmount && confirmedAmount !== assignedAmount
        ? "different"
        : "assigned";

  return {
    id,
    description,
    amount: status === "confirmed" ? confirmedAmount || rawAmount : assignedAmount,
    assignedAmount,
    expenseType,
    invoiceImageUrl: String(draft.invoiceImageUrl || "").trim() || undefined,
    unexpectedImageUrl: String(draft.unexpectedImageUrl || "").trim() || undefined,
    createdBy: String(draft.createdBy || "").trim() || "operator",
    createdAt: String(draft.createdAt || "").trim() || new Date().toISOString(),
    status,
    confirmedAmount,
    confirmedBy:
      status === "confirmed" ? String(draft.confirmedBy || "").trim() || String(draft.createdBy || "").trim() || "operator" : undefined,
    confirmedAt: status === "confirmed" ? String(draft.confirmedAt || "").trim() || String(draft.createdAt || "").trim() || new Date().toISOString() : undefined,
    confirmationComment: String(draft.confirmationComment || "").trim() || undefined,
    amountMode,
  };
}

function normalizeSupplyOrderItemRecord(input: unknown): SupplyOrderItem | null {
  const draft = input as Partial<SupplyOrderItem> & {
    quantity?: unknown;
    receivedQuantity?: unknown;
    missingQuantity?: unknown;
  };
  const productId = String(draft.productId || "").trim();
  const productName = String(draft.productName || "").trim();
  const quantity = Math.max(0, Math.trunc(Number(draft.quantity)));
  if (!productId || !productName || quantity <= 0) return null;

  const receivedQuantityRaw = Math.trunc(Number(draft.receivedQuantity));
  const missingQuantityRaw = Math.trunc(Number(draft.missingQuantity));
  const receivedQuantity =
    Number.isFinite(receivedQuantityRaw) && receivedQuantityRaw >= 0
      ? Math.min(quantity, receivedQuantityRaw)
      : undefined;
  const missingQuantity =
    Number.isFinite(missingQuantityRaw) && missingQuantityRaw >= 0
      ? Math.min(quantity, missingQuantityRaw)
      : typeof receivedQuantity === "number"
        ? Math.max(0, quantity - receivedQuantity)
        : undefined;

  return {
    productId,
    productName,
    quantity,
    barcode: String(draft.barcode || "").trim() || undefined,
    brand: String(draft.brand || "").trim() || undefined,
    category: normalizeCategory(draft.category),
    receivedQuantity,
    missingQuantity,
    expirationDate: String(draft.expirationDate || "").trim() || undefined,
  };
}

function normalizeSupplyOrderRecord(input: unknown): SupplyOrder | null {
  const draft = input as Partial<SupplyOrder> & {
    status?: unknown;
    actualTotal?: unknown;
    remainingAmount?: unknown;
    items?: unknown[];
  };
  const id = String(draft.id || "").trim();
  const supplierName = String(draft.supplierName || "").trim();
  const expectedTotal = Math.trunc(Number(draft.expectedTotal));
  if (!id || !supplierName || !Number.isFinite(expectedTotal) || expectedTotal <= 0) return null;

  const statusRaw = String(draft.status || "").trim().toLowerCase();
  const status = statusRaw === "received" ? "received" : "pending";

  return {
    id,
    supplierName,
    description: String(draft.description || "").trim(),
    expectedTotal,
    items: Array.isArray(draft.items)
      ? draft.items.map((item) => normalizeSupplyOrderItemRecord(item)).filter((item): item is SupplyOrderItem => !!item)
      : [],
    createdAt: String(draft.createdAt || "").trim() || new Date().toISOString(),
    createdBy: String(draft.createdBy || "").trim() || "operator",
    status,
    isExactAmount: typeof draft.isExactAmount === "boolean" ? draft.isExactAmount : undefined,
    actualTotal:
      status === "received" && Number.isFinite(Number(draft.actualTotal))
        ? Math.max(0, Math.trunc(Number(draft.actualTotal)))
        : undefined,
    remainingAmount:
      status === "received" && Number.isFinite(Number(draft.remainingAmount))
        ? Math.max(0, Math.trunc(Number(draft.remainingAmount)))
        : undefined,
    receivedAt: status === "received" ? String(draft.receivedAt || "").trim() || undefined : undefined,
    receivedBy: status === "received" ? String(draft.receivedBy || "").trim() || undefined : undefined,
    invoiceImageUrl: status === "received" ? String(draft.invoiceImageUrl || "").trim() || undefined : undefined,
    receiveComment: status === "received" ? String(draft.receiveComment || "").trim() || undefined : undefined,
  };
}

function normalizeFeedbackEntryRecord(input: unknown): FeedbackEntry | null {
  const draft = input as Partial<FeedbackEntry> & {
    type?: unknown;
    isAnonymous?: unknown;
    createdByRole?: unknown;
  };
  const id = String(draft.id || "").trim();
  const message = String(draft.message || "").trim();
  const typeValue = String(draft.type || "").trim().toLowerCase();
  const type = typeValue === "suggestion" || typeValue === "claim" ? (typeValue as FeedbackType) : undefined;
  const createdByRoleValue = String(draft.createdByRole || "").trim().toLowerCase();
  const createdByRole =
    createdByRoleValue === "admin" || createdByRoleValue === "operator"
      ? (createdByRoleValue as FeedbackAuthorRole)
      : "operator";

  if (!id || !message || !type) return null;

  return {
    id,
    type,
    message,
    isAnonymous: Boolean(draft.isAnonymous),
    createdAt: String(draft.createdAt || "").trim() || new Date().toISOString(),
    createdBy: String(draft.createdBy || "").trim() || "operator",
    createdByRole,
  };
}

function getFinancialAccountDefinition(accountId: string) {
  return FINANCIAL_ACCOUNT_DEFINITIONS.find((item) => item.id === accountId) || FINANCIAL_ACCOUNT_DEFINITIONS[0];
}

function sanitizeMoneyAmount(value: number | undefined) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(Number(value || 0)));
}

function buildFinancialTransactionRecord(
  draft: Omit<FinancialTransaction, "accountCode" | "accountName">,
): FinancialTransaction {
  const account = getFinancialAccountDefinition(draft.accountId);
  return {
    ...draft,
    amount: sanitizeMoneyAmount(draft.amount),
    accountCode: account.code,
    accountName: account.name,
  };
}

function buildFinancialTransactions(db: MockDb): FinancialTransaction[] {
  const orderToWorkday = new Map<string, string>();
  const transactions: FinancialTransaction[] = [];

  for (const workday of db.workdays) {
    for (const orderId of workday.orderIds) {
      if (!orderToWorkday.has(orderId)) orderToWorkday.set(orderId, workday.id);
    }
  }

  for (const order of db.orders) {
    if (order.status !== "pagada") continue;
    const workdayId = orderToWorkday.get(order.id);
    const saleTotal = sanitizeMoneyAmount(order.total);

    transactions.push(
      buildFinancialTransactionRecord({
        id: `txn-sale-income-${order.id}`,
        createdAt: order.createdAt,
        type: "sale-income",
        title: `Venta pagada ${order.id}`,
        description: `Venta registrada por ${order.operator} por ${saleTotal}.`,
        amount: saleTotal,
        direction: "in",
        entryKind: "credit",
        accountId: "account-gains",
        referenceModule: "sale",
        referenceId: order.id,
        orderId: order.id,
        workdayId,
        paymentMethod: order.paymentMethod,
        actor: order.operator,
        countsInBalance: true,
      }),
    );

    if (order.paymentMethod === "efectivo") {
      transactions.push(
        buildFinancialTransactionRecord({
          id: `txn-sale-cash-${order.id}`,
          createdAt: order.createdAt,
          type: "sale-cash",
          title: `Ingreso en caja por venta ${order.id}`,
          description: `Venta en efectivo cobrada por ${order.operator}.`,
          amount: saleTotal,
          direction: "in",
          entryKind: "credit",
          accountId: "account-cash-local",
          referenceModule: "sale",
          referenceId: order.id,
          orderId: order.id,
          workdayId,
          paymentMethod: order.paymentMethod,
          actor: order.operator,
          countsInBalance: true,
        }),
      );
    }

  }

  for (const expense of db.expenses) {
    if (expense.status !== "confirmed") continue;
    const confirmedAmount = sanitizeMoneyAmount(expense.confirmedAmount || expense.amount);
    const actor = expense.confirmedBy || expense.createdBy;
    const createdAt = expense.confirmedAt || expense.createdAt;

    transactions.push(
      buildFinancialTransactionRecord({
        id: `txn-expense-payment-${expense.id}`,
        createdAt,
        type: "expense-payment",
        title: `Gasto confirmado ${expense.id}`,
        description: expense.description,
        amount: confirmedAmount,
        direction: "out",
        entryKind: "debit",
        accountId: "account-expenses",
        referenceModule: "expense",
        referenceId: expense.id,
        expenseId: expense.id,
        actor,
        countsInBalance: true,
      }),
    );

    transactions.push(
      buildFinancialTransactionRecord({
        id: `txn-expense-cash-${expense.id}`,
        createdAt,
        type: "expense-cash",
        title: `Salida de caja por gasto ${expense.id}`,
        description: `Pago asociado al gasto ${expense.description}.`,
        amount: confirmedAmount,
        direction: "out",
        entryKind: "debit",
        accountId: "account-cash-local",
        referenceModule: "expense",
        referenceId: expense.id,
        expenseId: expense.id,
        actor,
        countsInBalance: true,
      }),
    );
  }

  for (const order of db.supplyOrders) {
    if (order.status !== "received") continue;
    const actualTotal = sanitizeMoneyAmount(order.actualTotal);
    const receivedAt = order.receivedAt || order.createdAt;

    if (actualTotal > 0) {
      transactions.push(
        buildFinancialTransactionRecord({
          id: `txn-supply-payment-${order.id}`,
          createdAt: receivedAt,
          type: "supply-payment",
          title: `Pago de mercaderia ${order.id}`,
          description: `${order.supplierName} - ${order.description}`,
          amount: actualTotal,
          direction: "out",
          entryKind: "debit",
          accountId: "account-expenses",
          referenceModule: "supply",
          referenceId: order.id,
          supplyOrderId: order.id,
          actor: order.receivedBy || order.createdBy,
          countsInBalance: true,
        }),
      );

      transactions.push(
        buildFinancialTransactionRecord({
          id: `txn-supply-cash-${order.id}`,
          createdAt: receivedAt,
          type: "supply-cash",
          title: `Salida de caja por mercaderia ${order.id}`,
          description: `Pago en recepcion de mercaderia para ${order.supplierName}.`,
          amount: actualTotal,
          direction: "out",
          entryKind: "debit",
          accountId: "account-cash-local",
          referenceModule: "supply",
          referenceId: order.id,
          supplyOrderId: order.id,
          actor: order.receivedBy || order.createdBy,
          countsInBalance: true,
        }),
      );
    }

    const remainingAmount = sanitizeMoneyAmount(order.remainingAmount);
    if (remainingAmount > 0) {
      transactions.push(
        buildFinancialTransactionRecord({
          id: `txn-supply-return-${order.id}`,
          createdAt: receivedAt,
          type: "supply-return",
          title: `Vuelto por mercaderia ${order.id}`,
          description: `Monto devuelto tras la recepcion de ${order.supplierName}.`,
          amount: remainingAmount,
          direction: "in",
          entryKind: "credit",
          accountId: "account-cash-local",
          referenceModule: "supply",
          referenceId: order.id,
          supplyOrderId: order.id,
          actor: order.receivedBy || order.createdBy,
          countsInBalance: true,
        }),
      );
    }
  }

  for (const workday of db.workdays) {
    const openingAmount = sanitizeMoneyAmount(workday.openingDeclaredAmount);
    if (openingAmount > 0) {
      transactions.push(
        buildFinancialTransactionRecord({
          id: `txn-cash-opening-${workday.id}`,
          createdAt: workday.startedAt,
          type: "cash-opening",
          title: `Apertura de caja ${workday.id}`,
          description: `Apertura declarada por ${workday.operator}.`,
          amount: openingAmount,
          direction: "in",
          entryKind: "credit",
          accountId: "account-cash-local",
          referenceModule: "cash",
          referenceId: workday.id,
          workdayId: workday.id,
          actor: workday.operator,
          countsInBalance: true,
        }),
      );
    }

    const closingAmount = sanitizeMoneyAmount(workday.closeSummary?.declaredClosingCash);
    const closedAt = workday.endedAt || workday.closeRequestedAt;
    if (closingAmount > 0 && closedAt) {
      transactions.push(
        buildFinancialTransactionRecord({
          id: `txn-cash-close-${workday.id}`,
          createdAt: closedAt,
          type: "cash-close",
          title: `Cierre de caja ${workday.id}`,
          description: `Se dejo ${closingAmount} al cerrar la jornada ${workday.id}.`,
          amount: closingAmount,
          direction: "out",
          entryKind: "debit",
          accountId: "account-cash-local",
          referenceModule: "cash",
          referenceId: workday.id,
          workdayId: workday.id,
          actor: workday.operator,
          countsInBalance: false,
        }),
      );
    }
  }

  return transactions.sort((a, b) => {
    const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id);
  });
}

function syncFinancialData(db: MockDb) {
  db.expenses = db.expenses.map((item) => normalizeExpenseRecord(item)).filter((item): item is Expense => !!item);

  const previousAccounts = new Map(db.financialAccounts.map((item) => [item.id, item]));
  const transactions = buildFinancialTransactions(db);
  const balances = new Map<string, number>();
  const now = new Date().toISOString();

  for (const definition of FINANCIAL_ACCOUNT_DEFINITIONS) {
    balances.set(definition.id, 0);
  }

  for (const transaction of transactions) {
    if (!transaction.countsInBalance) continue;
    const current = balances.get(transaction.accountId) || 0;
    const signedAmount =
      transaction.direction === "in"
        ? sanitizeMoneyAmount(transaction.amount)
        : -sanitizeMoneyAmount(transaction.amount);
    balances.set(transaction.accountId, current + signedAmount);
  }

  db.financialAccounts = FINANCIAL_ACCOUNT_DEFINITIONS.map((definition) => ({
    ...definition,
    currentBalance: Math.trunc(balances.get(definition.id) || 0),
    createdAt: previousAccounts.get(definition.id)?.createdAt || now,
    updatedAt: now,
  }));
  db.financialTransactions = transactions;
}

function normalizeCategory(value: unknown): Product["category"] | undefined {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "no perecedero" || raw === "vivere") return "bebida";
  if (raw === "combo") return "combos";
  if (
    raw === "bebida" ||
    raw === "hamburguesa" ||
    raw === "pancho" ||
    raw === "combos" ||
    raw === "pollo" ||
    raw === "vegano"
  ) {
    return raw;
  }
  return undefined;
}

function normalizeProductRecord(input: unknown): Product | null {
  const draft = input as Partial<Product>;
  const id = String(draft.id || "").trim();
  const name = String(draft.name || "").trim();
  const price = Math.trunc(Number(draft.price));
  if (!id || !name || !Number.isFinite(price) || price <= 0) return null;
  const category = normalizeCategory(draft.category) || "bebida";
  const rawCostPrice = Math.trunc(Number(draft.costPrice));
  const costPrice = Number.isFinite(rawCostPrice) && rawCostPrice > 0 ? rawCostPrice : price;
  return {
    id,
    name,
    price,
    costPrice,
    createdAt: String(draft.createdAt || "").trim() || new Date().toISOString(),
    imageUrl: String(draft.imageUrl || "").trim() || undefined,
    barcode: String(draft.barcode || "").trim() || undefined,
    brand: String(draft.brand || "").trim() || undefined,
    category,
    supplyOrderId: String(draft.supplyOrderId || "").trim() || undefined,
  };
}

function normalizeIngredientStockMode(value: unknown): IngredientStockMode {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "weight" || raw === "package" || raw === "unit") return raw;
  return "unit";
}

function normalizeIngredientRecord(input: unknown): Ingredient | null {
  const draft = (input || {}) as Partial<Ingredient>;
  const id = String(draft.id || "").trim();
  const name = String(draft.name || "").trim();
  if (!id || !name) return null;

  return {
    id,
    name,
    expiresInDays: Math.max(0, Math.trunc(Number(draft.expiresInDays) || 0)),
    stockMode: normalizeIngredientStockMode(draft.stockMode),
    stockQuantity: Math.max(0, Number(draft.stockQuantity) || 0),
    createdAt: String(draft.createdAt || "").trim() || new Date().toISOString(),
    updatedAt: String(draft.updatedAt || "").trim() || undefined,
    lastEntryAt: String(draft.lastEntryAt || "").trim() || undefined,
    nextExpirationDate: String(draft.nextExpirationDate || "").trim() || undefined,
  };
}

function normalizeMenuRecipeItems(input: unknown, ingredients: Ingredient[]): MenuRecipeItem[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      const draft = (item || {}) as Partial<MenuRecipeItem>;
      const ingredientId = String(draft.ingredientId || "").trim();
      const ingredient = ingredients.find((node) => node.id === ingredientId);
      const quantity = Number(draft.quantity);
      if (!ingredient || !Number.isFinite(quantity) || quantity <= 0) return null;
      return {
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        quantity,
        stockMode: ingredient.stockMode,
      };
    })
    .filter((item): item is MenuRecipeItem => !!item);
}

function normalizeMenuProductRecord(input: unknown, ingredients: Ingredient[]): MenuProduct | null {
  const draft = (input || {}) as Partial<MenuProduct>;
  const id = String(draft.id || "").trim();
  const name = String(draft.name || "").trim();
  const price = Math.max(0, Math.trunc(Number(draft.price) || 0));
  const recipeItems = normalizeMenuRecipeItems(draft.recipeItems, ingredients);
  if (!id || !name || recipeItems.length === 0) return null;

  return {
    id,
    name,
    price,
    description: String(draft.description || "").trim() || undefined,
    imageUrl: String(draft.imageUrl || "").trim() || undefined,
    category: normalizeCategory(draft.category) || "hamburguesa",
    recipeItems,
    createdAt: String(draft.createdAt || "").trim() || new Date().toISOString(),
    updatedAt: String(draft.updatedAt || "").trim() || undefined,
  };
}

function buildIngredientExpirationDate(expiresInDays: number, inputDate = new Date()): string {
  const date = new Date(inputDate);
  date.setDate(date.getDate() + Math.max(0, Math.trunc(expiresInDays)));
  return date.toISOString().slice(0, 10);
}

function computeDurationDays(issueDate?: string, expirationDate?: string): number | undefined {
  if (!issueDate || !expirationDate) return undefined;
  const fromMs = new Date(issueDate).getTime();
  const toMs = new Date(expirationDate).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return undefined;
  return Math.floor((toMs - fromMs) / ONE_DAY_MS);
}

function resolveLicenseStatus(issueDate?: string, expirationDate?: string): LicenseStatus {
  if (!issueDate || !expirationDate) return "pending-renewal";
  const expiresAtMs = new Date(expirationDate).getTime();
  if (!Number.isFinite(expiresAtMs)) return "pending-renewal";
  if (expiresAtMs < Date.now()) return "expired";
  return "active";
}

function sanitizeLicenseDraft(input: unknown): {
  name: string;
  description: string;
  category?: Product["category"];
  issueDate?: string;
  expirationDate?: string;
  contactEmail?: string;
  contactPhone?: string;
  sourceAddress?: string;
} {
  const obj = (input || {}) as {
    name?: unknown;
    description?: unknown;
    category?: unknown;
    issueDate?: unknown;
    expirationDate?: unknown;
    contactEmail?: unknown;
    contactPhone?: unknown;
    sourceAddress?: unknown;
  };
  return {
    name: String(obj.name || "").trim(),
    description: String(obj.description || "").trim(),
    category: normalizeCategory(obj.category),
    issueDate: String(obj.issueDate || "").trim() || undefined,
    expirationDate: String(obj.expirationDate || "").trim() || undefined,
    contactEmail: String(obj.contactEmail || "").trim() || undefined,
    contactPhone: String(obj.contactPhone || "").trim() || undefined,
    sourceAddress: String(obj.sourceAddress || "").trim() || undefined,
  };
}

function sanitizeLicenseIssuanceDraft(input: unknown): { issuedAt: string; expiresAt: string; notes?: string } {
  const obj = (input || {}) as { issuedAt?: unknown; expiresAt?: unknown; notes?: unknown };
  return {
    issuedAt: String(obj.issuedAt || "").trim(),
    expiresAt: String(obj.expiresAt || "").trim(),
    notes: String(obj.notes || "").trim() || undefined,
  };
}

function isNotificationType(value: string): value is NotificationType {
  return Object.prototype.hasOwnProperty.call(notificationTypeDefaults, value);
}

function normalizeNotificationStatus(value: unknown): NotificationStatus {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "disabled") return "disabled";
  if (raw === "received") return "received";
  return "active";
}

function resolveNotificationSettings(input: unknown[]): NotificationSetting[] {
  const byType = new Map<NotificationType, NotificationSetting>();
  for (const type of Object.keys(notificationTypeDefaults) as NotificationType[]) {
    byType.set(type, { ...notificationTypeDefaults[type] });
  }
  for (const item of input) {
    const draft = item as Partial<NotificationSetting> & { type?: unknown };
    const type = String(draft.type || "").trim().toLowerCase();
    if (!isNotificationType(type)) continue;
    const current = byType.get(type);
    if (!current) continue;
    byType.set(type, {
      type,
      leadDays: Number.isFinite(Number(draft.leadDays)) ? Math.max(0, Math.trunc(Number(draft.leadDays))) : current.leadDays,
      durationDays: Number.isFinite(Number(draft.durationDays))
        ? Math.max(0, Math.trunc(Number(draft.durationDays)))
        : current.durationDays,
    });
  }
  return [...byType.values()];
}

function resolveStockThresholdSettings(input: unknown): StockThresholdSettings {
  const raw = (input || {}) as {
    categoryThresholds?: Record<string, unknown>;
    productThresholds?: unknown[];
  };
  const categoryThresholds = { ...defaultDb.stockThresholdSettings.categoryThresholds };
  const rawCategories = raw.categoryThresholds || {};
  for (const category of Object.keys(categoryThresholds) as (keyof typeof categoryThresholds)[]) {
    const value = Number(rawCategories[category]);
    if (Number.isFinite(value)) {
      categoryThresholds[category] = Math.max(10, Math.trunc(value));
    }
  }

  const productThresholds = Array.isArray(raw.productThresholds)
    ? raw.productThresholds
        .map((item) => {
          const node = item as { productId?: unknown; minUnits?: unknown };
          const productId = String(node.productId || "").trim();
          const minUnits = Math.max(10, Math.trunc(Number(node.minUnits)));
          if (!productId || !Number.isFinite(minUnits)) return null;
          return { productId, minUnits } as StockThresholdByProduct;
        })
        .filter((item): item is StockThresholdByProduct => !!item)
    : [];

  return {
    categoryThresholds,
    productThresholds,
  };
}

function resolvePriceMarginSettings(input: unknown): PriceMarginSettings {
  const raw = (input || {}) as {
    categoryMargins?: Record<string, unknown>;
    productMargins?: unknown[];
    categoryMarginHistory?: unknown[];
    productMarginHistory?: unknown[];
  };
  const categoryMargins = { ...defaultDb.priceMarginSettings.categoryMargins };
  const rawCategories = raw.categoryMargins || {};
  for (const category of Object.keys(categoryMargins) as (keyof typeof categoryMargins)[]) {
    const value = Number(rawCategories[category]);
    if (Number.isFinite(value)) {
      categoryMargins[category] = normalizeMarginPercent(value);
    }
  }

  const productMargins = Array.isArray(raw.productMargins)
    ? raw.productMargins
        .map((item) => {
          const node = item as { productId?: unknown; marginPercent?: unknown };
          const productId = String(node.productId || "").trim();
          const marginPercent = normalizeMarginPercent(Number(node.marginPercent));
          if (!productId) return null;
          return { productId, marginPercent } as PriceMarginByProduct;
        })
        .filter((item): item is PriceMarginByProduct => !!item)
    : [];

  const categoryMarginHistory = Array.isArray(raw.categoryMarginHistory)
    ? raw.categoryMarginHistory
        .map((item) => {
          const node = item as {
            id?: unknown;
            category?: unknown;
            previousMarginPercent?: unknown;
            marginPercent?: unknown;
            createdAt?: unknown;
          };
          const category = normalizeCategory(node.category);
          if (!category) return null;
          const previousMarginPercent = Number(node.previousMarginPercent);
          const marginPercent = Number(node.marginPercent);
          if (!Number.isFinite(previousMarginPercent) || !Number.isFinite(marginPercent)) return null;
          return {
            id: String(node.id || buildEntityId("cmh")),
            category,
            previousMarginPercent: normalizeMarginPercent(previousMarginPercent),
            marginPercent: normalizeMarginPercent(marginPercent),
            createdAt: String(node.createdAt || "").trim() || new Date().toISOString(),
          } as CategoryPriceMarginHistoryEntry;
        })
        .filter((item): item is CategoryPriceMarginHistoryEntry => !!item)
    : [];

  const productMarginHistory = Array.isArray(raw.productMarginHistory)
    ? raw.productMarginHistory
        .map((item) => {
          const node = item as {
            id?: unknown;
            productId?: unknown;
            previousMarginPercent?: unknown;
            marginPercent?: unknown;
            createdAt?: unknown;
          };
          const productId = String(node.productId || "").trim();
          if (!productId) return null;
          const previousRaw = node.previousMarginPercent;
          const marginRaw = node.marginPercent;
          const previousNumber = Number(previousRaw);
          const marginNumber = Number(marginRaw);
          const previousMarginPercent =
            previousRaw === null || typeof previousRaw === "undefined"
              ? null
              : Number.isFinite(previousNumber)
                ? normalizeMarginPercent(previousNumber)
                : null;
          const marginPercent =
            marginRaw === null || typeof marginRaw === "undefined"
              ? null
              : Number.isFinite(marginNumber)
                ? normalizeMarginPercent(marginNumber)
                : null;
          if (previousRaw !== null && typeof previousRaw !== "undefined" && previousMarginPercent === null) return null;
          if (marginRaw !== null && typeof marginRaw !== "undefined" && marginPercent === null) return null;
          return {
            id: String(node.id || buildEntityId("pmh")),
            productId,
            previousMarginPercent,
            marginPercent,
            createdAt: String(node.createdAt || "").trim() || new Date().toISOString(),
          } as ProductPriceMarginHistoryEntry;
        })
        .filter((item): item is ProductPriceMarginHistoryEntry => !!item)
    : [];

  return {
    categoryMargins,
    productMargins,
    categoryMarginHistory,
    productMarginHistory,
  };
}

function isPaymentMethodValue(value: string): value is PaymentMethod {
  return value === "efectivo" || value === "tarjeta debito" || value === "tarjeta credito" || value === "mercadopago";
}

function resolvePaymentMethodSettings(input: unknown): PaymentMethodSettings {
  const defaults = defaultDb.paymentMethodSettings.methods;
  const raw = (input || {}) as { methods?: unknown[] };
  const map = new Map<PaymentMethod, PaymentMethodAdjustment>();

  for (const base of defaults) {
    map.set(base.method, { ...base });
  }

  if (Array.isArray(raw.methods)) {
    for (const entry of raw.methods) {
      const node = entry as { method?: unknown; discountPercent?: unknown; surchargePercent?: unknown };
      const method = String(node.method || "").trim().toLowerCase();
      if (!isPaymentMethodValue(method)) continue;
      map.set(method, {
        method,
        discountPercent: normalizeMarginPercent(Number(node.discountPercent)),
        surchargePercent: normalizeMarginPercent(Number(node.surchargePercent)),
      });
    }
  }

  return {
    methods: defaultDb.paymentMethodSettings.methods.map((item) => map.get(item.method) || item),
  };
}

function resolveTaxSettings(input: unknown): TaxSettings {
  const raw = (input || {}) as { ivaPercent?: unknown; mode?: unknown };
  const modeRaw = String(raw.mode || "").trim().toLowerCase();
  return {
    ivaPercent: normalizeMarginPercent(Number(raw.ivaPercent)),
    mode: modeRaw === "add_to_total" || modeRaw === "show_only" ? (modeRaw as TaxMode) : defaultDb.taxSettings.mode,
  };
}

function buildPaymentTotals(): Record<PaymentMethod, number> {
  return {
    efectivo: 0,
    "tarjeta debito": 0,
    "tarjeta credito": 0,
    mercadopago: 0,
  };
}

function normalizeWorkdayStatus(value: unknown, endedAt?: string): "open" | "pending-close" | "closed" {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "open" || raw === "pending-close" || raw === "closed") return raw;
  return endedAt ? "closed" : "open";
}

function normalizeWorkdayAuditChecks(input: unknown): WorkdayAuditChecks {
  const raw = (input || {}) as Partial<WorkdayAuditChecks>;
  return {
    openingAmount: raw.openingAmount !== false,
    cashSales: raw.cashSales !== false,
    expenses: raw.expenses !== false,
    supplyReturns: raw.supplyReturns !== false,
    balance: raw.balance !== false,
  };
}

function normalizeWorkdayCloseSummary(input: unknown): WorkdayCloseSummary | undefined {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as Partial<WorkdayCloseSummary> & { totalByPaymentMethod?: unknown };
  const totals = buildPaymentTotals();
  const totalsRaw = (raw.totalByPaymentMethod || {}) as Record<string, unknown>;
  for (const method of Object.keys(totals) as PaymentMethod[]) {
    totals[method] = Math.trunc(Number(totalsRaw[method] || 0));
  }
  return {
    totalSales: Math.trunc(Number(raw.totalSales || 0)),
    totalByPaymentMethod: totals,
    cashSales: Math.trunc(Number(raw.cashSales || 0)),
    totalExpenses: Math.trunc(Number(raw.totalExpenses || 0)),
    totalSupplyReturns: Math.trunc(Number(raw.totalSupplyReturns || 0)),
    expectedClosingCash: Math.trunc(Number(raw.expectedClosingCash || 0)),
    declaredClosingCash: Math.trunc(Number(raw.declaredClosingCash || 0)),
    closingDifference: Math.trunc(Number(raw.closingDifference || 0)),
    balanceTotal: Math.trunc(Number(raw.balanceTotal || 0)),
  };
}

function normalizeWorkdayAdminReview(input: unknown): WorkdayAdminReview | undefined {
  if (!input || typeof input !== "object") return undefined;
  const raw = input as Partial<WorkdayAdminReview>;
  const reviewedBy = String(raw.reviewedBy || "").trim();
  if (!reviewedBy) return undefined;
  return {
    reviewedBy,
    reviewedAt: String(raw.reviewedAt || "").trim() || new Date().toISOString(),
    checks: normalizeWorkdayAuditChecks(raw.checks),
    notes: String(raw.notes || "").trim() || undefined,
    mismatchReport: String(raw.mismatchReport || "").trim() || undefined,
  };
}

function normalizeWorkdayRecord(input: unknown): Workday | null {
  const raw = (input || {}) as Partial<Workday>;
  const id = String(raw.id || "").trim();
  const operator = String(raw.operator || "").trim();
  const startedAt = String(raw.startedAt || "").trim();
  if (!id || !operator || !startedAt) return null;
  const endedAt = String(raw.endedAt || "").trim() || undefined;
  const orderIds = Array.isArray(raw.orderIds)
    ? raw.orderIds.map((idItem) => String(idItem || "").trim()).filter((idItem) => idItem.length > 0)
    : [];
  const openingAssignedAmount = Number(raw.openingAssignedAmount);
  const openingDeclaredAmount = Number(raw.openingDeclaredAmount);
  const openingDifferenceAmount = Number(raw.openingDifferenceAmount);
  return {
    id,
    operator,
    startedAt,
    endedAt,
    orderIds,
    status: normalizeWorkdayStatus(raw.status, endedAt),
    openingAssignedAmount: Number.isFinite(openingAssignedAmount) ? Math.trunc(openingAssignedAmount) : undefined,
    openingDeclaredAmount: Number.isFinite(openingDeclaredAmount) ? Math.trunc(openingDeclaredAmount) : undefined,
    openingDifferenceAmount: Number.isFinite(openingDifferenceAmount) ? Math.trunc(openingDifferenceAmount) : undefined,
    closeRequestedAt: String(raw.closeRequestedAt || "").trim() || undefined,
    closeSummary: normalizeWorkdayCloseSummary(raw.closeSummary),
    adminReview: normalizeWorkdayAdminReview(raw.adminReview),
  };
}

const CASH_SHIFT_WINDOWS: Record<CashShift, { startHour: string; endHour: string }> = {
  diurno: { startHour: "08:00", endHour: "19:59" },
  nocturno: { startHour: "20:00", endHour: "07:59" },
};

function normalizeCashShift(value: unknown): CashShift {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "nocturno" ? "nocturno" : "diurno";
}

function parseTimeMinutes(value: unknown): number | null {
  const raw = String(value || "").trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function normalizeShiftHours(shift: CashShift, startHour: unknown, endHour: unknown): { startHour: string; endHour: string } {
  const fallback = CASH_SHIFT_WINDOWS[shift];
  const startMinutes = parseTimeMinutes(startHour);
  const endMinutes = parseTimeMinutes(endHour);
  if (startMinutes === null || endMinutes === null) {
    return fallback;
  }
  const format = (value: number) => `${String(Math.trunc(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  return { startHour: format(startMinutes), endHour: format(endMinutes) };
}

function isNowWithinRange(startHour: string, endHour: string, now = new Date()): boolean {
  const startMinutes = parseTimeMinutes(startHour);
  const endMinutes = parseTimeMinutes(endHour);
  if (startMinutes === null || endMinutes === null) return true;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

function resolveCashOpeningAssignments(input: unknown[]): CashOpeningAssignment[] {
  const map = new Map<string, CashOpeningAssignment>();
  for (const item of input) {
    const raw = (item || {}) as Partial<CashOpeningAssignment>;
    const operator = String(raw.operator || "").trim();
    const amount = Math.trunc(Number(raw.amount));
    if (!operator || !Number.isFinite(amount) || amount < 0) continue;
    const shift = normalizeCashShift(raw.shift);
    const hours = normalizeShiftHours(shift, raw.startHour, raw.endHour);
    map.set(operator, {
      operator,
      amount,
      shift,
      startHour: hours.startHour,
      endHour: hours.endHour,
      updatedBy: String(raw.updatedBy || "").trim() || "admin",
      updatedAt: String(raw.updatedAt || "").trim() || new Date().toISOString(),
    });
  }
  return [...map.values()].sort((a, b) => a.operator.localeCompare(b.operator));
}

function findCashOpeningAssignment(db: MockDb, operator: string): CashOpeningAssignment | undefined {
  return db.cashOpeningAssignments.find((item) => item.operator === operator);
}

function computeWorkdayCloseSummary(db: MockDb, workday: Workday, declaredClosingCash: number): WorkdayCloseSummary {
  const fromMs = new Date(workday.startedAt).getTime();
  const toIso = workday.closeRequestedAt || new Date().toISOString();
  const toMs = new Date(toIso).getTime();
  const orderIds = new Set(workday.orderIds);
  const paidOrders = db.orders.filter((item) => orderIds.has(item.id) && item.status === "pagada");
  const totalByPaymentMethod = buildPaymentTotals();
  for (const order of paidOrders) {
    const method = order.paymentMethod;
    if (method && isPaymentMethodValue(method)) {
      totalByPaymentMethod[method] += Math.trunc(Number(order.total || 0));
    }
  }
  const totalSales = Object.values(totalByPaymentMethod).reduce((acc, value) => acc + value, 0);
  const cashSales = totalByPaymentMethod.efectivo;
  const totalExpenses = db.expenses
    .filter((item) => {
      if (item.createdBy !== workday.operator) return false;
      const createdAtMs = new Date(item.createdAt).getTime();
      if (!Number.isFinite(createdAtMs)) return false;
      if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return true;
      return createdAtMs >= fromMs && createdAtMs <= toMs;
    })
    .reduce((acc, item) => acc + Math.trunc(Number(item.amount || 0)), 0);
  const totalSupplyReturns = db.supplyOrders
    .filter((item) => {
      if (item.status !== "received") return false;
      if (item.receivedBy !== workday.operator) return false;
      const receivedAtMs = new Date(item.receivedAt || "").getTime();
      if (!Number.isFinite(receivedAtMs)) return false;
      if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return true;
      return receivedAtMs >= fromMs && receivedAtMs <= toMs;
    })
    .reduce((acc, item) => {
      const amount = Math.trunc(Number(item.remainingAmount || 0));
      return acc + (amount > 0 ? amount : 0);
    }, 0);
  const openingDeclaredAmount = Math.trunc(Number(workday.openingDeclaredAmount || 0));
  const expectedClosingCash = openingDeclaredAmount + cashSales + totalSupplyReturns - totalExpenses;
  const balanceTotal = openingDeclaredAmount + totalSales + totalSupplyReturns - totalExpenses;
  const normalizedDeclared = Math.trunc(Number(declaredClosingCash || 0));
  return {
    totalSales,
    totalByPaymentMethod,
    cashSales,
    totalExpenses,
    totalSupplyReturns,
    expectedClosingCash,
    declaredClosingCash: normalizedDeclared,
    closingDifference: normalizedDeclared - expectedClosingCash,
    balanceTotal,
  };
}

function buildWorkdayMismatchReport(workday: Workday, summary: WorkdayCloseSummary, checks: WorkdayAuditChecks): string {
  const lines: string[] = [];
  const openingAssignedAmount = Math.trunc(Number(workday.openingAssignedAmount || 0));
  const openingDeclaredAmount = Math.trunc(Number(workday.openingDeclaredAmount || 0));
  const openingDifferenceAmount = openingDeclaredAmount - openingAssignedAmount;

  if (!checks.openingAmount) {
    if (openingDifferenceAmount !== 0) {
      lines.push(
        `Apertura: asignado ${openingAssignedAmount}, declarado ${openingDeclaredAmount}, ${openingDifferenceAmount > 0 ? "sobro" : "falto"} ${Math.abs(openingDifferenceAmount)}.`,
      );
    } else {
      lines.push(`Apertura: monto revisado manualmente.`);
    }
  }
  if (!checks.cashSales) {
    lines.push(`Ventas en efectivo con diferencia: ${summary.cashSales}.`);
  }
  if (!checks.expenses) {
    lines.push(`Gastos con diferencia: ${summary.totalExpenses}.`);
  }
  if (!checks.supplyReturns) {
    lines.push(`Vuelto de recepcion de mercaderia con diferencia: ${summary.totalSupplyReturns}.`);
  }
  if (!checks.balance || summary.closingDifference !== 0) {
    if (summary.closingDifference !== 0) {
      lines.push(
        `Cierre en efectivo: esperado ${summary.expectedClosingCash}, declarado ${summary.declaredClosingCash}, ${summary.closingDifference > 0 ? "sobro" : "falto"} ${Math.abs(summary.closingDifference)}.`,
      );
    } else if (!checks.balance) {
      lines.push(`Balance general revisado manualmente.`);
    }
  }

  if (!lines.length) return "";
  return `El operador ${workday.operator}, en la jornada ${workday.id}, presenta diferencias. ${lines.join(" ")}`;
}

function normalizeLicenseRecord(input: unknown): LicenseRecord | null {
  const draft = input as Partial<LicenseRecord> & { issuances?: unknown[] };
  const name = String(draft.name || "").trim();
  const description = String(draft.description || "").trim();
  if (!name || !description) return null;
  const issueDate = String(draft.issueDate || "").trim() || undefined;
  const expirationDate = String(draft.expirationDate || "").trim() || undefined;
  const status = resolveLicenseStatus(issueDate, expirationDate);
  const issuances = Array.isArray(draft.issuances)
    ? draft.issuances
        .map((issuance) => {
          const node = issuance as Partial<LicenseIssuance>;
          const issuedAt = String(node.issuedAt || "").trim();
          const expiresAt = String(node.expiresAt || "").trim();
          if (!issuedAt || !expiresAt) return null;
          return {
            id: String(node.id || buildEntityId("li")),
            issuedAt,
            expiresAt,
            createdAt: String(node.createdAt || "").trim() || new Date().toISOString(),
            notes: String(node.notes || "").trim() || undefined,
          } as LicenseIssuance;
        })
        .filter((item): item is LicenseIssuance => !!item)
    : [];

  return {
    id: String(draft.id || buildEntityId("lc")),
    name,
    description,
    category: normalizeCategory(draft.category),
    issueDate,
    expirationDate,
    durationDays: computeDurationDays(issueDate, expirationDate),
    contactEmail: String(draft.contactEmail || "").trim() || undefined,
    contactPhone: String(draft.contactPhone || "").trim() || undefined,
    sourceAddress: String(draft.sourceAddress || "").trim() || undefined,
    status,
    createdAt: String(draft.createdAt || "").trim() || new Date().toISOString(),
    updatedAt: String(draft.updatedAt || "").trim() || new Date().toISOString(),
    issuances,
  };
}

function normalizeNotificationRecord(input: unknown): NotificationRecord | null {
  const draft = input as Partial<NotificationRecord> & { type?: unknown; status?: unknown };
  const typeRaw = String(draft.type || "").trim().toLowerCase();
  if (!isNotificationType(typeRaw)) return null;
  const title = String(draft.title || "").trim();
  const description = String(draft.description || "").trim();
  if (!title || !description) return null;
  return {
    id: String(draft.id || buildEntityId("nt")),
    type: typeRaw,
    title,
    description,
    createdAt: String(draft.createdAt || "").trim() || new Date().toISOString(),
    dueAt: String(draft.dueAt || "").trim() || undefined,
    isFixed: Boolean(draft.isFixed),
    requiresAction: Boolean(draft.requiresAction),
    actionLabel: String(draft.actionLabel || "").trim() || undefined,
    category: normalizeCategory(draft.category),
    entityType: String(draft.entityType || "").trim() || undefined,
    entityId: String(draft.entityId || "").trim() || undefined,
    status: normalizeNotificationStatus(draft.status),
    receivedAt: String(draft.receivedAt || "").trim() || undefined,
    disabledAt: String(draft.disabledAt || "").trim() || undefined,
  };
}

function sanitizeNotificationDraft(input: unknown): {
  type?: NotificationType;
  title: string;
  description: string;
  dueAt?: string;
  isFixed: boolean;
  requiresAction: boolean;
  actionLabel?: string;
  category?: Product["category"];
  entityType?: string;
  entityId?: string;
} {
  const obj = (input || {}) as {
    type?: unknown;
    title?: unknown;
    description?: unknown;
    dueAt?: unknown;
    isFixed?: unknown;
    requiresAction?: unknown;
    actionLabel?: unknown;
    category?: unknown;
    entityType?: unknown;
    entityId?: unknown;
  };
  const typeRaw = String(obj.type || "").trim().toLowerCase();
  return {
    type: isNotificationType(typeRaw) ? typeRaw : undefined,
    title: String(obj.title || "").trim(),
    description: String(obj.description || "").trim(),
    dueAt: String(obj.dueAt || "").trim() || undefined,
    isFixed: Boolean(obj.isFixed),
    requiresAction: Boolean(obj.requiresAction),
    actionLabel: String(obj.actionLabel || "").trim() || undefined,
    category: normalizeCategory(obj.category),
    entityType: String(obj.entityType || "").trim() || undefined,
    entityId: String(obj.entityId || "").trim() || undefined,
  };
}

function sanitizeNotificationUpdateDraft(input: unknown): {
  status?: NotificationStatus;
  title?: string;
  description?: string;
  dueAt?: string;
  isFixed?: boolean;
  requiresAction?: boolean;
} {
  const obj = (input || {}) as {
    status?: unknown;
    title?: unknown;
    description?: unknown;
    dueAt?: unknown;
    isFixed?: unknown;
    requiresAction?: unknown;
  };
  const statusRaw = String(obj.status || "").trim().toLowerCase();
  const status =
    statusRaw === "active" || statusRaw === "disabled" || statusRaw === "received"
      ? (statusRaw as NotificationStatus)
      : undefined;
  return {
    status,
    title: String(obj.title || "").trim() || undefined,
    description: String(obj.description || "").trim() || undefined,
    dueAt: typeof obj.dueAt === "undefined" ? undefined : String(obj.dueAt || "").trim() || undefined,
    isFixed: typeof obj.isFixed === "boolean" ? obj.isFixed : undefined,
    requiresAction: typeof obj.requiresAction === "boolean" ? obj.requiresAction : undefined,
  };
}

function sanitizeNotificationSettingDraft(input: unknown): { leadDays?: number; durationDays?: number } {
  const obj = (input || {}) as { leadDays?: unknown; durationDays?: unknown };
  return {
    leadDays: Number.isFinite(Number(obj.leadDays)) ? Number(obj.leadDays) : undefined,
    durationDays: Number.isFinite(Number(obj.durationDays)) ? Number(obj.durationDays) : undefined,
  };
}

function sanitizeStockThresholdDraft(input: unknown): { minUnits: number } {
  const obj = (input || {}) as { minUnits?: unknown };
  return {
    minUnits: Number(obj.minUnits),
  };
}

function getNotificationSetting(db: MockDb, type: NotificationType): NotificationSetting {
  const found = db.notificationSettings.find((item) => item.type === type);
  if (found) return found;
  const fallback = notificationTypeDefaults[type];
  db.notificationSettings.push({ ...fallback });
  return fallback;
}

function createNotificationRecord(
  db: MockDb,
  draft: {
    type: NotificationType;
    title: string;
    description: string;
    dueAt?: string;
    isFixed?: boolean;
    requiresAction?: boolean;
    actionLabel?: string;
    category?: Product["category"];
    entityType?: string;
    entityId?: string;
    status?: NotificationStatus;
    createdAt?: string;
  },
) {
  const duplicate = db.notifications.find(
    (item) =>
      item.status === "active" &&
      item.type === draft.type &&
      item.entityType === draft.entityType &&
      item.entityId === draft.entityId &&
      item.title === draft.title,
  );
  if (duplicate) return duplicate;
  const createdAt = draft.createdAt || new Date().toISOString();
  const record: NotificationRecord = {
    id: buildEntityId("nt"),
    type: draft.type,
    title: draft.title,
    description: draft.description,
    createdAt,
    dueAt: draft.dueAt,
    isFixed: Boolean(draft.isFixed),
    requiresAction: Boolean(draft.requiresAction),
    actionLabel: draft.actionLabel,
    category: draft.category,
    entityType: draft.entityType,
    entityId: draft.entityId,
    status: draft.status || "active",
    receivedAt: undefined,
    disabledAt: undefined,
  };
  db.notifications.unshift(record);
  return record;
}

function createDurationNotification(
  db: MockDb,
  draft: {
    type: NotificationType;
    title: string;
    description: string;
    createdAt?: string;
    requiresAction?: boolean;
    isFixed?: boolean;
    actionLabel?: string;
    category?: Product["category"];
    entityType?: string;
    entityId?: string;
  },
) {
  const setting = getNotificationSetting(db, draft.type);
  const createdAt = draft.createdAt || new Date().toISOString();
  const createdMs = new Date(createdAt).getTime();
  const dueAt =
    setting.durationDays > 0 && Number.isFinite(createdMs)
      ? new Date(createdMs + setting.durationDays * ONE_DAY_MS).toISOString()
      : undefined;
  return createNotificationRecord(db, {
    ...draft,
    createdAt,
    dueAt,
    requiresAction: typeof draft.requiresAction === "boolean" ? draft.requiresAction : false,
    isFixed: typeof draft.isFixed === "boolean" ? draft.isFixed : false,
  });
}

function createExpirationNotification(
  db: MockDb,
  draft: {
    type: NotificationType;
    title: string;
    description: string;
    expirationDate: string;
    category?: Product["category"];
    entityType?: string;
    entityId?: string;
  },
) {
  const setting = getNotificationSetting(db, draft.type);
  const expirationMs = new Date(draft.expirationDate).getTime();
  if (!Number.isFinite(expirationMs)) return null;
  const dueAt = new Date(expirationMs - setting.leadDays * ONE_DAY_MS).toISOString();
  return createNotificationRecord(db, {
    type: draft.type,
    title: draft.title,
    description: draft.description,
    dueAt,
    isFixed: false,
    requiresAction: true,
    actionLabel: "Gestionar vencimiento",
    category: draft.category,
    entityType: draft.entityType,
    entityId: draft.entityId,
  });
}

function markNotificationAsReceived(db: MockDb, entityType: string, entityId: string) {
  const now = new Date().toISOString();
  db.notifications = db.notifications.map((item) => {
    if (item.entityType !== entityType || item.entityId !== entityId || item.status !== "active") return item;
    return {
      ...item,
      status: "received",
      receivedAt: now,
    };
  });
}

function markNotificationTypeAsReceived(db: MockDb, type: NotificationType, entityType: string, entityId: string) {
  const now = new Date().toISOString();
  db.notifications = db.notifications.map((item) => {
    if (item.type !== type || item.entityType !== entityType || item.entityId !== entityId || item.status !== "active") {
      return item;
    }
    return {
      ...item,
      status: "received",
      receivedAt: now,
    };
  });
}

function normalizeMarginPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function calculateSalePriceFromCost(costPrice: number, marginPercent: number): number {
  const safeCost = Math.max(0, Math.trunc(Number(costPrice)));
  const safeMargin = normalizeMarginPercent(marginPercent);
  return Math.max(1, Math.round(safeCost * (1 + safeMargin / 100)));
}

function inferCostPriceFromSalePrice(salePrice: number, marginPercent: number): number {
  const safeSale = Math.max(1, Math.trunc(Number(salePrice)));
  const safeMargin = normalizeMarginPercent(marginPercent);
  if (safeMargin <= 0) return safeSale;
  const divisor = 1 + safeMargin / 100;
  if (!Number.isFinite(divisor) || divisor <= 0) return safeSale;
  return Math.max(1, Math.round(safeSale / divisor));
}

function computeMarginPercentFromPrices(costPrice: number | undefined, salePrice: number): number {
  const safeCost = Math.trunc(Number(costPrice));
  const safeSale = Math.trunc(Number(salePrice));
  if (!Number.isFinite(safeCost) || safeCost <= 0 || !Number.isFinite(safeSale) || safeSale <= 0) {
    return 0;
  }
  return normalizeMarginPercent(((safeSale - safeCost) / safeCost) * 100);
}

function getCategoryPriceMarginPercent(db: MockDb, category: Product["category"] | undefined): number {
  const safeCategory = category || "bebida";
  const configured = db.priceMarginSettings.categoryMargins[safeCategory];
  if (!Number.isFinite(configured)) return 30;
  return normalizeMarginPercent(configured);
}

function getEffectiveProductPriceMarginPercent(db: MockDb, productId: string, category: Product["category"] | undefined): number {
  const byProduct = db.priceMarginSettings.productMargins.find((item) => item.productId === productId);
  if (byProduct) return normalizeMarginPercent(byProduct.marginPercent);
  return getCategoryPriceMarginPercent(db, category);
}

const MAX_MARGIN_HISTORY = 300;

function buildMarginHistoryId(prefix: "cmh" | "pmh"): string {
  return buildEntityId(prefix);
}

function pushCategoryMarginHistory(
  db: MockDb,
  category: NonNullable<Product["category"]>,
  previousMarginPercent: number,
  marginPercent: number,
) {
  if (previousMarginPercent === marginPercent) return;
  db.priceMarginSettings.categoryMarginHistory = [
    {
      id: buildMarginHistoryId("cmh"),
      category,
      previousMarginPercent,
      marginPercent,
      createdAt: new Date().toISOString(),
    },
    ...(db.priceMarginSettings.categoryMarginHistory || []),
  ].slice(0, MAX_MARGIN_HISTORY);
}

function pushProductMarginHistory(
  db: MockDb,
  productId: string,
  previousMarginPercent: number | null,
  marginPercent: number | null,
) {
  if (previousMarginPercent === marginPercent) return;
  db.priceMarginSettings.productMarginHistory = [
    {
      id: buildMarginHistoryId("pmh"),
      productId,
      previousMarginPercent,
      marginPercent,
      createdAt: new Date().toISOString(),
    },
    ...(db.priceMarginSettings.productMarginHistory || []),
  ].slice(0, MAX_MARGIN_HISTORY);
}

function ensureLicenseNotifications(db: MockDb, license: LicenseRecord) {
  const activeRequired = db.notifications.find(
    (item) =>
      item.type === "license-required" &&
      item.entityType === "license" &&
      item.entityId === license.id &&
      item.status === "active",
  );

  if (license.status !== "active") {
    const description = `El permiso/licencia ${license.name} esta ${license.status === "expired" ? "vencido" : "pendiente por renovar"}.`;
    if (activeRequired) {
      activeRequired.description = description;
    } else {
      createNotificationRecord(db, {
        type: "license-required",
        title: `Gestionar permiso: ${license.name}`,
        description,
        isFixed: true,
        requiresAction: true,
        actionLabel: "Renovar permiso",
        category: license.category,
        entityType: "license",
        entityId: license.id,
      });
    }
  } else if (activeRequired) {
    activeRequired.status = "received";
    activeRequired.receivedAt = new Date().toISOString();
  }

  if (license.expirationDate) {
    createExpirationNotification(db, {
      type: "license-expiring",
      title: `Permiso por vencer: ${license.name}`,
      description: `El permiso/licencia ${license.name} vence el ${license.expirationDate}.`,
      expirationDate: license.expirationDate,
      category: license.category,
      entityType: "license",
      entityId: license.id,
    });
    return;
  }

  markNotificationTypeAsReceived(db, "license-expiring", "license", license.id);
}

function getCurrentStockByProductId(db: MockDb, productId: string): number {
  return db.stocks
    .filter((item) => item.productId === productId)
    .reduce((acc, item) => acc + Math.trunc(Number(item.quantity) || 0), 0);
}

function getCategoryThreshold(db: MockDb, category: Product["category"] | undefined): number {
  const safeCategory = category || "bebida";
  return db.stockThresholdSettings.categoryThresholds[safeCategory] ?? 10;
}

function getProductThreshold(db: MockDb, productId: string, category: Product["category"] | undefined): number {
  const override = db.stockThresholdSettings.productThresholds.find((item) => item.productId === productId);
  if (override) return Math.max(10, Math.trunc(override.minUnits));
  return getCategoryThreshold(db, category);
}

function syncLowStockNotificationForProduct(db: MockDb, productId: string) {
  const product = db.products.find((item) => item.id === productId);
  if (!product) return;

  const stock = getCurrentStockByProductId(db, productId);
  const threshold = getProductThreshold(db, productId, product.category);
  const existing = db.notifications.find(
    (item) =>
      item.type === "product-low-stock" &&
      item.entityType === "product" &&
      item.entityId === productId &&
      item.status === "active",
  );

  if (stock < threshold) {
    const title = `Stock bajo: ${product.name}`;
    const description = `Stock actual ${stock}. Minimo configurado ${threshold}. Reponer producto.`;
    if (!existing) {
      createNotificationRecord(db, {
        type: "product-low-stock",
        title,
        description,
        isFixed: true,
        requiresAction: true,
        actionLabel: "Reponer stock",
        category: product.category,
        entityType: "product",
        entityId: productId,
      });
    } else if (existing.description !== description) {
      existing.description = description;
    }
    return;
  }

  if (existing) {
    existing.status = "received";
    existing.receivedAt = new Date().toISOString();
  }
}

function syncAllLowStockNotifications(db: MockDb) {
  for (const product of db.products) {
    syncLowStockNotificationForProduct(db, product.id);
  }
}

function generateNotificationTestCases(db: MockDb): number {
  let createdCases = 0;
  const countCreated = (action: () => void) => {
    const before = db.notifications.length;
    action();
    const delta = db.notifications.length - before;
    if (delta > 0) createdCases += delta;
  };

  const now = Date.now();
  const iso = (offsetDays: number) => new Date(now + offsetDays * ONE_DAY_MS).toISOString();

  const upsertProduct = (product: Product) => {
    const existingIndex = db.products.findIndex((item) => item.id === product.id);
    if (existingIndex < 0) {
      db.products.unshift(product);
      return product;
    }
    db.products[existingIndex] = { ...db.products[existingIndex], ...product };
    return db.products[existingIndex];
  };

  const upsertStockEntry = (entry: StockEntry) => {
    const existingIndex = db.stocks.findIndex((item) => item.id === entry.id);
    if (existingIndex < 0) {
      db.stocks.unshift(entry);
      return entry;
    }
    db.stocks[existingIndex] = { ...db.stocks[existingIndex], ...entry };
    return db.stocks[existingIndex];
  };

  const upsertExpense = (expense: Expense) => {
    const existingIndex = db.expenses.findIndex((item) => item.id === expense.id);
    if (existingIndex < 0) {
      db.expenses.unshift(expense);
      return expense;
    }
    db.expenses[existingIndex] = { ...db.expenses[existingIndex], ...expense };
    return db.expenses[existingIndex];
  };

  const upsertSupplyOrder = (order: SupplyOrder) => {
    const existingIndex = db.supplyOrders.findIndex((item) => item.id === order.id);
    if (existingIndex < 0) {
      db.supplyOrders.unshift(order);
      return order;
    }
    db.supplyOrders[existingIndex] = { ...db.supplyOrders[existingIndex], ...order };
    return db.supplyOrders[existingIndex];
  };

  const lowStockProduct = upsertProduct({
    id: "ptc-low-stock",
    name: "Hamburguesa simple",
    price: 4500,
    costPrice: 2800,
    createdAt: iso(-5),
    barcode: "7790001000001",
    category: "hamburguesa",
  });

  const expiringProduct = upsertProduct({
    id: "ptc-expiring",
    name: "Sandwich frio listo para llevar",
    price: 4800,
    costPrice: 3400,
    createdAt: iso(-3),
    barcode: "7790001000002",
    category: "pollo",
  });

  const thresholdIndex = db.stockThresholdSettings.productThresholds.findIndex((item) => item.productId === lowStockProduct.id);
  if (thresholdIndex < 0) {
    db.stockThresholdSettings.productThresholds.push({ productId: lowStockProduct.id, minUnits: 10 });
  } else {
    db.stockThresholdSettings.productThresholds[thresholdIndex] = { productId: lowStockProduct.id, minUnits: 10 };
  }

  upsertStockEntry({
    id: "setc-low-stock-demo",
    productId: lowStockProduct.id,
    quantity: 4,
    createdAt: iso(-1),
    expirationDate: iso(40),
    description: "Carga inicial caso stock bajo",
  });

  const expiringStock = upsertStockEntry({
    id: "setc-expiring-demo",
    productId: expiringProduct.id,
    quantity: 18,
    createdAt: iso(-1),
    expirationDate: iso(2),
    description: "Carga inicial caso producto por vencer",
  });

  const fumigationExpense = upsertExpense({
    id: "extc-fumigacion",
    description: "Fumigacion mensual aprobada del local",
    amount: 18500,
    assignedAmount: 18500,
    expenseType: "recurrent",
    createdBy: "admin",
    createdAt: iso(-1),
    status: "confirmed",
    confirmedAmount: 18500,
    confirmedBy: "admin",
    confirmedAt: iso(-1),
    amountMode: "assigned",
  });

  const maintenanceExpense = upsertExpense({
    id: "extc-gasto-programado",
    description: "Pago programado de mantenimiento electrico",
    amount: 22400,
    assignedAmount: 22400,
    expenseType: "recurrent",
    createdBy: "admin",
    createdAt: iso(-1),
    status: "confirmed",
    confirmedAmount: 22400,
    confirmedBy: "admin",
    confirmedAt: iso(-1),
    amountMode: "assigned",
  });

  const pendingSupplyOrder = upsertSupplyOrder({
    id: "sotc-pending-receive",
    supplierName: "Distribuidora Centro",
    description: "Pedido aprobado listo para recibir bebidas y snacks",
    expectedTotal: 72000,
    items: [
      {
        productId: lowStockProduct.id,
        productName: lowStockProduct.name,
        quantity: 16,
        barcode: lowStockProduct.barcode,
        category: lowStockProduct.category,
      },
      {
        productId: expiringProduct.id,
        productName: expiringProduct.name,
        quantity: 12,
        barcode: expiringProduct.barcode,
        category: expiringProduct.category,
      },
    ],
    createdAt: iso(-1),
    createdBy: "admin",
    status: "pending",
  });

  countCreated(() => syncLowStockNotificationForProduct(db, lowStockProduct.id));
  countCreated(() =>
    createExpirationNotification(db, {
      type: "product-expiring",
      title: `Producto por vencer: ${expiringProduct.name}`,
      description: `Lote con vencimiento ${expiringStock.expirationDate} para ${expiringProduct.name}.`,
      expirationDate: expiringStock.expirationDate || iso(2),
      category: expiringProduct.category,
      entityType: "stock",
      entityId: expiringStock.id,
    }),
  );
  countCreated(() =>
    createDurationNotification(db, {
      type: "expense-created",
      title: "Gasto programado: fumigacion",
      description: `${fumigationExpense.description} (${fumigationExpense.amount}).`,
      createdAt: fumigationExpense.createdAt,
      entityType: "expense",
      entityId: fumigationExpense.id,
    }),
  );
  countCreated(() =>
    createDurationNotification(db, {
      type: "expense-created",
      title: "Gasto programado: mantenimiento",
      description: `${maintenanceExpense.description} (${maintenanceExpense.amount}).`,
      createdAt: maintenanceExpense.createdAt,
      entityType: "expense",
      entityId: maintenanceExpense.id,
    }),
  );
  countCreated(() =>
    createDurationNotification(db, {
      type: "supply-requested",
      title: `Pedido a proveedor: ${pendingSupplyOrder.supplierName}`,
      description: `Se genero pedido ${pendingSupplyOrder.id} por ${pendingSupplyOrder.expectedTotal}.`,
      createdAt: pendingSupplyOrder.createdAt,
      entityType: "supply-order",
      entityId: pendingSupplyOrder.id,
    }),
  );
  countCreated(() =>
    createNotificationRecord(db, {
      type: "supply-pending-receive",
      title: `Pendiente recepcion: ${pendingSupplyOrder.supplierName}`,
      description: `Pedido ${pendingSupplyOrder.id} pendiente de recepcion.`,
      isFixed: true,
      requiresAction: true,
      actionLabel: "Registrar recepcion",
      status: "active",
      entityType: "supply-order",
      entityId: pendingSupplyOrder.id,
    }),
  );

  return createdCases;
}

async function ensureImageDir(store?: DataStoreRecord) {
  const targetStore = store || (await getActiveDataStore());
  const seedPaths = resolveDataStoreSeedPaths(targetStore.id);
  await ensureDirectoryWithOptionalSeed(targetStore.imagesDir, seedPaths.imagesDir);
}

async function ensureReceiptsDir(store?: DataStoreRecord) {
  const targetStore = store || (await getActiveDataStore());
  const seedPaths = resolveDataStoreSeedPaths(targetStore.id);
  await ensureDirectoryWithOptionalSeed(targetStore.receiptsDir, seedPaths.receiptsDir);
}

async function writeReceiptCopy(receiptId: string, html: string) {
  const activeStore = await getActiveDataStore();
  await ensureReceiptsDir(activeStore);
  const filePath = resolve(activeStore.receiptsDir, `${receiptId}.html`);
  await writeFile(filePath, html, "utf8");
  return filePath;
}

function buildSaleReceiptHtml(receipt: Receipt): string {
  const itemBlocks = receipt.items
    .map((item, index) => {
      const quantity = Number.isFinite(item.quantity) ? Math.max(0, Math.trunc(item.quantity)) : 0;
      const subtotal = Math.max(0, Math.trunc(item.unitPrice * quantity));
      return [
        "<article class=\"item\">",
        `  <p class="item-name">${index + 1}. ${escapeHtml(item.productName)}</p>`,
        `  <p class="item-meta">${quantity} x ${escapeHtml(formatReceiptMoney(item.unitPrice))}<span class="dots"></span>${escapeHtml(formatReceiptMoney(subtotal))}</p>`,
        "</article>",
      ].join("\n");
    })
    .join("\n");

  const computedTotal = receipt.items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
  const subtotalLabel = formatReceiptMoney(computedTotal);
  const totalLabel = formatReceiptMoney(receipt.total);

  return [
    "<!doctype html>",
    "<html lang=\"es\">",
    "<head>",
    "  <meta charset=\"utf-8\" />",
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    `  <title>Recibo ${escapeHtml(receipt.id)}</title>`,
    "  <style>",
    "    @page { size: 80mm auto; margin: 3mm; }",
    "    :root { color-scheme: light; }",
    "    * { box-sizing: border-box; }",
    "    body { margin: 0; background: #e2e8f0; color: #0f172a; font-family: Consolas, 'Courier New', monospace; font-size: 12px; line-height: 1.35; }",
    "    .wrap { width: 100%; padding: 16px 0; display: flex; justify-content: center; }",
    "    .ticket { width: min(80mm, calc(100vw - 16px)); background: #fff; border: 1px solid #cbd5e1; padding: 10px 8px; }",
    "    .center { text-align: center; }",
    "    .shop-name { margin: 0; font-size: 14px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }",
    "    .ticket-title { margin: 2px 0 0; font-size: 12px; font-weight: 700; }",
    "    .small { margin: 2px 0 0; font-size: 11px; }",
    "    .sep { border: 0; border-top: 1px dashed #0f172a; margin: 8px 0; }",
    "    .meta { display: grid; gap: 2px; }",
    "    .line { display: flex; justify-content: flex-start; align-items: baseline; gap: 6px; }",
    "    .label { font-weight: 700; white-space: nowrap; }",
    "    .value { text-align: left; word-break: break-word; }",
    "    .items { display: grid; gap: 6px; }",
    "    .item-name { margin: 0; font-weight: 700; word-break: break-word; }",
    "    .item-meta { margin: 2px 0 0; display: flex; align-items: center; gap: 6px; white-space: nowrap; }",
    "    .dots { flex: 1; border-bottom: 1px dotted #64748b; transform: translateY(-1px); }",
    "    .totals { display: grid; gap: 4px; }",
    "    .total { font-size: 14px; font-weight: 700; }",
    "    .thanks { margin: 10px 0 0; text-align: center; font-weight: 700; letter-spacing: 0.03em; }",
    "    @media print {",
    "      body { background: white; }",
    "      .wrap { padding: 0; }",
    "      .ticket { width: 100%; max-width: none; border: none; padding: 0; }",
    "    }",
    "  </style>",
    "</head>",
    "<body>",
    "  <div class=\"wrap\">",
    "    <main class=\"ticket\">",
    "      <header class=\"center\">",
    "        <p class=\"shop-name\">EasyFood</p>",
    "        <p class=\"ticket-title\">Comprobante de venta</p>",
    `        <p class="small">${escapeHtml(formatReceiptDateTime(receipt.createdAt))}</p>`,
    `        <p class="small">Ref: ${escapeHtml(receipt.id)}</p>`,
    "      </header>",
    "      <hr class=\"sep\" />",
    "      <section class=\"meta\">",
    `        <p class="line"><span class="label">Codigo factura:</span><span class="value">${escapeHtml(receipt.invoiceId || "-")}</span></p>`,
    `        <p class="line"><span class="label">Operador:</span><span class="value">${escapeHtml(receipt.operator)}</span></p>`,
    `        <p class="line"><span class="label">Pago:</span><span class="value">${escapeHtml(formatReceiptPaymentMethod(receipt.paymentMethod))}</span></p>`,
    "      </section>",
    "      <hr class=\"sep\" />",
    "      <section class=\"items\">",
    itemBlocks || "        <p class=\"small\">Sin items para mostrar.</p>",
    "      </section>",
    "      <hr class=\"sep\" />",
    "      <section class=\"totals\">",
    `        <p class="line"><span class="label">Subtotal</span><span class="value">${escapeHtml(subtotalLabel)}</span></p>`,
    `        <p class="line total"><span class="label">Total</span><span class="value">${escapeHtml(totalLabel)}</span></p>`,
    "      </section>",
    "      <p class=\"thanks\">Gracias por su compra</p>",
    "    </main>",
    "  </div>",
    "</body>",
    "</html>",
  ].join("\n");
}

function formatReceiptPaymentMethod(method: PaymentMethod): string {
  if (method === "efectivo") return "Efectivo";
  if (method === "tarjeta debito") return "Tarjeta Debito";
  if (method === "tarjeta credito") return "Tarjeta Credito";
  if (method === "mercadopago") return "Mercado Pago";
  return method;
}

function formatReceiptMoney(value: number): string {
  const amount = Number.isFinite(value) ? Math.trunc(value) : 0;
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

function formatReceiptDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value || "-";
  return `${padIdPart(date.getDate())}/${padIdPart(date.getMonth() + 1)}/${date.getFullYear()} ${padIdPart(date.getHours())}:${padIdPart(date.getMinutes())}:${padIdPart(date.getSeconds())}`;
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildDataStoreBackupFileName(store: DataStoreRecord): string {
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const safeStoreId = normalizeDataStoreId(store.id || store.name) || "base";
  return `easyfood-${safeStoreId}-${timestamp}.js`;
}

function sendJson(res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (chunk?: string) => void }, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sendTextDownload(
  res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (chunk?: string) => void },
  filename: string,
  content: string,
) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("X-Backup-Filename", filename);
  res.end(content);
}

function sanitizeDraft(input: unknown) {
  const obj = (input || {}) as {
    name?: unknown;
    price?: unknown;
    costPrice?: unknown;
    marginPercent?: unknown;
    imageUrl?: unknown;
    barcode?: unknown;
    brand?: unknown;
    category?: unknown;
    supplyOrderId?: unknown;
  };
  const name = String(obj.name || "").trim();
  const price = Number(obj.price);
  const costPrice = Number(obj.costPrice);
  const marginPercent = Number(obj.marginPercent);
  const imageUrl = String(obj.imageUrl || "").trim() || undefined;
  const barcode = String(obj.barcode || "").trim() || undefined;
  const brand = String(obj.brand || "").trim() || undefined;
  const category = normalizeCategory(obj.category);
  const supplyOrderId = String(obj.supplyOrderId || "").trim() || undefined;
  return { name, price, costPrice, marginPercent, imageUrl, barcode, brand, category, supplyOrderId };
}

function sanitizeIngredientDraft(input: unknown) {
  const obj = (input || {}) as {
    name?: unknown;
    expiresInDays?: unknown;
    stockMode?: unknown;
    stockQuantity?: unknown;
    entryQuantity?: unknown;
  };
  return {
    name: String(obj.name || "").trim(),
    expiresInDays: Math.max(0, Math.trunc(Number(obj.expiresInDays) || 0)),
    stockMode: normalizeIngredientStockMode(obj.stockMode),
    stockQuantity: Math.max(0, Number(obj.stockQuantity) || 0),
    entryQuantity: Math.max(0, Number(obj.entryQuantity) || 0),
  };
}

function sanitizeMenuProductDraft(input: unknown, ingredients: Ingredient[]) {
  const obj = (input || {}) as {
    name?: unknown;
    price?: unknown;
    description?: unknown;
    imageUrl?: unknown;
    category?: unknown;
    recipeItems?: unknown;
  };
  return {
    name: String(obj.name || "").trim(),
    price: Math.max(0, Math.trunc(Number(obj.price) || 0)),
    description: String(obj.description || "").trim() || undefined,
    imageUrl: String(obj.imageUrl || "").trim() || undefined,
    category: normalizeCategory(obj.category) || "hamburguesa",
    recipeItems: normalizeMenuRecipeItems(obj.recipeItems, ingredients),
  };
}

function sanitizeStockEntryDraft(input: unknown) {
  const obj = (input || {}) as {
    productId?: unknown;
    manufactureDate?: unknown;
    expirationDate?: unknown;
    quantity?: unknown;
    description?: unknown;
    supplyOrderId?: unknown;
    costPrice?: unknown;
    salePrice?: unknown;
  };

  return {
    productId: String(obj.productId || "").trim(),
    manufactureDate: String(obj.manufactureDate || "").trim() || undefined,
    expirationDate: String(obj.expirationDate || "").trim() || undefined,
    quantity: Number(obj.quantity),
    description: String(obj.description || "").trim() || undefined,
    supplyOrderId: String(obj.supplyOrderId || "").trim() || undefined,
    costPrice: Number(obj.costPrice),
    salePrice: Number(obj.salePrice),
  };
}

function sanitizeExpenseDraft(input: unknown): {
  description: string;
  amount: number;
  expenseType?: ExpenseType;
  invoiceImageUrl?: string;
  unexpectedImageUrl?: string;
  createdBy: string;
} {
  const obj = (input || {}) as {
    description?: unknown;
    amount?: unknown;
    expenseType?: unknown;
    invoiceImageUrl?: unknown;
    unexpectedImageUrl?: unknown;
    createdBy?: unknown;
  };

  const typeValue = String(obj.expenseType || "").trim().toLowerCase();
  const expenseType =
    typeValue === "recurrent" || typeValue === "unexpected" ? (typeValue as ExpenseType) : undefined;

  return {
    description: String(obj.description || "").trim(),
    amount: Number(obj.amount),
    expenseType,
    invoiceImageUrl: String(obj.invoiceImageUrl || "").trim() || undefined,
    unexpectedImageUrl: String(obj.unexpectedImageUrl || "").trim() || undefined,
    createdBy: String(obj.createdBy || "").trim(),
  };
}

function sanitizeFeedbackDraft(input: unknown): {
  type?: FeedbackType;
  message: string;
  isAnonymous: boolean;
  createdBy: string;
  createdByRole?: FeedbackAuthorRole;
} {
  const obj = (input || {}) as {
    type?: unknown;
    message?: unknown;
    isAnonymous?: unknown;
    createdBy?: unknown;
    createdByRole?: unknown;
  };
  const typeValue = String(obj.type || "").trim().toLowerCase();
  const type = typeValue === "suggestion" || typeValue === "claim" ? (typeValue as FeedbackType) : undefined;
  const createdByRoleValue = String(obj.createdByRole || "").trim().toLowerCase();
  const createdByRole =
    createdByRoleValue === "admin" || createdByRoleValue === "operator"
      ? (createdByRoleValue as FeedbackAuthorRole)
      : undefined;

  return {
    type,
    message: String(obj.message || "").trim(),
    isAnonymous: Boolean(obj.isAnonymous),
    createdBy: String(obj.createdBy || "").trim(),
    createdByRole,
  };
}

function sanitizeExpenseConfirmDraft(input: unknown): {
  confirmedAmount: number;
  amountMode?: ExpenseAmountMode;
  confirmationComment?: string;
  confirmedBy: string;
} {
  const obj = (input || {}) as {
    confirmedAmount?: unknown;
    amountMode?: unknown;
    confirmationComment?: unknown;
    confirmedBy?: unknown;
  };
  const amountModeValue = String(obj.amountMode || "").trim().toLowerCase();
  const amountMode =
    amountModeValue === "assigned" || amountModeValue === "different"
      ? (amountModeValue as ExpenseAmountMode)
      : undefined;

  return {
    confirmedAmount: Number(obj.confirmedAmount),
    amountMode,
    confirmationComment: String(obj.confirmationComment || "").trim() || undefined,
    confirmedBy: String(obj.confirmedBy || "").trim(),
  };
}

function sanitizeProductPriceDraft(input: unknown): {
  productId: string;
  newPrice: number;
  costPrice: number;
  marginPercent: number;
} {
  const obj = (input || {}) as { productId?: unknown; newPrice?: unknown; costPrice?: unknown; marginPercent?: unknown };
  return {
    productId: String(obj.productId || "").trim(),
    newPrice: Number(obj.newPrice),
    costPrice: Number(obj.costPrice),
    marginPercent: Number(obj.marginPercent),
  };
}

function sanitizePriceMarginDraft(input: unknown): { marginPercent: number } {
  const obj = (input || {}) as { marginPercent?: unknown };
  return {
    marginPercent: Number(obj.marginPercent),
  };
}

function sanitizePaymentMethodSettingDraft(input: unknown): { discountPercent: number; surchargePercent: number } {
  const obj = (input || {}) as { discountPercent?: unknown; surchargePercent?: unknown };
  return {
    discountPercent: Number(obj.discountPercent),
    surchargePercent: Number(obj.surchargePercent),
  };
}

function sanitizeTaxSettingsDraft(input: unknown): { ivaPercent?: number; mode?: TaxMode } {
  const obj = (input || {}) as { ivaPercent?: unknown; mode?: unknown };
  const modeRaw = String(obj.mode || "").trim().toLowerCase();
  return {
    ivaPercent: typeof obj.ivaPercent === "undefined" ? undefined : Number(obj.ivaPercent),
    mode: modeRaw === "add_to_total" || modeRaw === "show_only" ? (modeRaw as TaxMode) : undefined,
  };
}

function sanitizeAdminDataStoreCreateDraft(input: unknown): {
  requestedBy: string;
  adminPasswordHash: string;
  name: string;
  storeId: string;
} {
  const obj = (input || {}) as {
    requestedBy?: unknown;
    adminPasswordHash?: unknown;
    name?: unknown;
    storeId?: unknown;
  };
  return {
    requestedBy: String(obj.requestedBy || "").trim(),
    adminPasswordHash: String(obj.adminPasswordHash || "").trim().toLowerCase(),
    name: String(obj.name || "").trim(),
    storeId: String(obj.storeId || "").trim(),
  };
}

function sanitizeAdminDataStoreSwitchDraft(input: unknown): {
  requestedBy: string;
  adminPasswordHash: string;
  storeId: string;
} {
  const obj = (input || {}) as {
    requestedBy?: unknown;
    adminPasswordHash?: unknown;
    storeId?: unknown;
  };
  return {
    requestedBy: String(obj.requestedBy || "").trim(),
    adminPasswordHash: String(obj.adminPasswordHash || "").trim().toLowerCase(),
    storeId: String(obj.storeId || "").trim(),
  };
}

function sanitizeAdminDataResetDraft(input: unknown): { requestedBy: string; adminPasswordHash: string } {
  const obj = (input || {}) as { requestedBy?: unknown; adminPasswordHash?: unknown };
  return {
    requestedBy: String(obj.requestedBy || "").trim(),
    adminPasswordHash: String(obj.adminPasswordHash || "").trim().toLowerCase(),
  };
}

function sanitizeUserDraft(input: unknown): {
  name: string;
  email: string;
  username: string;
  role?: AppUserRole;
  password: string;
  startHour: string;
  endHour: string;
} {
  const obj = (input || {}) as {
    name?: unknown;
    email?: unknown;
    username?: unknown;
    role?: unknown;
    password?: unknown;
    startHour?: unknown;
    endHour?: unknown;
  };

  return {
    name: String(obj.name || "").trim(),
    email: String(obj.email || "").trim().toLowerCase(),
    username: String(obj.username || "").trim(),
    role: obj.role === "admin" || obj.role === "operator" || obj.role === "terminal" ? obj.role : undefined,
    password: String(obj.password || "").trim().toLowerCase(),
    startHour: String(obj.startHour || "").trim(),
    endHour: String(obj.endHour || "").trim(),
  };
}

function sanitizeUserUpdateDraft(input: unknown): {
  name: string;
  email: string;
  username: string;
  role?: AppUserRole;
  password?: string;
  startHour: string;
  endHour: string;
} {
  const obj = (input || {}) as {
    name?: unknown;
    email?: unknown;
    username?: unknown;
    role?: unknown;
    password?: unknown;
    startHour?: unknown;
    endHour?: unknown;
  };

  const password = String(obj.password || "").trim().toLowerCase();
  return {
    name: String(obj.name || "").trim(),
    email: String(obj.email || "").trim().toLowerCase(),
    username: String(obj.username || "").trim(),
    role: obj.role === "admin" || obj.role === "operator" || obj.role === "terminal" ? obj.role : undefined,
    password: password || undefined,
    startHour: String(obj.startHour || "").trim(),
    endHour: String(obj.endHour || "").trim(),
  };
}

function enrichProductsWithStocks(products: Product[], stocks: StockEntry[]) {
  const totals = new Map<string, { existencia: number; ultimoIngreso?: string }>();

  for (const stock of stocks) {
    const productId = String(stock.productId || "").trim();
    if (!productId) continue;
    const prev = totals.get(productId) || { existencia: 0, ultimoIngreso: undefined };
    const nextExistencia = prev.existencia + Math.trunc(Number(stock.quantity) || 0);

    const prevDate = prev.ultimoIngreso ? new Date(prev.ultimoIngreso).getTime() : 0;
    const nextDate = stock.createdAt ? new Date(stock.createdAt).getTime() : 0;
    const ultimoIngreso = nextDate >= prevDate ? stock.createdAt : prev.ultimoIngreso;

    totals.set(productId, { existencia: nextExistencia, ultimoIngreso });
  }

  return products.map((product) => {
    const aggregate = totals.get(product.id);
    return {
      ...product,
      existencia: aggregate?.existencia ?? 0,
      ultimoIngreso: aggregate?.ultimoIngreso,
    };
  });
}

function expirePendingOrders(db: MockDb) {
  let changed = false;
  const nowMs = Date.now();
  db.orders = db.orders.map((order) => {
    if (order.status !== "por pagar") return order;
    const createdAtMs = new Date(order.createdAt).getTime();
    if (!Number.isFinite(createdAtMs)) return order;
    if (nowMs - createdAtMs < ORDER_PENDING_TIMEOUT_MS) return order;
    changed = true;
    return {
      ...order,
      status: "cancelada",
      cancelledAt: new Date(nowMs).toISOString(),
    };
  });
  return changed;
}

function extractProductId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 2 && parts[0] === "products") return parts[1];
  return null;
}

function extractIngredientId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 2 && parts[0] === "ingredients") return parts[1];
  return null;
}

function extractMenuProductId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 2 && parts[0] === "menu-products") return parts[1];
  return null;
}

function extractUserId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 2 && parts[0] === "users") return parts[1];
  return null;
}

function extractOrderId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 3 && parts[0] === "orders" && parts[2] === "status") return parts[1];
  return null;
}

function extractExpenseConfirmId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 3 && parts[0] === "expenses" && parts[2] === "confirm") return parts[1];
  return null;
}

function extractWorkdayId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 3 && parts[0] === "workdays" && parts[2] === "close") return parts[1];
  return null;
}

function extractWorkdayRequestCloseId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 3 && parts[0] === "workdays" && parts[2] === "request-close") return parts[1];
  return null;
}

function extractWorkdayAdminCloseId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 3 && parts[0] === "workdays" && parts[2] === "admin-close") return parts[1];
  return null;
}

function extractCashOpeningAssignmentOperator(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || parts[0] !== "cash-opening-assignments") return null;
  const operator = String(decodeURIComponent(parts[1]) || "").trim();
  return operator || null;
}

function extractSupplyOrderEntityId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 2 && parts[0] === "supply-orders") return parts[1];
  return null;
}

function extractSupplyOrderReceiveId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 3 && parts[0] === "supply-orders" && parts[2] === "receive") return parts[1];
  return null;
}

function extractDeleteRequestId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 3 && parts[0] === "delete-requests" && parts[2] === "status") return parts[1];
  return null;
}

function extractOperationRequestEntityId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 2 && parts[0] === "operation-requests") return parts[1];
  return null;
}

function extractOperationRequestStatusId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 3 && parts[0] === "operation-requests" && parts[2] === "status") return parts[1];
  return null;
}

function extractLicenseId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 2 && parts[0] === "licenses") return parts[1];
  return null;
}

function extractLicenseIssuanceId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 3 && parts[0] === "licenses" && parts[2] === "issuances") return parts[1];
  return null;
}

function extractNotificationId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 2 && parts[0] === "notifications") return parts[1];
  return null;
}

function extractNotificationSettingType(pathname: string): NotificationType | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || parts[0] !== "notification-settings") return null;
  const type = String(parts[1] || "").trim().toLowerCase();
  return isNotificationType(type) ? type : null;
}

function extractStockThresholdCategory(pathname: string): NonNullable<Product["category"]> | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 3 || parts[0] !== "stock-threshold-settings" || parts[1] !== "category") return null;
  const category = normalizeCategory(decodeURIComponent(parts[2]));
  return category || null;
}

function extractStockThresholdProductId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 3 || parts[0] !== "stock-threshold-settings" || parts[1] !== "product") return null;
  const productId = String(parts[2] || "").trim();
  return productId || null;
}

function extractPriceMarginCategory(pathname: string): NonNullable<Product["category"]> | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 3 || parts[0] !== "price-margin-settings" || parts[1] !== "category") return null;
  const category = normalizeCategory(decodeURIComponent(parts[2]));
  return category || null;
}

function extractPriceMarginProductId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 3 || parts[0] !== "price-margin-settings" || parts[1] !== "product") return null;
  const productId = String(parts[2] || "").trim();
  return productId || null;
}

function extractPaymentMethodSettingMethod(pathname: string): PaymentMethod | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || parts[0] !== "payment-method-settings") return null;
  const method = String(decodeURIComponent(parts[1]) || "").trim().toLowerCase();
  if (!isPaymentMethodValue(method)) return null;
  return method;
}

function sanitizeOrderDraft(input: unknown): { items: OrderItem[]; operator: string } {
  const obj = (input || {}) as { items?: unknown[]; operator?: unknown };
  const items = Array.isArray(obj.items)
    ? obj.items
        .map((item) => sanitizeOrderItem(item))
        .filter((item): item is OrderItem => !!item)
    : [];
  return {
    items,
    operator: String(obj.operator || "").trim(),
  };
}

function sanitizeOrderItem(input: unknown): OrderItem | null {
  const obj = (input || {}) as {
    productId?: unknown;
    productName?: unknown;
    unitPrice?: unknown;
    quantity?: unknown;
  };

  const productId = String(obj.productId || "").trim();
  const productName = String(obj.productName || "").trim();
  const unitPrice = Math.trunc(Number(obj.unitPrice));
  const quantity = Math.trunc(Number(obj.quantity));
  if (!productId || !productName || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  return { productId, productName, unitPrice, quantity };
}

function sanitizeOrderStatusDraft(input: unknown): { status?: OrderStatus; paymentMethod?: PaymentMethod; total?: number } {
  const obj = (input || {}) as { status?: unknown; paymentMethod?: unknown; total?: unknown };
  const statusValue = String(obj.status || "").trim().toLowerCase();
  const paymentValue = String(obj.paymentMethod || "").trim().toLowerCase();

  const status =
    statusValue === "por pagar" || statusValue === "pagada" || statusValue === "cancelada"
      ? (statusValue as OrderStatus)
      : undefined;
  const paymentMethod =
    paymentValue === "efectivo" ||
    paymentValue === "tarjeta debito" ||
    paymentValue === "tarjeta credito" ||
    paymentValue === "mercadopago"
      ? (paymentValue as PaymentMethod)
      : undefined;

  const total = Number(obj.total);

  return {
    status,
    paymentMethod,
    total: Number.isFinite(total) ? Math.trunc(total) : undefined,
  };
}

function sanitizeInvoiceDraft(input: unknown): {
  orderId: string;
  total: number;
  paymentMethod?: PaymentMethod;
  operator: string;
} {
  const obj = (input || {}) as { orderId?: unknown; total?: unknown; paymentMethod?: unknown; operator?: unknown };
  const paymentValue = String(obj.paymentMethod || "").trim().toLowerCase();
  const paymentMethod =
    paymentValue === "efectivo" ||
    paymentValue === "tarjeta debito" ||
    paymentValue === "tarjeta credito" ||
    paymentValue === "mercadopago"
      ? (paymentValue as PaymentMethod)
      : undefined;

  return {
    orderId: String(obj.orderId || "").trim(),
    total: Number(obj.total),
    paymentMethod,
    operator: String(obj.operator || "").trim(),
  };
}

function sanitizeReceiptDraft(input: unknown): {
  orderId: string;
  orderCode: string;
  invoiceId?: string;
  createdAt: string;
  operator: string;
  paymentMethod?: PaymentMethod;
  items: ReceiptItem[];
  total: number;
} {
  const obj = (input || {}) as {
    orderId?: unknown;
    orderCode?: unknown;
    invoiceId?: unknown;
    createdAt?: unknown;
    operator?: unknown;
    paymentMethod?: unknown;
    items?: unknown[];
    total?: unknown;
  };
  const paymentValue = String(obj.paymentMethod || "").trim().toLowerCase();
  const paymentMethod = isPaymentMethodValue(paymentValue) ? paymentValue : undefined;
  const items = Array.isArray(obj.items)
    ? obj.items
        .map((item) => sanitizeOrderItem(item))
        .filter((item): item is OrderItem => !!item)
        .map((item) => ({
          productId: item.productId,
          productName: item.productName,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
        }))
    : [];

  return {
    orderId: String(obj.orderId || "").trim(),
    orderCode: String(obj.orderCode || "").trim(),
    invoiceId: String(obj.invoiceId || "").trim() || undefined,
    createdAt: String(obj.createdAt || "").trim(),
    operator: String(obj.operator || "").trim(),
    paymentMethod,
    items,
    total: Number(obj.total),
  };
}

function sanitizeWorkdayOpenDraft(input: unknown): { operator: string; openingAmount: number } {
  const obj = (input || {}) as { operator?: unknown; openingAmount?: unknown };
  return {
    operator: String(obj.operator || "").trim(),
    openingAmount: Number(obj.openingAmount),
  };
}

function sanitizeWorkdayCloseDraft(input: unknown): { endedAt?: string; orderIds: string[] } {
  const obj = (input || {}) as { endedAt?: unknown; orderIds?: unknown[] };
  const orderIds = Array.isArray(obj.orderIds)
    ? obj.orderIds.map((id) => String(id || "").trim()).filter((id) => id.length > 0)
    : [];
  const endedAt = String(obj.endedAt || "").trim() || undefined;
  return { endedAt, orderIds };
}

function sanitizeWorkdayAddOrderDraft(input: unknown): { operator: string; orderId: string } {
  const obj = (input || {}) as { operator?: unknown; orderId?: unknown };
  return {
    operator: String(obj.operator || "").trim(),
    orderId: String(obj.orderId || "").trim(),
  };
}

function sanitizeWorkdayRequestCloseDraft(input: unknown): {
  operator: string;
  declaredClosingCash: number;
  orderIds: string[];
} {
  const obj = (input || {}) as { operator?: unknown; declaredClosingCash?: unknown; orderIds?: unknown[] };
  const orderIds = Array.isArray(obj.orderIds)
    ? obj.orderIds.map((id) => String(id || "").trim()).filter((id) => id.length > 0)
    : [];
  return {
    operator: String(obj.operator || "").trim(),
    declaredClosingCash: Number(obj.declaredClosingCash),
    orderIds,
  };
}

function sanitizeWorkdayAdminCloseDraft(input: unknown): {
  reviewedBy: string;
  checks: WorkdayAuditChecks;
  notes?: string;
  mismatchReport?: string;
} {
  const obj = (input || {}) as {
    reviewedBy?: unknown;
    checks?: unknown;
    notes?: unknown;
    mismatchReport?: unknown;
  };
  return {
    reviewedBy: String(obj.reviewedBy || "").trim(),
    checks: normalizeWorkdayAuditChecks(obj.checks),
    notes: String(obj.notes || "").trim() || undefined,
    mismatchReport: String(obj.mismatchReport || "").trim() || undefined,
  };
}

function sanitizeCashOpeningAssignmentDraft(input: unknown): { amount: number; shift: CashShift; updatedBy: string } {
  const obj = (input || {}) as { amount?: unknown; shift?: unknown; updatedBy?: unknown };
  return {
    amount: Number(obj.amount),
    shift: normalizeCashShift(obj.shift),
    updatedBy: String(obj.updatedBy || "").trim(),
  };
}

function sanitizeDeleteRequestDraft(input: unknown): {
  requestType: RequestType;
  title: string;
  description?: string;
  productId?: string;
  productName?: string;
  requestedBy: string;
} {
  const obj = (input || {}) as {
    requestType?: unknown;
    title?: unknown;
    description?: unknown;
    productId?: unknown;
    productName?: unknown;
    requestedBy?: unknown;
  };

  const productId = String(obj.productId || "").trim() || undefined;
  const productName = String(obj.productName || "").trim() || undefined;
  const rawTitle = String(obj.title || "").trim();
  const description = String(obj.description || "").trim() || undefined;
  const requestedBy = String(obj.requestedBy || "").trim();
  const requestedType = String(obj.requestType || "").trim().toLowerCase();
  const requestType: RequestType =
    requestedType === "product-delete" || productId || productName ? "product-delete" : "operation-order";

  const title = rawTitle || (requestType === "product-delete" ? `Eliminar producto: ${productName || "sin nombre"}` : "");

  return {
    requestType,
    title,
    description,
    productId,
    productName,
    requestedBy,
  };
}

function sanitizeDeleteRequestStatusDraft(input: unknown): { status?: RequestStatus; reviewedBy: string } {
  const obj = (input || {}) as { status?: unknown; reviewedBy?: unknown };
  const statusValue = String(obj.status || "").trim().toLowerCase();
  const status =
    statusValue === "pending" || statusValue === "approved" || statusValue === "rejected"
      ? (statusValue as RequestStatus)
      : undefined;
  return {
    status,
    reviewedBy: String(obj.reviewedBy || "").trim(),
  };
}

function sanitizeOperationRequestDraft(input: unknown): {
  requestType: OperationRequestType;
  description: string;
  requestedBy: string;
  items: OperationRequestItem[];
} {
  const obj = (input || {}) as { requestType?: unknown; description?: unknown; requestedBy?: unknown; items?: unknown };
  const requestTypeValue = String(obj.requestType || "").trim().toLowerCase();
  const requestType: OperationRequestType =
    requestTypeValue === "merchandise" || requestTypeValue === "permissions"
      ? (requestTypeValue as OperationRequestType)
      : "merchandise";
  return {
    requestType,
    description: String(obj.description || "").trim(),
    requestedBy: String(obj.requestedBy || "").trim(),
    items: normalizeOperationRequestItems(obj.items, []),
  };
}

function sanitizeOperationRequestUpdateDraft(input: unknown): {
  requestType: OperationRequestType;
  description: string;
  items: OperationRequestItem[];
} {
  const obj = (input || {}) as { requestType?: unknown; description?: unknown; items?: unknown };
  const requestTypeValue = String(obj.requestType || "").trim().toLowerCase();
  const requestType: OperationRequestType =
    requestTypeValue === "merchandise" || requestTypeValue === "permissions"
      ? (requestTypeValue as OperationRequestType)
      : "merchandise";
  return {
    requestType,
    description: String(obj.description || "").trim(),
    items: normalizeOperationRequestItems(obj.items, []),
  };
}

function sanitizeOperationRequestStatusDraft(input: unknown): {
  status?: OperationRequestStatus;
  reviewedBy: string;
  supplyOrderId?: string;
  supplierMessage?: string;
  reviewComment?: string;
  items?: OperationRequestItem[];
} {
  const obj = (input || {}) as {
    status?: unknown;
    reviewedBy?: unknown;
    supplyOrderId?: unknown;
    supplierMessage?: unknown;
    reviewComment?: unknown;
    items?: unknown;
  };
  const statusValue = String(obj.status || "").trim().toLowerCase();
  const status =
    statusValue === "pending" || statusValue === "approved" || statusValue === "rejected"
      ? (statusValue as OperationRequestStatus)
      : undefined;
  return {
    status,
    reviewedBy: String(obj.reviewedBy || "").trim(),
    supplyOrderId: String(obj.supplyOrderId || "").trim() || undefined,
    supplierMessage: String(obj.supplierMessage || "").trim() || undefined,
    reviewComment: String(obj.reviewComment || "").trim() || undefined,
    items: Array.isArray(obj.items) ? normalizeOperationRequestItems(obj.items, []) : undefined,
  };
}

function sanitizeSupplyOrderDraft(input: unknown): {
  supplierName: string;
  description: string;
  expectedTotal: number;
  createdBy: string;
  items: Array<{ productId: string; quantity: number }>;
} {
  const obj = (input || {}) as {
    supplierName?: unknown;
    description?: unknown;
    expectedTotal?: unknown;
    createdBy?: unknown;
    items?: unknown[];
  };

  return {
    supplierName: String(obj.supplierName || "").trim(),
    description: String(obj.description || "").trim(),
    expectedTotal: Number(obj.expectedTotal),
    createdBy: String(obj.createdBy || "").trim(),
    items: sanitizeSupplyOrderItemsDraft(obj.items),
  };
}

function sanitizeSupplyOrderUpdateDraft(input: unknown): {
  supplierName: string;
  description: string;
  expectedTotal: number;
  items: Array<{ productId: string; quantity: number }>;
} {
  const obj = (input || {}) as {
    supplierName?: unknown;
    description?: unknown;
    expectedTotal?: unknown;
    items?: unknown[];
  };

  return {
    supplierName: String(obj.supplierName || "").trim(),
    description: String(obj.description || "").trim(),
    expectedTotal: Number(obj.expectedTotal),
    items: sanitizeSupplyOrderItemsDraft(obj.items),
  };
}

function sanitizeSupplyOrderReceiveDraft(input: unknown): {
  actualTotal: number;
  isExactAmount: boolean;
  receivedBy: string;
  invoiceImageUrl?: string;
  receiveComment?: string;
  items: Array<{ productId: string; missingQuantity: number; expirationDate?: string }>;
} {
  const obj = (input || {}) as {
    actualTotal?: unknown;
    isExactAmount?: unknown;
    receivedBy?: unknown;
    invoiceImageUrl?: unknown;
    receiveComment?: unknown;
    items?: unknown[];
  };
  const invoiceImageUrl = String(obj.invoiceImageUrl || "").trim() || undefined;
  const receiveComment = String(obj.receiveComment || "").trim() || undefined;
  return {
    actualTotal: Number(obj.actualTotal),
    isExactAmount: Boolean(obj.isExactAmount),
    receivedBy: String(obj.receivedBy || "").trim(),
    invoiceImageUrl,
    receiveComment,
    items: sanitizeSupplyOrderReceiptItemsDraft(obj.items),
  };
}

function sanitizeSupplyOrderItemsDraft(input: unknown): Array<{ productId: string; quantity: number }> {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      const node = (item || {}) as { productId?: unknown; quantity?: unknown };
      const productId = String(node.productId || "").trim();
      const quantity = Math.trunc(Number(node.quantity));
      if (!productId || !Number.isFinite(quantity) || quantity <= 0) return null;
      return { productId, quantity };
    })
    .filter((item): item is { productId: string; quantity: number } => !!item);
}

function sanitizeSupplyOrderReceiptItemsDraft(
  input: unknown,
): Array<{ productId: string; missingQuantity: number; expirationDate?: string }> {
  if (!Array.isArray(input)) return [];
  const result: Array<{ productId: string; missingQuantity: number; expirationDate?: string }> = [];
  for (const item of input) {
    const node = (item || {}) as { productId?: unknown; missingQuantity?: unknown; expirationDate?: unknown };
    const productId = String(node.productId || "").trim();
    const missingQuantity = Math.max(0, Math.trunc(Number(node.missingQuantity)));
    if (!productId || !Number.isFinite(missingQuantity)) continue;
    result.push({
      productId,
      missingQuantity,
      expirationDate: String(node.expirationDate || "").trim() || undefined,
    });
  }
  return result;
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, rejectBody) => {
    let data = "";
    req.on("data", (chunk: Buffer) => {
      data += chunk.toString("utf8");
      if (data.length > 1_000_000) {
        rejectBody(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!data.trim()) return resolveBody({});
      try {
        resolveBody(JSON.parse(data));
      } catch {
        rejectBody(new Error("Invalid JSON"));
      }
    });
    req.on("error", rejectBody);
  });
}

function readBinaryBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
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

function safeFileName(input: string): string {
  const raw = String(input || "").trim().toLowerCase();
  const clean = raw.replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-");
  return clean.replace(/^\.+/, "") || `img-${Date.now()}.bin`;
}

function guessExtFromContentType(contentType: string): string {
  if (contentType.includes("image/jpeg")) return ".jpg";
  if (contentType.includes("image/png")) return ".png";
  if (contentType.includes("image/webp")) return ".webp";
  if (contentType.includes("image/gif")) return ".gif";
  if (contentType.includes("image/svg+xml")) return ".svg";
  return ".bin";
}

function contentTypeFromExt(fileExt: string): string {
  if (fileExt === ".jpg" || fileExt === ".jpeg") return "image/jpeg";
  if (fileExt === ".png") return "image/png";
  if (fileExt === ".webp") return "image/webp";
  if (fileExt === ".gif") return "image/gif";
  if (fileExt === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

// https://vite.dev/config/
export default defineConfig({
  esbuild: {
    target: JS_COMPAT_TARGET,
  },
  optimizeDeps: {
    esbuildOptions: {
      target: JS_COMPAT_TARGET,
    },
  },
  build: {
    target: JS_COMPAT_TARGET,
    cssTarget: CSS_COMPAT_TARGET,
  },
  server: {
    host: true,
    port: DEV_SERVER_PORT,
    strictPort: true,
    allowedHosts: ALLOWED_HOSTS,
  },
  preview: {
    host: true,
    port: PREVIEW_PORT,
    strictPort: true,
    allowedHosts: ALLOWED_HOSTS,
  },
  plugins: [react(), mockDbPlugin()],
});
