import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import HeaderOperationNotice from "../../../app/component/HeaderOperationNotice";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import ProductTable from "../../product/component/ProductTable";
import type { Product, ProductSortKey } from "../../product/model/product.types";
import { fetchProducts } from "../../product/service/product.api";
import type { MenuProduct } from "../../menu/model/menu.types";
import { fetchMenuProductsApi } from "../../menu/service/menu.api";
import { formatDateAR, formatMoneyARS } from "../../../shared/format/locale";
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
import { createStockEntryApi } from "../../stock/service/stock.api";
import { resolveImageUrl } from "../../../shared/image/image.service";
import {
  addOrderToCurrentWorkdayApi,
  fetchCashOpeningAssignmentsApi,
  onCashStatusChanged,
} from "../../cash/service/cash.api";
import { openCashWithAmount, syncCashState as syncCashStateService } from "../../cash/service/cash.operation";
import styles from "./SalesScreen.module.css";

type CartItem = {
  id: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  comboItems?: Array<{ menuProductId: string; menuProductName: string; quantity: number }>;
  comboSelections?: Array<{ category: string; menuProductId: string; menuProductName: string }>;
};

type SellableProduct = Product & {
  saleSource?: "product" | "menu";
  menuProductId?: string;
  menuProduct?: MenuProduct;
};

function buildMenuSaleProductId(menuProductId: string): string {
  return `menu:${menuProductId}`;
}

function isMenuSaleProductId(productId: string): boolean {
  return productId.startsWith("menu:");
}

function formatCategoryLabel(category: string) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function mapMenuProductToSellableProduct(menuProduct: MenuProduct): SellableProduct {
  return {
    id: buildMenuSaleProductId(menuProduct.id),
    name: menuProduct.name,
    price: menuProduct.price,
    costPrice: 0,
    createdAt: menuProduct.createdAt,
    imageUrl: menuProduct.imageUrl,
    category: menuProduct.category || "hamburguesa",
    brand: "Menu",
    existencia: 9999,
    saleSource: "menu",
    menuProductId: menuProduct.id,
    menuProduct,
  };
}

function resolveComboItems(product: SellableProduct, selections: NonNullable<CartItem["comboSelections"]>, products: SellableProduct[]) {
  return (product.menuProduct?.comboItems || [])
    .map((item) => {
      const selection = selections.find((node) => node.category === item.category);
      const selectedProduct =
        item.type === "category"
          ? products.find((candidate) => candidate.menuProductId === selection?.menuProductId)
          : products.find((candidate) => candidate.menuProductId === item.menuProductId);
      if (!selectedProduct?.menuProductId) return null;
      return {
        menuProductId: selectedProduct.menuProductId,
        menuProductName: selectedProduct.name,
        quantity: Math.max(1, Math.trunc(Number(item.quantity || 1))),
      };
    })
    .filter((item): item is NonNullable<typeof item> => !!item);
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
  const listCardRef = useRef<HTMLElement | null>(null);
  const [products, setProducts] = useState<SellableProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [quantityToAdd, setQuantityToAdd] = useState("1");
  const [comboSelections, setComboSelections] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<CartItem[]>([]);
  const [draftOrderCode, setDraftOrderCode] = useState(() => generateOrderCode());
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");

  const [nameFilter, setNameFilter] = useState("");
  const [barcodeFilter, setBarcodeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priceFilter, setPriceFilter] = useState("");
  const [createdAtFilter, setCreatedAtFilter] = useState("");
  const [sortKey, setSortKey] = useState<ProductSortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [hasUserSorted, setHasUserSorted] = useState(false);

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
  const [paymentModalTop, setPaymentModalTop] = useState<number | null>(null);
  const [paymentModalLeft, setPaymentModalLeft] = useState<number | null>(null);
  const [paymentModalWidth, setPaymentModalWidth] = useState<number | null>(null);
  const [pendingPaymentRemainingMs, setPendingPaymentRemainingMs] = useState(0);
  const currentUsername = auth.user?.username ?? "";
  const isAdmin = auth.user?.role === "admin";
  const isCashOpenForSession = isCashOpen;

  async function reloadProducts() {
    setLoading(true);
    try {
      const [productList, menuProductList] = await Promise.all([fetchProducts(), fetchMenuProductsApi()]);
      const menuSellables = menuProductList.map((item) => mapMenuProductToSellableProduct(item));
      const menuNames = new Set(menuSellables.map((item) => normalizeForSearch(item.name)));
      const nonDuplicatedProducts = productList.filter((item) => !menuNames.has(normalizeForSearch(item.name)));
      setProducts([...menuSellables, ...nonDuplicatedProducts]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reloadProducts();
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

  const selectedProductIsMenu = selectedProduct?.saleSource === "menu" || isMenuSaleProductId(selectedProduct?.id || "");
  const selectedProductStock = selectedProductIsMenu ? Number.POSITIVE_INFINITY : Math.max(0, Math.trunc(Number(selectedProduct?.existencia || 0)));
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
      setQuantityToAdd("1");
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

  useEffect(() => {
    setQuantityToAdd("1");
    const selections: Record<string, string> = {};
    for (const item of selectedProduct?.menuProduct?.comboItems || []) {
      if (item.type !== "category" || !item.category) continue;
      selections[item.category] = products.find((product) => product.category === item.category && product.saleSource === "menu" && product.menuProduct?.kind !== "combo")?.id || "";
    }
    setComboSelections(selections);
  }, [products, selectedProduct, selectedProductId]);

  useEffect(() => {
    if (!isModalOpen) return;
    const syncModalPlacement = () => {
      const formRect = cartCardRef.current?.getBoundingClientRect();
      const listRect = listCardRef.current?.getBoundingClientRect();
      if (!formRect || !listRect) {
        setPaymentModalTop(null);
        setPaymentModalLeft(null);
        setPaymentModalWidth(null);
        return;
      }
      if (window.innerWidth <= 620) {
        setPaymentModalTop(null);
        setPaymentModalLeft(null);
        setPaymentModalWidth(null);
        return;
      }
      const formTop = Math.max(8, Math.round(formRect.top));
      const targetWidth = Math.max(320, Math.min(Math.round(listRect.width || 0), 760));
      setPaymentModalTop(formTop);
      setPaymentModalLeft(Math.round(listRect.left));
      setPaymentModalWidth(targetWidth);
    };
    syncModalPlacement();
    window.addEventListener("resize", syncModalPlacement);
    return () => {
      window.removeEventListener("resize", syncModalPlacement);
    };
  }, [isModalOpen, cart.length, pendingOrder?.id, selectedProductId]);

  useEffect(() => {
    if (isModalOpen) return;
  }, [isModalOpen]);

  const filteredProducts = useMemo(() => {
    const q = normalizeForSearch(nameFilter);
    const c = normalizeForSearch(categoryFilter);
    const p = priceFilter.replace(/\D/g, "");
    let list = products;

    if (q) list = list.filter((item) => normalizeForSearch(item.name).includes(q));
    if (barcodeFilter.trim()) {
      const barcodeQuery = barcodeFilter.trim();
      list = list.filter((item) => (item.barcode || "").includes(barcodeQuery));
    }
    if (c) {
      list = list.filter((item) => normalizeForSearch(item.category || "").includes(c));
    }
    if (p) list = list.filter((item) => matchesPriceFilter(item.price, p));
    if (createdAtFilter) {
      list = list.filter((item) => (item.ultimoIngreso || item.createdAt).slice(0, 10) === createdAtFilter);
    }

    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      if (sortKey === "brand") return (a.brand || "").localeCompare(b.brand || "") * dir;
      if (sortKey === "category") return (a.category || "").localeCompare(b.category || "") * dir;
      if (sortKey === "price") return (a.price - b.price) * dir;
      if (sortKey === "existencia") return (Number(a.existencia || 0) - Number(b.existencia || 0)) * dir;
      return (new Date(a.ultimoIngreso || a.createdAt).getTime() - new Date(b.ultimoIngreso || b.createdAt).getTime()) * dir;
    });
  }, [products, nameFilter, barcodeFilter, categoryFilter, priceFilter, createdAtFilter, sortKey, sortDir]);

  const categoryOptions = useMemo(
    () =>
      [...new Set(products.map((item) => (item.category || "").trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [products],
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

  function handleSortChange(nextKey: ProductSortKey) {
    setHasUserSorted(true);
    if (sortKey === nextKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir("asc");
  }

  function handleClearSort() {
    setSortKey("createdAt");
    setSortDir("desc");
    setHasUserSorted(false);
  }

  function handleFilterChange(key: "name" | "barcode" | "category" | "price" | "existencia" | "createdAt", value: string) {
    if (key === "name") setNameFilter(value);
    if (key === "barcode") setBarcodeFilter(value);
    if (key === "category") setCategoryFilter(value);
    if (key === "price") setPriceFilter(value);
    if (key === "createdAt") setCreatedAtFilter(value);
  }

  function resolveProductStock(product: SellableProduct | null | undefined): number {
    if (!product) return 0;
    if (product.saleSource === "menu" || isMenuSaleProductId(product.id)) return Number.POSITIVE_INFINITY;
    return Math.max(0, Math.trunc(Number(product.existencia || 0)));
  }

  function formatStockLimit(value: number): string {
    return Number.isFinite(value) ? String(value) : "disponible";
  }

  function addProductToCart(product: SellableProduct, rawQuantity: number) {
    setError("");
    setWarning("");
    setMessage("");

    if (hasPendingPayment) {
      setError("Hay una compra pendiente de pago. Reintenta o termina esa compra.");
      return;
    }

    const nextQuantity = Math.trunc(Number(rawQuantity));
    if (!Number.isFinite(nextQuantity) || nextQuantity < 1) {
      setError("La cantidad debe ser un numero mayor o igual a 1.");
      return;
    }

    const productStock = resolveProductStock(product);
    if (nextQuantity > productStock) {
      setError(`No puedes agregar mas de ${formatStockLimit(productStock)} unidades.`);
      return;
    }

    const categoryItems = (product.menuProduct?.comboItems || []).filter((item) => item.type === "category" && item.category);
    const resolvedSelections = categoryItems.map((item) => {
      const selected = products.find((candidate) => candidate.id === comboSelections[item.category!]);
      return selected ? { category: item.category!, menuProductId: selected.menuProductId || selected.id.replace(/^menu:/, ""), menuProductName: selected.name } : null;
    });
    if (resolvedSelections.some((selection) => !selection)) {
      setError("Selecciona una opcion para cada categoria del combo.");
      return;
    }
    const selectionList = resolvedSelections.filter((selection): selection is NonNullable<typeof selection> => !!selection);
    const componentList = resolveComboItems(product, selectionList, products);
    const cartItemId = `${product.id}:${selectionList.map((selection) => selection.menuProductId).join(",") || "fixed"}`;

    setSelectedProductId(product.id);
    setCart((current) => {
      const existing = current.find((item) => item.id === cartItemId);
      if (!existing) {
        return [
          ...current,
          {
            id: cartItemId,
            productId: product.id,
            productName: product.name,
            unitPrice: product.price,
            quantity: nextQuantity,
            comboItems: componentList.length ? componentList : undefined,
            comboSelections: selectionList.length ? selectionList : undefined,
          },
        ];
      }

      const combinedQuantity = existing.quantity + nextQuantity;
      if (combinedQuantity > productStock) {
        setError(`No puedes superar la existencia (${formatStockLimit(productStock)}) para ${product.name}.`);
        return current;
      }

      return current.map((item) => {
        if (item.id !== cartItemId) return item;
        return { ...item, quantity: combinedQuantity };
      });
    });
  }

  function addSelectedProductToCart() {
    if (!selectedProduct) {
      setError("Selecciona un producto.");
      return;
    }
    addProductToCart(selectedProduct, Number(quantityToAdd));
  }

  function handleProductRowDoubleClick(product: Product) {
    addProductToCart(product, 1);
  }

  function removeFromCart(cartItemId: string) {
    if (hasPendingPayment) {
      setError("Hay una compra pendiente de pago. Reintenta o termina esa compra.");
      return;
    }
    setCart((current) => current.filter((item) => item.id !== cartItemId));
  }

  function updateCartItemQuantity(cartItemId: string, nextValue: string) {
    const parsed = Math.trunc(Number(nextValue));
    if (!Number.isFinite(parsed) || parsed < 1) return;

    const cartItem = cart.find((item) => item.id === cartItemId);
    const productStock = resolveProductStock(products.find((item) => item.id === cartItem?.productId));

    const maxAllowed = Math.max(1, productStock);
    const clamped = Math.min(parsed, maxAllowed);

    if (parsed > productStock) {
      const productName = products.find((item) => item.id === cartItem?.productId)?.name || "el producto";
      setError(`No puedes superar la existencia (${formatStockLimit(productStock)}) para ${productName}.`);
    } else {
      setError("");
    }

    setCart((current) =>
      current.map((item) => {
        if (item.id !== cartItemId) return item;
        return { ...item, quantity: clamped };
      }),
    );
  }

  function incrementCartItemQuantity(cartItemId: string) {
    if (hasPendingPayment) {
      setError("Hay una compra pendiente de pago. Reintenta o termina esa compra.");
      return;
    }

    const currentItem = cart.find((item) => item.id === cartItemId);
    const product = products.find((item) => item.id === currentItem?.productId);
    if (!product || !currentItem) return;

    const productStock = resolveProductStock(product);
    const nextQuantity = currentItem.quantity + 1;
    if (nextQuantity > productStock) {
      setError(`No puedes superar la existencia (${formatStockLimit(productStock)}) para ${product.name}.`);
      return;
    }

    setError("");
    setCart((current) =>
      current.map((item) => (item.id === cartItemId ? { ...item, quantity: item.quantity + 1 } : item)),
    );
  }

  function decrementCartItemQuantity(cartItemId: string) {
    if (hasPendingPayment) {
      setError("Hay una compra pendiente de pago. Reintenta o termina esa compra.");
      return;
    }

    const currentItem = cart.find((item) => item.id === cartItemId);
    if (!currentItem) return;

    setError("");
    if (currentItem.quantity <= 1) {
      setCart((current) => current.filter((item) => item.id !== cartItemId));
      return;
    }

    setCart((current) =>
      current.map((item) => (item.id === cartItemId ? { ...item, quantity: item.quantity - 1 } : item)),
    );
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
        setQuantityToAdd("1");
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
        })),
        operator: auth.user?.username || "operator",
      });

      setPendingOrder(created);
      setPaymentMethod("efectivo");
      setIsModalOpen(true);
    } catch {
      setError("No se pudo generar la compra.");
    }
  }

  function rejectPayment() {
    setIsModalOpen(false);
    setError("");
    setWarning("Pago rechazado. Puedes volver a intentarlo antes de que venza el tiempo.");
    setMessage("");
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

      for (const item of pendingOrder.items) {
        if (isMenuSaleProductId(item.productId)) continue;
        await createStockEntryApi({
          productId: item.productId,
          quantity: -Math.trunc(item.quantity),
          description: `Venta orden ${pendingOrder.id}`,
        });
      }

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
      setQuantityToAdd("1");
      setIsModalOpen(false);
      setWarning("");
      setMessage("");
      nav("/sales/summary", { state: summaryState });
    } catch {
      setWarning("");
      setError("No se pudo confirmar el pago. La orden puede haber sido cancelada por tiempo.");
    } finally {
      setIsApprovingPayment(false);
    }
  }

  const generateLabel = "Pagar";
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
              Arma la compra y simula la aprobacion o rechazo del pago (vence en {PENDING_PAYMENT_TIMEOUT_MINUTES} min por defecto).
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

        <div className={styles.layout}>
          <section ref={cartCardRef} className={styles.cartCard}>
            <h2 className={styles.cardTitle}>Orden {orderCodeLabel}</h2>

            <div className={styles.selectedBox}>
              <div className={styles.selectedProductRow}>
                {selectedImageUrl ? (
                  <img className={styles.selectedProductImg} src={selectedImageUrl} alt={selectedProduct?.name || "Producto"} />
                ) : (
                  <div className={styles.selectedProductFallback}>
                    {(selectedProduct?.name || "P").slice(0, 1).toUpperCase()}
                  </div>
                )}

                <div className={styles.selectedProductInfo}>
                  <div>
                    <div className={styles.selectedLabel}>Producto seleccionado</div>
                    <p className={styles.selectedName}>{selectedProduct?.name || "Sin seleccionar"}</p>
                    <p className={styles.selectedStock}>
                      {selectedProductIsMenu ? "Tipo: producto de menu" : `Existencia: ${selectedProductStock}`}
                    </p>
                  </div>

                  <div className={styles.quantityActionRow}>
                    {(selectedProduct?.menuProduct?.comboItems || []).filter((item) => item.type === "category" && item.category).map((item) => (
                      <label key={item.category} className={styles.quantityRow}>
                        <span>{item.categoryName || formatCategoryLabel(item.category!)} a eleccion</span>
                        <select className={styles.input} value={comboSelections[item.category!] || ""} onChange={(event) => setComboSelections((current) => ({ ...current, [item.category!]: event.target.value }))} disabled={hasPendingPayment}>
                          <option value="">Seleccionar</option>
                          {products.filter((product) => product.saleSource === "menu" && product.menuProduct?.kind !== "combo" && product.category === item.category).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                        </select>
                      </label>
                    ))}
                    <label className={styles.quantityRow}>
                      <span>Cantidad</span>
                      <input
                        type="number"
                        min={1}
                        max={Number.isFinite(selectedProductStock) ? selectedProductStock : undefined}
                        value={quantityToAdd}
                        onChange={(event) => setQuantityToAdd(event.target.value)}
                        className={`${styles.input} ${styles.quantityInput}`}
                        disabled={!selectedProduct || selectedProductStock < 1 || hasPendingPayment}
                      />
                    </label>

                    <button
                      type="button"
                      className={`${styles.secondaryBtn} ${styles.addProductBtn}`}
                      onClick={addSelectedProductToCart}
                      disabled={!selectedProduct || selectedProductStock < 1 || hasPendingPayment}
                    >
                      Agregar producto
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.cartList}>
              <div className={styles.cartHead}>
                <div>Producto</div>
                <div>Cant.</div>
                <div>Precio</div>
                <div>Subtotal</div>
                <div />
              </div>

              {cart.length === 0 ? (
                <p className={styles.empty}>Aun no agregaste productos.</p>
              ) : (
                cart.map((item, index) => {
                  const isOddRow = index % 2 === 0;
                  const isSelectedRow = item.productId === selectedProductId;
                  return (
                    <div
                      className={`${styles.cartRow} ${isOddRow ? styles.cartRowOdd : ""} ${isSelectedRow ? styles.cartRowSelected : ""}`}
                      key={item.id}
                    >
                      <div className={styles.cellProduct}>
                        <span>{item.productName}</span>
                        {item.comboItems?.length ? (
                          <div className={styles.comboItems}>
                            {item.comboItems.map((comboItem) => (
                              <span key={comboItem.menuProductId}>
                                + {comboItem.quantity > 1 ? `${comboItem.quantity} x ` : ""}{comboItem.menuProductName}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className={styles.cellQty}>
                        <div className={styles.cartQtyStepper}>
                          <button
                            type="button"
                            className={styles.cartQtyStepBtn}
                            onClick={() => decrementCartItemQuantity(item.id)}
                            disabled={hasPendingPayment}
                            aria-label={`Quitar una unidad de ${item.productName}`}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={Number.isFinite(resolveProductStock(products.find((p) => p.id === item.productId))) ? resolveProductStock(products.find((p) => p.id === item.productId)) : undefined}
                            value={item.quantity}
                            onChange={(e) => updateCartItemQuantity(item.id, e.target.value)}
                            className={styles.cartQtyInput}
                            disabled={hasPendingPayment}
                            aria-label={`Cantidad para ${item.productName}`}
                          />
                          <button
                            type="button"
                            className={styles.cartQtyStepBtn}
                            onClick={() => incrementCartItemQuantity(item.id)}
                            disabled={hasPendingPayment}
                            aria-label={`Agregar una unidad de ${item.productName}`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className={styles.cellPrice}>
                        <span>{formatMoneyARS(item.unitPrice)}</span>
                      </div>
                      <div className={styles.cellSubtotal}>{formatMoneyARS(item.unitPrice * item.quantity)}</div>
                      <button
                        type="button"
                        className={styles.cartRemoveBtn}
                        onClick={() => removeFromCart(item.id)}
                        disabled={hasPendingPayment}
                        aria-label={`Quitar ${item.productName}`}
                      >
                        X
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className={styles.totals}>
              <p className={styles.totalLabel}>Total base</p>
              <p className={styles.totalValue}>{formatMoneyARS(cartBaseTotal)}</p>
            </div>

            <button
              type="button"
              className={styles.primaryBtn}
              onClick={openPaymentModal}
              disabled={cart.length === 0 || isApprovingPayment || !isCashOpenForSession}
            >
              {generateLabel}
            </button>
          </section>

          <section ref={listCardRef} className={styles.listCard}>
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
                  key={category}
                  type="button"
                  className={`${styles.categoryFilterBtn} ${
                    categoryFilter === category ? styles.categoryFilterBtnActive : ""
                  }`.trim()}
                  onClick={() => setCategoryFilter(category)}
                >
                  {formatCategoryLabel(category)}
                </button>
              ))}
            </div>
            <ProductTable
              products={filteredProducts}
              loading={loading}
              formatMoney={formatMoneyARS}
              formatDate={formatDateAR}
              selectedProductId={selectedProductId}
              onSelectProduct={setSelectedProductId}
              onProductDoubleClick={handleProductRowDoubleClick}
              sortKey={sortKey}
              sortDir={sortDir}
              showSortFeedback={hasUserSorted}
              onSortChange={handleSortChange}
              onSortClear={handleClearSort}
              filters={{
                name: nameFilter,
                barcode: barcodeFilter,
                category: categoryFilter,
                price: priceFilter,
                createdAt: createdAtFilter,
              }}
              onFilterChange={handleFilterChange}
              showCategory
              showBrand={false}
              showBarcode={false}
              showImageThumbnail
              showHeaderFilters={false}
              showDateColumn={false}
              topMargin={0}
            />
          </section>
        </div>
      </div>

      {isModalOpen ? (
        <div
          className={`${styles.modalOverlay} ${styles.paymentOverlay}`}
          role="presentation"
          onClick={() => {
            if (!isApprovingPayment) setIsModalOpen(false);
          }}
        >
          <section
            className={`${styles.modalCard} ${styles.paymentModalCard}`}
            role="dialog"
            aria-modal="true"
            aria-label="Pago de compra"
            onClick={(event) => event.stopPropagation()}
            style={{
              ...(paymentModalTop !== null && paymentModalLeft !== null && paymentModalWidth !== null
                ? {
                    position: "fixed",
                    top: `${paymentModalTop}px`,
                    left: `${paymentModalLeft}px`,
                    width: `${paymentModalWidth}px`,
                    maxWidth: `${paymentModalWidth}px`,
                    marginTop: 0,
                  }
                : null),
            }}
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
                onClick={() => setIsModalOpen(false)}
                disabled={isApprovingPayment}
                aria-label="Cerrar modal de pago"
              >
                Cerrar
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
                Rechazar pago
              </button>
              <button
                type="button"
                className={`${styles.primaryBtn} ${styles.paymentActionBtn}`}
                onClick={approvePayment}
                disabled={isApprovingPayment}
              >
                {isApprovingPayment ? "Procesando..." : "Aprobar pago"}
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

