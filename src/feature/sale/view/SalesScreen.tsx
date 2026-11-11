import { useEffect, useMemo, useRef, useState } from "react";
import { compareCategoryOrder } from "../../../shared/category/category-order";
import { isRecipeIngredientRequired } from "../../../shared/recipe/ingredient-rules";
import { useNavigate } from "react-router-dom";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import HeaderOperationNotice from "../../../app/component/HeaderOperationNotice";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import type { Product } from "../../product/model/product.types";
import { fetchProducts } from "../../product/service/product.api";
import type { MenuProduct } from "../../menu/model/menu.types";
import type { MenuCategory } from "../../menu/model/menu-category.types";
import { MENU_CATEGORIES_CHANGED_EVENT, fetchMenuCategoriesApi } from "../../menu/service/menu-category.api";
import { fetchMenuProductsApi } from "../../menu/service/menu.api";
import { formatMoneyARS } from "../../../shared/format/locale";
import { matchesPriceFilter } from "../../../shared/product/product-filter";
import { normalizeForSearch } from "../../../shared/search/search";
import type { Order, PaymentMethod, PaymentMethodSettings, TaxSettings } from "../model/sale.types";
import {
  PAYMENT_METHODS,
  buildDefaultPaymentMethodSettings,
  buildDefaultTaxSettings,
  formatPaymentMethodLabel,
  resolvePaymentMethodAdjustment,
  normalizePercent,
} from "../model/sale.types";
import {
  createInvoiceApi,
  createOrderApi,
  fetchPaymentMethodSettingsApi,
  fetchTaxSettingsApi,
  updateOrderStatusApi,
} from "../service/sale.api";
import { resolveImageUrl } from "../../../shared/image/image.service";
import {
  addOrderToCurrentWorkdayApi,
  fetchCashOpeningAssignmentsApi,
  onCashStatusChanged,
} from "../../cash/service/cash.api";
import { openCashWithAmount, syncCashState as syncCashStateService } from "../../cash/service/cash.operation";
import { DATA_STORE_CHANGED_EVENT } from "../../data/service/data.api";
import type { Ingredient, IngredientCategory } from "../../ingredient/model/ingredient.types";
import { fetchIngredientCategoriesApi, fetchIngredientsApi } from "../../ingredient/service/ingredient.api";
import { buildDefaultSystemSettings, type SystemSettings } from "../../system/model/system.types";
import { fetchSystemSettingsApi } from "../../system/service/system.api";
import styles from "./SalesScreen.module.css";

type CartItem = {
  id: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  excludedIngredients?: Array<{ productId: string; ingredientId: string; ingredientName: string }>;
  comboItems?: Array<{ menuProductId: string; menuProductName: string; quantity: number }>;
  comboSelections?: Array<{ category: string; menuProductId: string; menuProductName: string }>;
  comboUnits?: Array<{
    label: string;
    comboItems: Array<{ menuProductId: string; menuProductName: string; quantity: number }>;
    comboSelections?: Array<{ category: string; menuProductId: string; menuProductName: string }>;
  }>;
};

type SellableProduct = Product & {
  saleSource?: "product" | "menu";
  menuProductId?: string;
  menuProduct?: MenuProduct;
};

function cartConfigurationKey(item: Pick<CartItem, "productId" | "comboSelections" | "excludedIngredients">) {
  return JSON.stringify([
    item.productId,
    (item.comboSelections || []).map((entry) => `${entry.category}:${entry.menuProductId}`).sort(),
    (item.excludedIngredients || []).map((entry) => `${entry.productId}:${entry.ingredientId}`).sort(),
  ]);
}

function buildMenuSaleProductId(menuProductId: string): string {
  return `menu:${menuProductId}`;
}

function formatCategoryLabel(category: string, categories: MenuCategory[] = []) {
  return categories.find((item) => item.id === category)?.name || category.charAt(0).toUpperCase() + category.slice(1);
}

function formatCatalogProductName(name: string, category: string) {
  if (!normalizeForSearch(category).includes("hamburgues")) return name;
  return name.replace(/^hamburguesas?\b[\s:–—-]*(?:de\s+)?/i, "").trim() || name;
}

function productHasCategory(product: Pick<Product, "category" | "categoryIds">, categoryId: string) {
  return product.category === categoryId || !!product.categoryIds?.includes(categoryId);
}

function resolveComboItems(product: SellableProduct, selections: NonNullable<CartItem["comboSelections"]>, products: SellableProduct[]) {
  return (product.menuProduct?.comboItems || [])
    .map((item) => {
      const selection = selections.find((node) => node.category === item.category);
      const selectedProduct =
        item.type === "category"
          ? products.find((candidate) => candidate.menuProductId === selection?.menuProductId)
          : products.find((candidate) => candidate.menuProductId === item.menuProductId);
      if (item.type === "category" && selection && !selectedProduct) {
        return {
          menuProductId: selection.menuProductId,
          menuProductName: selection.menuProductName,
          quantity: Math.max(1, Math.trunc(Number(item.quantity || 1))),
        };
      }
      if (!selectedProduct?.menuProductId) return null;
      return {
        menuProductId: selectedProduct.menuProductId,
        menuProductName: selectedProduct.name,
        quantity: Math.max(1, Math.trunc(Number(item.quantity || 1))),
      };
    })
    .filter((item): item is NonNullable<typeof item> => !!item);
}

function getComboCategoryOptions(comboItem: NonNullable<MenuProduct["comboItems"]>[number], products: SellableProduct[]) {
  const allowedIds = new Set(comboItem.allowedMenuProductIds || []);
  return products.filter((product) => {
    if (product.menuProduct?.kind === "combo") return false;
    return allowedIds.size ? allowedIds.has(product.menuProductId || product.id) : !!comboItem.category && productHasCategory(product, comboItem.category);
  });
}

function mapSelectionsByCategory(selections: CartItem["comboSelections"]) {
  return Object.fromEntries((selections || []).map((item) => [item.category, buildMenuSaleProductId(item.menuProductId)]));
}

function recipeComponents(product: SellableProduct, selections: Record<string, string>, products: SellableProduct[]) {
  if (product.menuProduct?.kind !== "combo") return [product];
  return (product.menuProduct.comboItems || []).flatMap((item) => {
    const id = item.type === "category" ? selections[item.category || ""] : buildMenuSaleProductId(item.menuProductId || "");
    const component = products.find((candidate) => candidate.id === id);
    return component ? [component] : [];
  }).sort((a, b) => Number((b.menuProduct?.recipeItems.length || 0) > 1) - Number((a.menuProduct?.recipeItems.length || 0) > 1));
}

function resolveUnitConsumption(product: SellableProduct, selections: Record<string, string>, products: SellableProduct[], excluded: CartItem["excludedIngredients"] = []) {
  const consumption = new Map<string, number>();
  const components = product.menuProduct?.kind === "combo"
    ? (product.menuProduct.comboItems || []).map((item) => ({
      product: products.find((candidate) => candidate.id === (item.type === "category" ? selections[item.category || ""] : buildMenuSaleProductId(item.menuProductId || ""))), quantity: item.quantity,
    })) : [{ product, quantity: 1 }];
  for (const component of components) {
    if (component.product && !component.product.menuProduct) consumption.set("product:" + component.product.id, (consumption.get("product:" + component.product.id) || 0) + component.quantity);
    for (const item of component.product?.menuProduct?.recipeItems || []) {
      if (!isRecipeIngredientRequired(item, component.product!.menuProduct!.recipeItems.length) && excluded.some((entry) => entry.productId === component.product!.menuProductId && entry.ingredientId === item.ingredientId)) continue;
      consumption.set(item.ingredientId, (consumption.get(item.ingredientId) || 0) + item.quantity * component.quantity);
    }
  }
  return consumption;
}

function generateOrderCode() {
  const now = new Date();
  const stamp = `${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}${now.getFullYear()}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 10_000)
    .toString()
    .padStart(4, "0");
  return `ORD${stamp}${rand}`;
}

function getPendingTimeoutMinutes() {
  const raw = Math.trunc(Number(import.meta.env.VITE_ORDER_PENDING_TIMEOUT_MINUTES));
  if (!Number.isFinite(raw) || raw <= 0) return 15;
  return raw;
}

const PENDING_PAYMENT_TIMEOUT_MINUTES = getPendingTimeoutMinutes();
const PENDING_PAYMENT_TIMEOUT_MS = PENDING_PAYMENT_TIMEOUT_MINUTES * 60_000;

function getPendingOrderRemainingMs(order: Order) {
  if (order.status !== "por pagar") return 0;
  const createdAtMs = new Date(order.createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) return PENDING_PAYMENT_TIMEOUT_MS;
  const elapsedMs = Date.now() - createdAtMs;
  return Math.max(0, PENDING_PAYMENT_TIMEOUT_MS - elapsedMs);
}

function isPendingOrderExpired(order: Order) {
  return getPendingOrderRemainingMs(order) <= 0;
}

function parseOpeningAmount(value: string): number | null {
  const normalized = String(value || "").trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.trunc(parsed);
}

export default function SalesScreen() {
  const nav = useNavigate();
  const auth = useAuth();
  const cartCardRef = useRef<HTMLElement | null>(null);
  const [products, setProducts] = useState<SellableProduct[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ingredientCategories, setIngredientCategories] = useState<IngredientCategory[]>([]);
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(buildDefaultSystemSettings());
  const [loading, setLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [excludedIngredients, setExcludedIngredients] = useState<NonNullable<CartItem["excludedIngredients"]>>([]);
  const [comboSelections, setComboSelections] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<CartItem[]>([]);
  const [draftOrderCode, setDraftOrderCode] = useState(() => generateOrderCode());
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");

  const [nameFilter, setNameFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priceFilter, setPriceFilter] = useState("");

  const [pendingOrder, setPendingOrder] = useState<Order | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo");
  const [paymentMethodSettings, setPaymentMethodSettings] = useState<PaymentMethodSettings>(buildDefaultPaymentMethodSettings());
  const [taxSettings, setTaxSettings] = useState<TaxSettings>(buildDefaultTaxSettings());
  const [isApprovingPayment, setIsApprovingPayment] = useState(false);
  const [isCashOpen, setIsCashOpen] = useState(false);
  const [isCashStateResolved, setIsCashStateResolved] = useState(false);
  const [assignedOpeningAmount, setAssignedOpeningAmount] = useState<number | null>(null);
  const [openingAmountInput, setOpeningAmountInput] = useState("");
  const [isOpeningCashFromModal, setIsOpeningCashFromModal] = useState(false);
  const [cashModalError, setCashModalError] = useState("");
  const [pendingPaymentRemainingMs, setPendingPaymentRemainingMs] = useState(0);
  const currentUsername = auth.user?.username ?? "";
  const isAdmin = auth.user?.role === "admin";
  const isCashOpenForSession = isCashOpen;

  async function reloadProducts() {
    setLoading(true);
    try {
      const [productList, menuProductList, categoryList, ingredientList, nextSystemSettings, ingredientCategoryList] = await Promise.all([
        fetchProducts(),
        fetchMenuProductsApi(),
        fetchMenuCategoriesApi(),
        fetchIngredientsApi(),
        fetchSystemSettingsApi(),
        fetchIngredientCategoriesApi(),
      ]);
      const menuById = new Map(menuProductList.map((item) => [item.id, item]));
      setProducts(productList.map((product) => {
        const menuProduct = menuById.get(product.id);
        return menuProduct
          ? { ...product, id: buildMenuSaleProductId(menuProduct.id), saleSource: "menu", menuProductId: menuProduct.id, menuProduct }
          : { ...product, id: buildMenuSaleProductId(product.id), menuProductId: product.id };
      }));
      setIngredients(ingredientList);
      setIngredientCategories(ingredientCategoryList);
      setSystemSettings(nextSystemSettings);
      setMenuCategories(categoryList);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reloadProducts();
  }, []);

  useEffect(() => {
    const handler = () => {
      setCart([]);
      setPendingOrder(null);
      setSelectedProductId(null);
      setComboSelections({}); setExcludedIngredients([]);
      void reloadProducts();
    };
    window.addEventListener(DATA_STORE_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DATA_STORE_CHANGED_EVENT, handler);
  }, []);

  useEffect(() => {
    const handler = () => {
      void reloadProducts();
    };
    window.addEventListener(MENU_CATEGORIES_CHANGED_EVENT, handler);
    return () => window.removeEventListener(MENU_CATEGORIES_CHANGED_EVENT, handler);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [nextPaymentMethodSettings, nextTaxSettings] = await Promise.all([
          fetchPaymentMethodSettingsApi(),
          fetchTaxSettingsApi(),
        ]);
        setPaymentMethodSettings(nextPaymentMethodSettings);
        setTaxSettings(nextTaxSettings);
      } catch {
        setPaymentMethodSettings(buildDefaultPaymentMethodSettings());
        setTaxSettings(buildDefaultTaxSettings());
      }
    })();
  }, []);

  useEffect(() => {
    if (!currentUsername) {
      setAssignedOpeningAmount(null);
      return;
    }
    if (isAdmin) {
      setAssignedOpeningAmount(null);
      return;
    }

    let alive = true;
    (async () => {
      try {
        const assignments = await fetchCashOpeningAssignmentsApi();
        if (!alive) return;
        const own = assignments.find(
          (item) => normalizeForSearch(item.operator) === normalizeForSearch(currentUsername),
        );
        setAssignedOpeningAmount(own ? Math.trunc(Number(own.amount || 0)) : null);
      } catch {
        if (!alive) return;
        setAssignedOpeningAmount(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, [currentUsername, isAdmin]);

  useEffect(() => {
    if (!currentUsername) {
      setIsCashOpen(false);
      setIsCashStateResolved(false);
      return;
    }

    let alive = true;
    setIsCashStateResolved(false);
    async function syncCashState(operator: string) {
      try {
        const result = await syncCashStateService(operator);
        if (!alive) return;
        setIsCashOpen(result.isOpen);
      } catch {
        if (!alive) return;
        setIsCashOpen(false);
      } finally {
        if (alive) {
          setIsCashStateResolved(true);
        }
      }
    }

    void syncCashState(currentUsername);
    const off = onCashStatusChanged((operator) => {
      if (operator !== currentUsername) return;
      void syncCashState(operator);
    });

    return () => {
      alive = false;
      off();
    };
  }, [currentUsername]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId],
  );
  const selectedImageUrl = resolveImageUrl(selectedProduct?.imageUrl?.trim() || "");

  const selectedProductStock = resolveProductStock(selectedProduct);
  const selectedProductStockLabel = selectedProduct ? `Disponibles: ${formatStockLimit(selectedProductStock)}` : "";
  const hasPendingPayment = pendingOrder?.status === "por pagar";

  useEffect(() => {
    if (!pendingOrder || pendingOrder.status !== "por pagar") {
      setPendingPaymentRemainingMs(0);
      return;
    }

    const syncRemaining = () => {
      setPendingPaymentRemainingMs(getPendingOrderRemainingMs(pendingOrder));
    };

    syncRemaining();
    const timerId = window.setInterval(syncRemaining, 1_000);
    return () => {
      window.clearInterval(timerId);
    };
  }, [pendingOrder]);

  useEffect(() => {
    if (!pendingOrder || pendingOrder.status !== "por pagar") return;

    let cancelled = false;

    async function expirePendingIfNeeded() {
      if (!pendingOrder || !isPendingOrderExpired(pendingOrder)) return;

      try {
        await updateOrderStatusApi(pendingOrder.id, { status: "cancelada" });
      } catch {
        // no-op: if backend already canceled it, continue local cleanup
      }

      await reloadProducts();
      if (cancelled) return;

      setPendingOrder(null);
      setCart([]);
      setDraftOrderCode(generateOrderCode());
      setSelectedProductId(null);
      setIsModalOpen(false);
      setError("");
      setWarning(`Se acabo el tiempo para pagar la orden ${pendingOrder.id}. El pago fue rechazado automaticamente.`);
      setMessage("");
    }

    void expirePendingIfNeeded();
    const timerId = window.setInterval(() => {
      void expirePendingIfNeeded();
    }, 1_000);

    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, [pendingOrder]);

  const filteredProducts = useMemo(() => {
    const q = normalizeForSearch(nameFilter);
    const p = priceFilter.replace(/\D/g, "");
    let list = products.filter((item) => item.type === "receta" || item.type === "combo" || item.type === "bebida");

    if (q) list = list.filter((item) => normalizeForSearch(item.name).includes(q));
    if (categoryFilter) list = list.filter((item) => productHasCategory(item, categoryFilter));
    if (p) list = list.filter((item) => matchesPriceFilter(item.price, p));
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [products, nameFilter, categoryFilter, priceFilter]);

  const productGroups = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; products: SellableProduct[] }>();
    for (const product of filteredProducts) {
      const categoryId = categoryFilter || product.category || product.categoryIds?.[0] || "";
      const group = groups.get(categoryId) || {
        id: categoryId,
        name: categoryId ? formatCategoryLabel(categoryId, menuCategories) : "Sin categoria",
        products: [],
      };
      group.products.push(product);
      groups.set(categoryId, group);
    }
    const categoryOrder = new Map([...menuCategories].sort(compareCategoryOrder).map((category, index) => [category.id, index]));
    return [...groups.values()].sort((a, b) => {
      if (!a.id) return 1;
      if (!b.id) return -1;
      return (categoryOrder.get(a.id) ?? Infinity) - (categoryOrder.get(b.id) ?? Infinity) || a.name.localeCompare(b.name);
    });
  }, [filteredProducts, categoryFilter, menuCategories]);

  const categoryOptions = useMemo(
    () =>
      [...menuCategories].sort(compareCategoryOrder)
        .map((category) => ({
          ...category,
          count: products.filter((item) => productHasCategory(item, category.id) && (item.type === "receta" || item.type === "combo" || item.type === "bebida")).length,
        }))
        .filter((item) => item.id !== "ingrediente" && item.count > 0),
    [menuCategories, products],
  );

  const cartBaseTotal = useMemo(
    () => cart.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0),
    [cart],
  );

  const pendingBaseTotal = useMemo(() => {
    if (pendingOrder) {
      return pendingOrder.items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
    }
    return cartBaseTotal;
  }, [cartBaseTotal, pendingOrder]);

  const currentPaymentAdjustment = useMemo(
    () => resolvePaymentMethodAdjustment(paymentMethodSettings, paymentMethod),
    [paymentMethod, paymentMethodSettings],
  );
  const currentDiscountPercent = normalizePercent(currentPaymentAdjustment.discountPercent);
  const currentSurchargePercent = normalizePercent(currentPaymentAdjustment.surchargePercent);
  const hasCurrentDiscount = currentDiscountPercent > 0;
  const hasCurrentSurcharge = currentSurchargePercent > 0;

  const paymentDiscountAmount = useMemo(
    () => Math.round(pendingBaseTotal * (normalizePercent(currentPaymentAdjustment.discountPercent) / 100)),
    [currentPaymentAdjustment.discountPercent, pendingBaseTotal],
  );

  const paymentSurchargeAmount = useMemo(
    () => Math.round(pendingBaseTotal * (normalizePercent(currentPaymentAdjustment.surchargePercent) / 100)),
    [currentPaymentAdjustment.surchargePercent, pendingBaseTotal],
  );

  const subtotalAfterPaymentAdjustments = useMemo(
    () => Math.max(0, pendingBaseTotal - paymentDiscountAmount + paymentSurchargeAmount),
    [paymentDiscountAmount, paymentSurchargeAmount, pendingBaseTotal],
  );

  const ivaPercent = normalizePercent(taxSettings.ivaPercent);
  const ivaAmount = useMemo(
    () => Math.round(subtotalAfterPaymentAdjustments * (ivaPercent / 100)),
    [ivaPercent, subtotalAfterPaymentAdjustments],
  );

  const finalTotalForPayment = useMemo(() => {
    if (taxSettings.mode === "add_to_total") {
      return subtotalAfterPaymentAdjustments + ivaAmount;
    }
    return subtotalAfterPaymentAdjustments;
  }, [ivaAmount, subtotalAfterPaymentAdjustments, taxSettings.mode]);
  const showSubtotalLine = pendingBaseTotal !== finalTotalForPayment;
  const paymentCountdownLabel = useMemo(() => {
    const totalSeconds = Math.max(0, Math.ceil(pendingPaymentRemainingMs / 1_000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [pendingPaymentRemainingMs]);
  const isPaymentCountdownWarning = pendingPaymentRemainingMs > 0 && pendingPaymentRemainingMs <= 60_000;

  function chooseProduct(id: string) {
    if (hasPendingPayment) return;
    if (selectedProductId === id) {
      addSelectedProductToCart(true, 1);
      return;
    }
    setSelectedProductId(id); setExcludedIngredients([]);
    setComboSelections({}); setError("");
    if (window.innerWidth <= 828) requestAnimationFrame(() => cartCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function buildCartIngredientConsumption(ignoreCartItemId?: string) {
    const consumption = new Map<string, number>();
    for (const item of cart) {
      if (item.id === ignoreCartItemId) continue;
      const product = products.find((entry) => entry.id === item.productId);
      if (!product) continue;
      for (const [id, quantity] of resolveUnitConsumption(product, mapSelectionsByCategory(item.comboSelections), products, item.excludedIngredients)) {
        consumption.set(id, (consumption.get(id) || 0) + quantity * item.quantity);
      }
    }
    return consumption;
  }

  function resolveProductStock(product: SellableProduct | null | undefined, ignoreCartId: string | null = null): number {
    if (!product) return 0;
    if (systemSettings.allowOutOfStockSales) return Infinity;
    const consumption = resolveUnitConsumption(product, comboSelections, products, excludedIngredients);
    if (!consumption.size) return Infinity;
    const reserved = buildCartIngredientConsumption(ignoreCartId || undefined);
    return Math.max(0, Math.min(...Array.from(consumption, ([id, quantity]) => Math.floor(Math.max(0, Number(id.startsWith("product:") ? products.find((item) => item.id === id.slice(8))?.existencia || 0 : ingredients.find((item) => item.id === id)?.stockQuantity || 0) - (reserved.get(id) || 0)) / quantity))));
  }

  function formatStockLimit(value: number) { return Number.isFinite(value) ? String(value) : "sin limite"; }

  function findSelectedCartItem() {
    if (!selectedProduct) return undefined;
    const key = cartConfigurationKey({
      productId: selectedProduct.id,
      excludedIngredients,
      comboSelections: Object.entries(comboSelections).filter(([, id]) => !!id).map(([category, id]) => ({ category, menuProductId: id.replace(/^menu:/, ""), menuProductName: "" })),
    });
    return cart.find((item) => cartConfigurationKey(item) === key);
  }

  function addSelectedProductToCart(mergeExisting = true, quantity = 1) {
    if (!selectedProduct || hasPendingPayment) return;
    setError("");
    if (!Number.isInteger(quantity) || quantity < 1) { setError("Ingresa una cantidad entera mayor a cero."); return; }
    const groups = (selectedProduct.menuProduct?.comboItems || []).filter((item) => item.type === "category" && item.category);
    const selections = groups.map((group) => {
      const option = getComboCategoryOptions(group, products).find((item) => item.id === comboSelections[group.category!]);
      return option ? { category: group.category!, menuProductId: option.menuProductId!, menuProductName: option.name } : null;
    });
    if (selections.some((item) => !item)) { setError("Elige una opcion en cada grupo."); return; }
    const selectionList = selections.filter((item): item is NonNullable<typeof item> => !!item);
    const components = recipeComponents(selectedProduct, comboSelections, products);
    const excluded = excludedIngredients.filter((item) => components.some((component) => component.menuProductId === item.productId && component.menuProduct?.recipeItems.some((recipeItem) => recipeItem.ingredientId === item.ingredientId && !isRecipeIngredientRequired(recipeItem, component.menuProduct!.recipeItems.length))));
    const existing = mergeExisting ? findSelectedCartItem() : undefined;
    const targetId = existing?.id;
    const nextQuantity = quantity + (existing?.quantity || 0);
    if (nextQuantity > resolveProductStock(selectedProduct, targetId || null)) { setError("No hay stock suficiente para esta cantidad."); return; }
    const item: CartItem = {
      id: targetId || crypto.randomUUID(), productId: selectedProduct.id, productName: selectedProduct.name,
      unitPrice: selectedProduct.price, quantity: nextQuantity, comboSelections: selectionList,
      comboItems: resolveComboItems(selectedProduct, selectionList, products), excludedIngredients: excluded,
    };
    setCart((previous) => targetId ? previous.map((entry) => entry.id === targetId ? item : entry) : [...previous, item]);
  }

  function changeCartQuantity(item: CartItem, delta: number) {
    if (hasPendingPayment) return;
    if (delta > 0 && !systemSettings.allowOutOfStockSales) {
      const product = products.find((entry) => entry.id === item.productId);
      if (!product) return;
      const consumption = resolveUnitConsumption(product, mapSelectionsByCategory(item.comboSelections), products, item.excludedIngredients);
      const reserved = buildCartIngredientConsumption();
      for (const [id, amount] of consumption) {
        const available = Number(id.startsWith("product:") ? products.find((entry) => entry.id === id.slice(8))?.existencia || 0 : ingredients.find((entry) => entry.id === id)?.stockQuantity || 0);
        if ((reserved.get(id) || 0) + amount > available) { setError("No hay stock suficiente para esta cantidad."); return; }
      }
    }
    setCart((previous) => previous.flatMap((entry) => entry.id !== item.id ? [entry] : entry.quantity + delta > 0 ? [{ ...entry, quantity: entry.quantity + delta }] : []));
    setError("");
  }

  function removeFromCart(id: string) {
    if (hasPendingPayment) return;
    setCart((previous) => previous.filter((item) => item.id !== id));
  }

  async function openPaymentModal() {
    setError("");
    setWarning("");
    setMessage("");

    if (hasPendingPayment) {
      if (pendingOrder && isPendingOrderExpired(pendingOrder)) {
        try {
          await updateOrderStatusApi(pendingOrder.id, { status: "cancelada" });
        } catch {
          // no-op: si ya fue cancelada en backend, solo limpiamos estado local
        }
        await reloadProducts();
        setPendingOrder(null);
        setCart([]);
        setDraftOrderCode(generateOrderCode());
        setSelectedProductId(null);

        setIsModalOpen(false);
        setError("");
        setWarning(`Se acabo el tiempo para pagar la orden ${pendingOrder.id}. El pago fue rechazado automaticamente.`);
        setMessage("");
        return;
      }
      setIsModalOpen(true);
      return;
    }

    if (cart.length === 0) {
      setError("Agrega al menos un producto para generar la compra.");
      return;
    }

    try {
      const created = await createOrderApi({
        items: cart.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          comboItems: item.comboItems,
          comboSelections: item.comboSelections,
          comboUnits: item.comboUnits,
          excludedIngredients: item.excludedIngredients,
        })),
        operator: auth.user?.username || "operator",
      });

      setPendingOrder(created);
      setPaymentMethod("efectivo");
      setIsModalOpen(true);
    } catch (error) {
      setError(error instanceof Error && error.message ? error.message : "No se pudo generar la compra.");
    }
  }

  async function rejectPayment() {
    if (!pendingOrder || isApprovingPayment) return;
    setIsApprovingPayment(true);
    try {
      await updateOrderStatusApi(pendingOrder.id, { status: "cancelada" });
      setPendingOrder(null);
      setIsModalOpen(false);
      setError(""); setWarning(""); setMessage("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo volver al pedido.");
    } finally { setIsApprovingPayment(false); }
  }

  async function openCashFromModal() {
    if (!currentUsername) {
      setCashModalError("No hay un usuario activo para abrir caja.");
      return;
    }

    const openingAmount = parseOpeningAmount(openingAmountInput);
    if (openingAmount === null) {
      setCashModalError("Ingresa un monto valido para abrir caja.");
      return;
    }

    setCashModalError("");
    setIsOpeningCashFromModal(true);
    setError("");
    setWarning("");
    setMessage("");
    try {
      await openCashWithAmount(currentUsername, openingAmount);
      setIsCashOpen(true);
      setOpeningAmountInput("");
      setMessage("Caja abierta. Ya puedes continuar con la venta.");
    } catch (error) {
      setCashModalError(error instanceof Error && error.message ? error.message : "No se pudo abrir caja desde esta pantalla.");
    } finally {
      setIsOpeningCashFromModal(false);
    }
  }

  async function approvePayment() {
    if (!pendingOrder) {
      setError("No hay compra pendiente para aprobar.");
      return;
    }

    setError("");
    setWarning("");
    setMessage("");
    setIsApprovingPayment(true);

    try {
      const paid = await updateOrderStatusApi(pendingOrder.id, {
        status: "pagada",
        paymentMethod,
        total: finalTotalForPayment,
      });

      const createdInvoice = await createInvoiceApi({
        orderId: pendingOrder.id,
        total: finalTotalForPayment,
        paymentMethod,
        operator: auth.user?.username || "operator",
      });

      const summaryState = {
        orderId: pendingOrder.id,
        orderCode: pendingOrder.id,
        invoiceId: createdInvoice.id,
        createdAt: createdInvoice.createdAt || paid.createdAt,
        operator: auth.user?.username || "operator",
        paymentMethod,
        items: pendingOrder.items,
        total: paid.total,
      };

      if (auth.user?.username) {
        await addOrderToCurrentWorkdayApi(auth.user.username, paid.id);
      }

      await reloadProducts();
      setPendingOrder(null);
      setCart([]);
      setDraftOrderCode(generateOrderCode());
      setSelectedProductId(null);
      setIsModalOpen(false);
      setWarning("");
      setMessage("");
      nav("/sales/summary", { state: summaryState });
    } catch (error) {
      setWarning("");
      setError(error instanceof Error && error.message ? error.message : "No se pudo confirmar el pago. La orden puede haber sido cancelada por tiempo.");
    } finally {
      setIsApprovingPayment(false);
    }
  }

  const generateLabel = hasPendingPayment ? "Continuar cobro" : "Cobrar";
  const orderCodeLabel = pendingOrder?.id || draftOrderCode;
  const shouldDisableSalesContent = !isCashStateResolved || !isCashOpenForSession;
  const shouldShowClosedCashModal = Boolean(currentUsername) && isCashStateResolved && !isCashOpenForSession;
  const clearHeaderNotice = () => {
    setError("");
    setWarning("");
    setMessage("");
  };

  return (
    <div className={styles.page}>
      <div className={`${styles.content} ${shouldDisableSalesContent ? styles.contentDisabled : ""}`}>
        <header className={styles.header}>
          <div className={styles.headerLead}>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Ventas" }]} asTitle />
            <p className={styles.subtitle}>
              Elige productos, personaliza el pedido y continua al cobro.
            </p>
          </div>
          <HeaderOperationNotice
            className={styles.headerNotice}
            message={message}
            warning={warning}
            error={error}
            onClose={clearHeaderNotice}
          />
          <SessionStatusBar showSalesShortcut={false} />
        </header>
        <p className={styles.orderReference}>Pedido {orderCodeLabel}</p>
        <div className={styles.layout}>
          <section className={styles.listCard}>
            <div className={styles.catalogFilters}>
            <div className={styles.categoryFilters} aria-label="Categorias de productos">
              <button
                type="button"
                className={`${styles.categoryFilterBtn} ${categoryFilter ? "" : styles.categoryFilterBtnActive}`.trim()}
                onClick={() => setCategoryFilter("")}
              >
                Todas
              </button>
              {categoryOptions.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`${styles.categoryFilterBtn} ${
                    categoryFilter === category.id ? styles.categoryFilterBtnActive : ""
                  }`.trim()}
                  onClick={() => setCategoryFilter(category.id)}
                >
                  {category.name}
                </button>
              ))}
            </div>
            <div className={styles.salesFilters}>
              <label className={styles.salesFilterField}>
                <span>Producto</span>
                <input value={nameFilter} onChange={(event) => setNameFilter(event.target.value)} placeholder="Nombre del producto" />
              </label>
              <label className={styles.salesFilterField}>
                <span>Precio</span>
                <input value={priceFilter} onChange={(event) => setPriceFilter(event.target.value)} placeholder="Filtrar por precio" inputMode="numeric" />
              </label>
            </div>
            </div>
            <div className={styles.groupedCatalog} aria-label="Catalogo de productos">
              {loading && <p>Cargando productos...</p>}
              {!loading && !filteredProducts.length && <p>No hay productos para estos filtros.</p>}
              {productGroups.map((group) => <section key={group.id} className={styles.productCategory} aria-label={group.name}>
                <h3 className={styles.productCategoryTitle}>{group.name}<span>{group.products.length}</span></h3>
                <div className={styles.productGrid}>
                  {group.products.map((product) => <button key={product.id} className={styles.productCard} title={product.name} disabled={hasPendingPayment} onClick={() => chooseProduct(product.id)} aria-pressed={selectedProductId === product.id}>
                    {product.imageUrl && <img src={resolveImageUrl(product.imageUrl)} alt="" loading="lazy" />}<span>{formatCatalogProductName(product.name, `${group.id} ${group.name}`)}</span><strong>{formatMoneyARS(product.price)}</strong>
                  </button>)}
                </div>
              </section>)}
            </div>
          </section>
          <section ref={cartCardRef} className={styles.cartCard} aria-label="Pedido y personalizacion">
            {selectedProduct ? <>
              <div className={styles.selectedBox}><div className={styles.selectedProductRow}>
                {selectedImageUrl ? <img className={styles.selectedProductImg} src={selectedImageUrl} alt={selectedProduct.name} /> : <div className={styles.selectedProductFallback}>{selectedProduct.name.slice(0, 1)}</div>}
                <div className={styles.selectedProductInfo}><h3 className={styles.selectedName}>{selectedProduct.name}</h3><strong className={styles.selectedPrice}>{formatMoneyARS(selectedProduct.price)}</strong>
                  {selectedProduct.description && <p className={styles.subtitle}>{selectedProduct.description}</p>}
                  {!systemSettings.allowOutOfStockSales && <small>{selectedProductStockLabel}</small>}
                </div>
              </div></div>
              {recipeComponents(selectedProduct, comboSelections, products).filter((component) => component.menuProduct?.recipeItems.length).map((component, index) => <fieldset key={component.id + index} className={styles.customizationGroup}>
                <legend>{selectedProduct.menuProduct?.kind === "combo" ? component.name : "Ingredientes"}</legend>
                <div className={styles.ingredientGroups}>{[...ingredientCategories, { id: "", name: "Sin categoria" }]
                  .map((category) => ({ ...category, items: component.menuProduct!.recipeItems.filter((item) => {
                    const categoryId = ingredients.find((entry) => entry.id === item.ingredientId)?.categoryId;
                    return category.id ? categoryId === category.id : !ingredientCategories.some((entry) => entry.id === categoryId);
                  }) }))
                  .filter((group) => group.items.length)
                  .sort((a, b) => {
                    const order = ["panificados", "carnes", "lacteos", "vegetales", "salsas", "sin categoria", "bebidas"];
                    const rank = (name: string) => { const index = order.indexOf(normalizeForSearch(name)); return index < 0 ? 5.5 : index; };
                    return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, "es");
                  }).map((group) => <div key={group.id} className={styles.ingredientGroup}>
                    <strong className={styles.ingredientGroupName}>{group.name}</strong>
                    <div className={styles.ingredientList}>{group.items.sort((a, b) => a.ingredientName.localeCompare(b.ingredientName, "es")).map((ingredient) => isRecipeIngredientRequired(ingredient, component.menuProduct!.recipeItems.length) ? <div key={ingredient.ingredientId} className={styles.ingredientText}>
                  <span>{ingredient.ingredientName}</span>
                </div> : <label key={ingredient.ingredientId} className={styles.ingredientOption}>
                  <input type="checkbox" checked={!excludedIngredients.some((item) => item.productId === component.menuProductId && item.ingredientId === ingredient.ingredientId)} disabled={hasPendingPayment} onChange={(event) => {
                    const entry = { productId: component.menuProductId!, ingredientId: ingredient.ingredientId, ingredientName: ingredient.ingredientName };
                    setExcludedIngredients((previous) => event.target.checked ? previous.filter((item) => item.productId !== entry.productId || item.ingredientId !== entry.ingredientId) : [...previous, entry]);
                  }} />{ingredient.ingredientName}
                </label>)}</div>
                  </div>)}</div>
              </fieldset>)}
              {(selectedProduct.menuProduct?.comboItems || []).filter((item) => item.type === "category" && item.category).map((group) => <fieldset key={group.category} className={styles.customizationGroup}>
                <legend>{group.categoryName || formatCategoryLabel(group.category!, menuCategories)}</legend>
                <div className={styles.optionGrid}>{getComboCategoryOptions(group, products).map((option) => <label className={styles.optionCard} key={option.id}>
                  <input type="radio" name={"option-" + group.category} checked={comboSelections[group.category!] === option.id} disabled={hasPendingPayment} onChange={() => { setComboSelections((previous) => ({ ...previous, [group.category!]: option.id })); setExcludedIngredients((previous) => previous.filter((entry) => recipeComponents(selectedProduct, { ...comboSelections, [group.category!]: option.id }, products).some((component) => component.menuProductId === entry.productId))); }} />{option.name}
                </label>)}</div>
              </fieldset>)}
            </> : <p className={styles.empty}>Selecciona un producto del catalogo para ver sus opciones.</p>}
            <div className={styles.orderHeading}><h2 className={styles.cardTitle}>Tu pedido</h2><span>{cart.reduce((sum, item) => sum + item.quantity, 0)} productos</span></div>
            <div className={styles.orderItems}>
              {!cart.length && <p className={styles.empty}>El pedido esta vacio.</p>}
              {cart.map((item) => <article key={item.id} className={styles.orderItem}>
                <strong className={styles.orderLineName} title={[item.productName, ...(item.comboItems || []).map((entry) => entry.menuProductName), ...(item.excludedIngredients || []).map((entry) => "Sin " + entry.ingredientName)].join(" · ")}>{item.quantity}x {item.productName}{!!item.excludedIngredients?.length && <small> · {item.excludedIngredients.map((entry) => "Sin " + entry.ingredientName).join(", ")}</small>}</strong>
                <span className={styles.orderLineLeader} />
                <strong className={styles.orderLinePrice}>{formatMoneyARS(item.unitPrice * item.quantity)}</strong>
                <button type="button" className={styles.orderLineButton} disabled={hasPendingPayment} onClick={() => changeCartQuantity(item, 1)} aria-label={"Sumar " + item.productName}>+</button>
                <button type="button" className={styles.orderLineButton} disabled={hasPendingPayment} onClick={() => changeCartQuantity(item, -1)} aria-label={"Restar " + item.productName}>-</button>
                <button type="button" className={styles.orderLineRemove} disabled={hasPendingPayment} onClick={() => removeFromCart(item.id)} aria-label={"Quitar " + item.productName}>X</button>
              </article>)}
            </div>
            <div className={styles.totals}>
              <p className={styles.totalLabel}>Total</p>
              <p className={styles.totalValue}>{formatMoneyARS(cartBaseTotal)}</p>
              <button className={styles.checkoutBtn} onClick={openPaymentModal} disabled={!cart.length || isApprovingPayment || !isCashOpenForSession}>{generateLabel}</button>
            </div>
          </section>


        </div>
      </div>

      {isModalOpen ? (
        <div
          className={`${styles.modalOverlay} ${styles.paymentOverlay}`}
          role="presentation"
          onClick={() => {
            if (!isApprovingPayment) void rejectPayment();
          }}
        >
          <section
            className={`${styles.modalCard} ${styles.paymentModalCard}`}
            role="dialog"
            aria-modal="true"
            aria-label="Pago de compra"
            onClick={(event) => event.stopPropagation()}

          >
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleWrap}>
                <h3 className={styles.modalTitle}>Orden: {pendingOrder?.id || "-"}</h3>
                {hasPendingPayment ? (
                  <p className={`${styles.paymentTimer} ${isPaymentCountdownWarning ? styles.paymentTimerWarning : ""}`}>
                    Tiempo restante: <strong>{paymentCountdownLabel}</strong>
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => void rejectPayment()}
                disabled={isApprovingPayment}
                aria-label="Cerrar modal de pago"
              >
                Volver
              </button>
            </div>
            <div className={styles.methodGrid}>
              {PAYMENT_METHODS.map((method) => {
                const methodAdjustment = resolvePaymentMethodAdjustment(paymentMethodSettings, method);
                const methodDiscountPercent = normalizePercent(methodAdjustment.discountPercent);
                const methodSurchargePercent = normalizePercent(methodAdjustment.surchargePercent);
                const methodAdjustments = [
                  methodDiscountPercent > 0 ? `-${methodDiscountPercent}%` : "",
                  methodSurchargePercent > 0 ? `+${methodSurchargePercent}%` : "",
                ].filter(Boolean);

                return (
                  <button
                    key={method}
                    type="button"
                    className={`${styles.methodBtn} ${paymentMethod === method ? styles.methodBtnActive : ""}`}
                    onClick={() => setPaymentMethod(method)}
                    disabled={isApprovingPayment}
                  >
                    <span>{formatPaymentMethodLabel(method)}</span>
                    {methodAdjustments.length > 0 ? <small className={styles.methodMeta}>{methodAdjustments.join(" / ")}</small> : null}
                  </button>
                );
              })}
            </div>

            <div className={styles.modalTotals}>
              {showSubtotalLine ? (
                <p className={styles.modalHint}>
                  Subtotal: <strong>{formatMoneyARS(pendingBaseTotal)}</strong>
                </p>
              ) : null}
              {hasCurrentDiscount ? (
                <p className={styles.modalHint}>
                  Descuento ({currentDiscountPercent}%): <strong className={styles.amountDiscount}>-{formatMoneyARS(paymentDiscountAmount)}</strong>
                </p>
              ) : null}
              {hasCurrentSurcharge ? (
                <p className={styles.modalHint}>
                  Sobrecargo ({currentSurchargePercent}%):{" "}
                  <strong className={styles.amountSurcharge}>+{formatMoneyARS(paymentSurchargeAmount)}</strong>
                </p>
              ) : null}
              <p className={styles.modalTotalValue}>
                Total: <span className={styles.modalTotalAmount}>{formatMoneyARS(finalTotalForPayment)}</span>
              </p>
            </div>

            <div className={`${styles.modalActions} ${styles.paymentActions}`}>
              <button
                type="button"
                className={`${styles.dangerBtn} ${styles.paymentActionBtn}`}
                onClick={rejectPayment}
                disabled={isApprovingPayment}
              >
                Volver al pedido
              </button>
              <button
                type="button"
                className={`${styles.primaryBtn} ${styles.paymentActionBtn}`}
                onClick={approvePayment}
                disabled={isApprovingPayment}
              >
                {isApprovingPayment ? "Procesando..." : "Confirmar cobro"}
              </button>
            </div>

          </section>
        </div>
      ) : null}

      {shouldShowClosedCashModal ? (
        <div className={styles.modalOverlay} role="presentation">
          <section className={styles.modalCard} role="dialog" aria-modal="true" aria-label="Caja cerrada">
            <h3 className={styles.modalTitle}>Apertura de caja</h3>
            <p className={styles.modalHint}>Usuario: {auth.user?.username || "-"}</p>
            <p className={`${styles.modalHint} ${styles.modalStatusLine}`}>
              Estado: <span className={styles.modalHintError}>Cerrada</span>
            </p>
            {isAdmin ? (
              <p className={styles.modalHint}>
                Perfil administrador: puedes abrir caja con el monto real ingresado, sin monto ni horario asignados.
              </p>
            ) : typeof assignedOpeningAmount === "number" && assignedOpeningAmount > 0 ? (
              <p className={styles.modalHint}>
                Monto asignado por administracion:{" "}
                <span className={styles.assignedAmount}>{formatMoneyARS(assignedOpeningAmount)}</span>.
              </p>
            ) : null}
            <form
              className={styles.closedCashInlineForm}
              onSubmit={(event) => {
                event.preventDefault();
                void openCashFromModal();
              }}
            >
              <label className={styles.closedCashField}>
                <span>Efectivo recibido para abrir caja</span>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  step={1}
                  value={openingAmountInput}
                  onChange={(event) => setOpeningAmountInput(event.target.value)}
                  placeholder="0"
                />
              </label>
              <button type="submit" className={styles.primaryBtn} disabled={isOpeningCashFromModal || !currentUsername}>
                {isOpeningCashFromModal ? "Abriendo..." : "Abrir caja"}
              </button>
            </form>
            {cashModalError ? <p className={styles.inlineError}>{cashModalError}</p> : null}
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => nav("/operation")}
                disabled={isOpeningCashFromModal}
              >
                Volver
              </button>
              <button type="button" className={styles.secondaryBtn} onClick={() => nav("/cash")} disabled={isOpeningCashFromModal}>
                Ir a caja
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

