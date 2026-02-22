import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import HeaderOperationNotice from "../../../app/component/HeaderOperationNotice";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import ProductTable from "../../product/component/ProductTable";
import type { Product, ProductSortKey } from "../../product/model/product.types";
import { fetchProducts } from "../../product/service/product.api";
import { formatDateAR, formatMoneyARS } from "../../../shared/format/locale";
import { keepOnlyDigits } from "../../../shared/format/numeric";
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
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
};

function generateOrderCode() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${stamp}-${rand}`;
}

function getPendingTimeoutMinutes() {
  const raw = Math.trunc(Number(import.meta.env.VITE_ORDER_PENDING_TIMEOUT_MINUTES));
  if (!Number.isFinite(raw) || raw <= 0) return 15;
  return raw;
}

const PENDING_PAYMENT_TIMEOUT_MINUTES = getPendingTimeoutMinutes();
const PENDING_PAYMENT_TIMEOUT_MS = PENDING_PAYMENT_TIMEOUT_MINUTES * 60_000;

function isPendingOrderExpired(order: Order) {
  if (order.status !== "por pagar") return false;
  const createdAtMs = new Date(order.createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) return false;
  return Date.now() - createdAtMs >= PENDING_PAYMENT_TIMEOUT_MS;
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
  const barcodeScanInputRef = useRef<HTMLInputElement | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [quantityToAdd, setQuantityToAdd] = useState("1");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [draftOrderCode, setDraftOrderCode] = useState(() => generateOrderCode());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [nameFilter, setNameFilter] = useState("");
  const [barcodeFilter, setBarcodeFilter] = useState("");
  const [barcodeScanInput, setBarcodeScanInput] = useState("");
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
  const [assignedOpeningAmount, setAssignedOpeningAmount] = useState<number | null>(null);
  const [openingAmountInput, setOpeningAmountInput] = useState("");
  const [isOpeningCashFromModal, setIsOpeningCashFromModal] = useState(false);
  const [cashModalError, setCashModalError] = useState("");
  const [paymentModalTop, setPaymentModalTop] = useState<number | null>(null);
  const [paymentModalLeft, setPaymentModalLeft] = useState<number | null>(null);
  const [paymentModalWidth, setPaymentModalWidth] = useState<number | null>(null);
  const currentUsername = auth.user?.username ?? "";
  const isCashOpenForSession = isCashOpen;

  async function reloadProducts() {
    setLoading(true);
    const list = await fetchProducts();
    setProducts(list);
    setLoading(false);
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
  }, [currentUsername]);

  useEffect(() => {
    if (!currentUsername) {
      setIsCashOpen(false);
      return;
    }

    let alive = true;
    async function syncCashState(operator: string) {
      const result = await syncCashStateService(operator);
      if (!alive) return;
      setIsCashOpen(result.isOpen);
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

  const selectedProductStock = Math.max(0, Math.trunc(Number(selectedProduct?.existencia || 0)));
  const hasPendingPayment = pendingOrder?.status === "por pagar";

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
      setMessage(
        `La orden ${pendingOrder.id} se cancelo automaticamente al superar ${PENDING_PAYMENT_TIMEOUT_MINUTES} minutos sin pago.`,
      );
    }

    void expirePendingIfNeeded();
    const timerId = window.setInterval(() => {
      void expirePendingIfNeeded();
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, [pendingOrder]);

  useEffect(() => {
    setQuantityToAdd("1");
  }, [selectedProductId]);

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
    const timerId = window.setTimeout(() => {
      barcodeScanInputRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timerId);
    };
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
      if (sortKey === "category") return (a.category || "").localeCompare(b.category || "") * dir;
      if (sortKey === "price") return (a.price - b.price) * dir;
      if (sortKey === "existencia") return (Number(a.existencia || 0) - Number(b.existencia || 0)) * dir;
      return (new Date(a.ultimoIngreso || a.createdAt).getTime() - new Date(b.ultimoIngreso || b.createdAt).getTime()) * dir;
    });
  }, [products, nameFilter, barcodeFilter, categoryFilter, priceFilter, createdAtFilter, sortKey, sortDir]);

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

  function addProductToCart(product: Product, rawQuantity: number) {
    setError("");
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

    const productStock = Math.max(0, Math.trunc(Number(product.existencia || 0)));
    if (nextQuantity > productStock) {
      setError(`No puedes agregar mas de ${productStock} unidades.`);
      return;
    }

    setSelectedProductId(product.id);
    setCart((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (!existing) {
        return [
          ...current,
          {
            productId: product.id,
            productName: product.name,
            unitPrice: product.price,
            quantity: nextQuantity,
          },
        ];
      }

      const combinedQuantity = existing.quantity + nextQuantity;
      if (combinedQuantity > productStock) {
        setError(`No puedes superar la existencia (${productStock}) para ${product.name}.`);
        return current;
      }

      return current.map((item) => {
        if (item.productId !== product.id) return item;
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

  function handleBarcodeScanChange(nextValue: string) {
    const digits = keepOnlyDigits(nextValue);
    setBarcodeScanInput(digits);
    setBarcodeFilter(digits);
  }

  function handleBarcodeScanSubmit() {
    const scannedCode = keepOnlyDigits(barcodeScanInput);
    if (!scannedCode) return;

    if (hasPendingPayment) {
      setError("Hay una compra pendiente de pago. Reintenta o termina esa compra.");
      return;
    }

    setBarcodeFilter(scannedCode);

    const matches = products.filter((item) => {
      const raw = (item.barcode || "").trim();
      if (!raw) return false;
      return raw === scannedCode || keepOnlyDigits(raw) === scannedCode;
    });
    const matchedProduct =
      matches.find((item) => Math.max(0, Math.trunc(Number(item.existencia || 0))) > 0) || matches[0] || null;

    if (!matchedProduct) {
      setError(`No se encontro un producto con el codigo ${scannedCode}.`);
      return;
    }

    addProductToCart(matchedProduct, 1);
    setBarcodeScanInput("");
    barcodeScanInputRef.current?.focus();
  }

  function removeFromCart(productId: string) {
    if (hasPendingPayment) {
      setError("Hay una compra pendiente de pago. Reintenta o termina esa compra.");
      return;
    }
    setCart((current) => current.filter((item) => item.productId !== productId));
  }

  function updateCartItemQuantity(productId: string, nextValue: string) {
    const parsed = Math.trunc(Number(nextValue));
    if (!Number.isFinite(parsed) || parsed < 1) return;

    const productStock = Math.max(
      0,
      Math.trunc(Number(products.find((item) => item.id === productId)?.existencia || 0)),
    );

    const maxAllowed = Math.max(1, productStock);
    const clamped = Math.min(parsed, maxAllowed);

    if (parsed > productStock) {
      const productName = products.find((item) => item.id === productId)?.name || "el producto";
      setError(`No puedes superar la existencia (${productStock}) para ${productName}.`);
    } else {
      setError("");
    }

    setCart((current) =>
      current.map((item) => {
        if (item.productId !== productId) return item;
        return { ...item, quantity: clamped };
      }),
    );
  }

  async function openPaymentModal() {
    setError("");
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
        setMessage(
          `La orden ${pendingOrder.id} vencio por tiempo y fue cancelada automaticamente.`,
        );
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
    setMessage("El pago no pudo concretarse. Puedes volver a intentarlo.");
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
    setMessage("");
    setIsApprovingPayment(true);

    try {
      const paid = await updateOrderStatusApi(pendingOrder.id, {
        status: "pagada",
        paymentMethod,
        total: finalTotalForPayment,
      });

      for (const item of pendingOrder.items) {
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
      setMessage("");
      nav("/sales/summary", { state: summaryState });
    } catch {
      setError("No se pudo confirmar el pago. La orden puede haber sido cancelada por tiempo.");
    } finally {
      setIsApprovingPayment(false);
    }
  }

  const generateLabel = "Pagar";
  const orderCodeLabel = pendingOrder?.id || draftOrderCode;
  const clearHeaderNotice = () => {
    setError("");
    setMessage("");
  };

  return (
    <div className={styles.page}>
      <div className={`${styles.content} ${!isCashOpenForSession ? styles.contentDisabled : ""}`}>
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
                    <p className={styles.selectedStock}>Existencia: {selectedProductStock}</p>
                  </div>

                  <div className={styles.quantityActionRow}>
                    <label className={styles.quantityRow}>
                      <span>Cantidad</span>
                      <input
                        type="number"
                        min={1}
                        max={selectedProductStock}
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

            <div className={styles.scanInlineRow}>
              <p className={styles.scanHint}>Escanea el codigo y presiona Enter para agregar 1 unidad al carrito.</p>

              <label className={styles.scanField}>
                <span>Codigo de barras</span>
                <input
                  ref={barcodeScanInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="\d*"
                  value={barcodeScanInput}
                  onChange={(event) => handleBarcodeScanChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    handleBarcodeScanSubmit();
                  }}
                  placeholder="Escanea y presiona Enter"
                  className={styles.input}
                  disabled={hasPendingPayment}
                  autoComplete="off"
                  aria-label="Escanear codigo de barras"
                />
              </label>
            </div>

            <div className={styles.cartList}>
              <div className={styles.cartHead}>
                <div>Producto</div>
                <div>Cant.</div>
                <div>Precio / IVA</div>
                <div>Subtotal</div>
                <div />
              </div>

              {cart.length === 0 ? (
                <p className={styles.empty}>Aun no agregaste productos.</p>
              ) : (
                cart.map((item) => (
                  <div className={styles.cartRow} key={item.productId}>
                  <div className={styles.cellProduct}>{item.productName}</div>
                  <div className={styles.cellQty}>
                    <input
                        type="number"
                        min={1}
                        max={Math.max(0, Math.trunc(Number(products.find((p) => p.id === item.productId)?.existencia || 0)))}
                        value={item.quantity}
                        onChange={(e) => updateCartItemQuantity(item.productId, e.target.value)}
                        className={styles.cartQtyInput}
                        disabled={hasPendingPayment}
                        aria-label={`Cantidad para ${item.productName}`}
                      />
                    </div>
                    <div className={styles.cellPrice}>
                      <span>{formatMoneyARS(item.unitPrice)}</span>
                      <small className={styles.ivaInline}>IVA {ivaPercent}%: {formatMoneyARS(Math.round(item.unitPrice * (ivaPercent / 100)))}</small>
                    </div>
                    <div className={styles.cellSubtotal}>{formatMoneyARS(item.unitPrice * item.quantity)}</div>
                    <button
                      type="button"
                      className={styles.cartRemoveBtn}
                      onClick={() => removeFromCart(item.productId)}
                      disabled={hasPendingPayment}
                      aria-label={`Quitar ${item.productName}`}
                    >
                      X
                    </button>
                  </div>
                ))
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
            <ProductTable
              products={filteredProducts}
              loading={loading}
              formatMoney={formatMoneyARS}
              formatDate={formatDateAR}
              selectedProductId={selectedProductId}
              onSelectProduct={setSelectedProductId}
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
              <h3 className={styles.modalTitle}>Pago de compra</h3>
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
            <p className={styles.modalHint}>Orden: {pendingOrder?.id || "-"}</p>

            <div className={styles.modalTotals}>
              <p className={styles.modalHint}>
                IVA ({ivaPercent}% - {taxSettings.mode === "add_to_total" ? "se suma al total" : "solo informativo"}):{" "}
                <strong>{formatMoneyARS(ivaAmount)}</strong>
              </p>
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
                Total final: <span className={styles.modalTotalAmount}>{formatMoneyARS(finalTotalForPayment)}</span>
              </p>
            </div>

            <div className={styles.modalActions}>
              <button type="button" className={styles.dangerBtn} onClick={rejectPayment} disabled={isApprovingPayment}>
                Rechazar pago
              </button>
              <button type="button" className={styles.primaryBtn} onClick={approvePayment} disabled={isApprovingPayment}>
                {isApprovingPayment ? "Procesando..." : "Aprobar pago"}
              </button>
            </div>

          </section>
        </div>
      ) : null}

      {!isCashOpenForSession ? (
        <div className={styles.modalOverlay} role="presentation">
          <section className={styles.modalCard} role="dialog" aria-modal="true" aria-label="Caja cerrada">
            <h3 className={styles.modalTitle}>Apertura de caja</h3>
            <p className={styles.modalHint}>Usuario: {auth.user?.username || "-"}</p>
            <p className={`${styles.modalHint} ${styles.modalStatusLine}`}>
              Estado: <span className={styles.modalHintError}>Cerrada</span>
            </p>
            {typeof assignedOpeningAmount === "number" && assignedOpeningAmount > 0 ? (
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

