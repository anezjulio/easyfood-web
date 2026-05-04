import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../app/provider/useAuth";
import { md5 } from "../../../shared/crypto/md5";
import { formatMoneyARS } from "../../../shared/format/locale";
import { resolveImageUrl } from "../../../shared/image/image.service";
import { addOrderToCurrentWorkdayApi } from "../../cash/service/cash.api";
import { PRODUCT_CATEGORIES, type Product, type ProductCategory } from "../../product/model/product.types";
import { fetchProducts } from "../../product/service/product.api";
import {
  PAYMENT_METHODS,
  buildDefaultPaymentMethodSettings,
  buildDefaultTaxSettings,
  formatPaymentMethodLabel,
  normalizePercent,
  resolvePaymentMethodAdjustment,
  type Order,
  type PaymentMethod,
  type PaymentMethodSettings,
  type TaxSettings,
} from "../../sale/model/sale.types";
import {
  createInvoiceApi,
  createOrderApi,
  fetchPaymentMethodSettingsApi,
  fetchTaxSettingsApi,
  updateOrderStatusApi,
} from "../../sale/service/sale.api";
import { createStockEntryApi } from "../../stock/service/stock.api";
import { resolveAppUserRole } from "../../user/model/user.types";
import { fetchUsersApi } from "../../user/service/user.api";
import AutoSaleSummarySection from "./AutoSaleSummarySection";
import CloseTerminalModal from "./CloseTerminalModal";
import {
  type AutoSaleStep,
  type CartItem,
  type CheckoutSummaryState,
  getCategoryLabel,
  getPendingOrderRemainingMs,
  getProductStock,
  isPendingOrderExpired,
  mapOrderItemToCartItem,
  mapProductToCartItem,
} from "./autoSale.helpers";
import styles from "./AutoSaleScreen.module.css";

const STEPS: Array<{ key: AutoSaleStep; label: string }> = [
  { key: "browse", label: "Seleccion" },
  { key: "review", label: "Revision" },
  { key: "payment", label: "Pago" },
  { key: "summary", label: "Resumen" },
];

export default function AutoSaleScreen() {
  const nav = useNavigate();
  const auth = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [step, setStep] = useState<AutoSaleStep>("browse");
  const [showLanding, setShowLanding] = useState(true);
  const [pendingOrder, setPendingOrder] = useState<Order | null>(null);
  const [summary, setSummary] = useState<CheckoutSummaryState | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo");
  const [paymentMethodSettings, setPaymentMethodSettings] = useState<PaymentMethodSettings>(buildDefaultPaymentMethodSettings());
  const [taxSettings, setTaxSettings] = useState<TaxSettings>(buildDefaultTaxSettings());
  const [pendingPaymentRemainingMs, setPendingPaymentRemainingMs] = useState(0);
  const [isPreparingPayment, setIsPreparingPayment] = useState(false);
  const [isApprovingPayment, setIsApprovingPayment] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [closePassword, setClosePassword] = useState("");
  const [closeError, setCloseError] = useState("");
  const [isClosingTerminal, setIsClosingTerminal] = useState(false);
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");

  const operatorName = auth.user?.username || "terminal";
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const cartQuantityMap = useMemo(() => new Map(cart.map((item) => [item.productId, item.quantity])), [cart]);

  const reloadProducts = useCallback(async (options?: { silent?: boolean }) => {
    setLoading(true);
    try {
      const list = await fetchProducts();
      setProducts(list);
    } catch {
      if (!options?.silent) setError("No se pudieron cargar los productos de la terminal.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadProducts();
  }, [reloadProducts]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [nextPaymentMethodSettings, nextTaxSettings] = await Promise.all([
          fetchPaymentMethodSettingsApi(),
          fetchTaxSettingsApi(),
        ]);
        if (cancelled) return;
        setPaymentMethodSettings(nextPaymentMethodSettings);
        setTaxSettings(nextTaxSettings);
      } catch {
        if (cancelled) return;
        setPaymentMethodSettings(buildDefaultPaymentMethodSettings());
        setTaxSettings(buildDefaultTaxSettings());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const categoryStats = useMemo(
    () =>
      PRODUCT_CATEGORIES.map((category) => ({
        category,
        count: products.filter((product) => (product.category || "vivere") === category).length,
      })),
    [products],
  );

  const availableCategories = useMemo(
    () => categoryStats.filter((item) => item.count > 0).map((item) => item.category),
    [categoryStats],
  );

  useEffect(() => {
    if (availableCategories.length === 0) {
      setSelectedCategory(null);
      return;
    }

    if (!selectedCategory || !availableCategories.includes(selectedCategory)) {
      setSelectedCategory(availableCategories[0]);
    }
  }, [availableCategories, selectedCategory]);

  const visibleProducts = useMemo(() => {
    const safeCategory = selectedCategory || availableCategories[0] || null;
    const filtered = safeCategory
      ? products.filter((product) => (product.category || "vivere") === safeCategory)
      : products;

    return [...filtered].sort((a, b) => {
      const aStock = getProductStock(a);
      const bStock = getProductStock(b);
      const aHasStock = aStock > 0;
      const bHasStock = bStock > 0;

      if (aHasStock !== bHasStock) {
        return aHasStock ? -1 : 1;
      }

      return a.name.localeCompare(b.name);
    });
  }, [availableCategories, products, selectedCategory]);

  const cartBaseTotal = useMemo(() => cart.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0), [cart]);
  const cartUnits = useMemo(() => cart.reduce((acc, item) => acc + item.quantity, 0), [cart]);

  const pendingBaseTotal = useMemo(() => {
    if (!pendingOrder) return cartBaseTotal;
    return pendingOrder.items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
  }, [cartBaseTotal, pendingOrder]);

  const currentAdjustment = useMemo(
    () => resolvePaymentMethodAdjustment(paymentMethodSettings, paymentMethod),
    [paymentMethod, paymentMethodSettings],
  );
  const currentDiscountPercent = normalizePercent(currentAdjustment.discountPercent);
  const currentSurchargePercent = normalizePercent(currentAdjustment.surchargePercent);
  const paymentDiscountAmount = useMemo(
    () => Math.round(pendingBaseTotal * (currentDiscountPercent / 100)),
    [currentDiscountPercent, pendingBaseTotal],
  );
  const paymentSurchargeAmount = useMemo(
    () => Math.round(pendingBaseTotal * (currentSurchargePercent / 100)),
    [currentSurchargePercent, pendingBaseTotal],
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
    return () => window.clearInterval(timerId);
  }, [pendingOrder]);

  const paymentCountdownLabel = useMemo(() => {
    const totalSeconds = Math.max(0, Math.ceil(pendingPaymentRemainingMs / 1_000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [pendingPaymentRemainingMs]);

  const isPaymentCountdownWarning = pendingPaymentRemainingMs > 0 && pendingPaymentRemainingMs <= 60_000;
  const noticeTone = error ? "error" : warning ? "warning" : message ? "success" : "";
  const noticeText = error || warning || message;

  const clearNotices = useCallback(() => {
    setError("");
    setWarning("");
    setMessage("");
  }, []);

  function getCartStockIssue(items: CartItem[] = cart) {
    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) {
        return `${item.productName} ya no esta disponible en la terminal.`;
      }

      const stock = getProductStock(product);
      if (item.quantity > stock) {
        return `No puedes superar la existencia (${stock}) para ${item.productName}.`;
      }
    }
    return "";
  }

  function addProductToCart(product: Product) {
    clearNotices();
    const stock = getProductStock(product);

    if (stock < 1) {
      setError(`No hay stock disponible para ${product.name}.`);
      return;
    }

    setCart((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (!existing) {
        setMessage(`${product.name} agregado al carrito.`);
        return [...current, mapProductToCartItem(product, 1)];
      }

      const nextQuantity = existing.quantity + 1;
      if (nextQuantity > stock) {
        setError(`No puedes superar la existencia (${stock}) para ${product.name}.`);
        return current;
      }

      setMessage(`Sumaste otra unidad de ${product.name}.`);
      return current.map((item) => (item.productId === product.id ? { ...item, quantity: nextQuantity } : item));
    });
  }

  function updateCartItemQuantity(productId: string, nextQuantity: number) {
    clearNotices();
    const product = productMap.get(productId);
    const currentItem = cart.find((item) => item.productId === productId);
    if (!product || !currentItem) return;

    if (nextQuantity <= 0) {
      setCart((current) => current.filter((item) => item.productId !== productId));
      setMessage(`${currentItem.productName} se quito del carrito.`);
      return;
    }

    const stock = getProductStock(product);
    if (nextQuantity > stock) {
      setError(`No puedes superar la existencia (${stock}) para ${product.name}.`);
      return;
    }

    setCart((current) =>
      current.map((item) => (item.productId === productId ? { ...item, quantity: nextQuantity } : item)),
    );
  }

  function incrementCartItemQuantity(productId: string) {
    const currentItem = cart.find((item) => item.productId === productId);
    if (!currentItem) return;
    updateCartItemQuantity(productId, currentItem.quantity + 1);
  }

  function decrementCartItemQuantity(productId: string) {
    const currentItem = cart.find((item) => item.productId === productId);
    if (!currentItem) return;
    updateCartItemQuantity(productId, currentItem.quantity - 1);
  }

  function removeFromCart(productId: string) {
    updateCartItemQuantity(productId, 0);
  }

  function goToBrowseStep() {
    clearNotices();
    setShowLanding(false);
    setStep("browse");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goToReviewStep() {
    clearNotices();
    if (cart.length === 0) {
      setError("Agrega al menos un producto para continuar.");
      return;
    }

    const stockIssue = getCartStockIssue();
    if (stockIssue) {
      setError(stockIssue);
      return;
    }

    setStep("review");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const moveToRejectedSummary = useCallback(async (order: Order, reason: string) => {
    try {
      await updateOrderStatusApi(order.id, { status: "cancelada" });
    } catch {
      // si backend ya la cancelo, seguimos con el resumen local
    }

    const summaryItems = order.items.map((item) => mapOrderItemToCartItem(item, productMap));
    await reloadProducts({ silent: true });
    setPendingOrder(null);
    setCart([]);
    setSummary({
      status: "rejected",
      orderId: order.id,
      orderCode: order.id,
      createdAt: new Date().toISOString(),
      operator: operatorName,
      paymentMethod,
      items: summaryItems,
      total: finalTotalForPayment,
      reason,
    });
    clearNotices();
    setStep("summary");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [clearNotices, finalTotalForPayment, operatorName, paymentMethod, productMap, reloadProducts]);

  useEffect(() => {
    if (!pendingOrder || pendingOrder.status !== "por pagar") return;

    let cancelled = false;
    async function expirePendingOrder() {
      if (!pendingOrder || !isPendingOrderExpired(pendingOrder)) return;
      await moveToRejectedSummary(
        pendingOrder,
        `Se acabo el tiempo para pagar la orden ${pendingOrder.id}. El pago fue rechazado automaticamente.`,
      );
    }

    void expirePendingOrder();
    const timerId = window.setInterval(() => {
      if (cancelled) return;
      void expirePendingOrder();
    }, 1_000);

    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, [moveToRejectedSummary, pendingOrder]);

  async function goToPaymentStep() {
    clearNotices();
    const stockIssue = getCartStockIssue();
    if (stockIssue) {
      setError(stockIssue);
      return;
    }

    if (pendingOrder?.status === "por pagar") {
      if (isPendingOrderExpired(pendingOrder)) {
        await moveToRejectedSummary(
          pendingOrder,
          `Se acabo el tiempo para pagar la orden ${pendingOrder.id}. El pago fue rechazado automaticamente.`,
        );
        return;
      }

      setStep("payment");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (cart.length === 0) {
      setError("No hay productos seleccionados para pagar.");
      return;
    }

    setIsPreparingPayment(true);
    try {
      const created = await createOrderApi({
        items: cart.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
        })),
        operator: operatorName,
      });

      setPendingOrder(created);
      setPaymentMethod("efectivo");
      setStep("payment");
      setMessage("Compra preparada para pago.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("No se pudo generar la compra.");
    } finally {
      setIsPreparingPayment(false);
    }
  }

  async function approvePayment() {
    if (!pendingOrder) {
      setError("No hay compra pendiente para aprobar.");
      return;
    }

    clearNotices();
    setIsApprovingPayment(true);

    try {
      const summaryItems = pendingOrder.items.map((item) => mapOrderItemToCartItem(item, productMap));
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
        operator: operatorName,
      });

      try {
        if (auth.user?.username) {
          await addOrderToCurrentWorkdayApi(auth.user.username, paid.id);
        }
      } catch {
        // la terminal puede operar sin jornada abierta
      }

      await reloadProducts({ silent: true });
      setPendingOrder(null);
      setCart([]);
      setSummary({
        status: "approved",
        orderId: pendingOrder.id,
        orderCode: pendingOrder.id,
        invoiceId: createdInvoice.id,
        createdAt: createdInvoice.createdAt || paid.createdAt,
        operator: operatorName,
        paymentMethod,
        items: summaryItems,
        total: paid.total,
      });
      setStep("summary");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("No se pudo confirmar el pago. La orden puede haber sido cancelada por tiempo.");
    } finally {
      setIsApprovingPayment(false);
    }
  }

  async function rejectPayment() {
    if (!pendingOrder) {
      setError("No hay compra pendiente para rechazar.");
      return;
    }

    clearNotices();
    await moveToRejectedSummary(pendingOrder, `El pago de la orden ${pendingOrder.id} fue rechazado.`);
  }

  function handleRestartFlow() {
    clearNotices();
    setSummary(null);
    setPendingOrder(null);
    setCart([]);
    setPaymentMethod("efectivo");
    setShowLanding(false);
    setStep("browse");
    void reloadProducts({ silent: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startShopping() {
    clearNotices();
    setShowLanding(false);
    setStep("browse");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openCloseModal() {
    setClosePassword("");
    setCloseError("");
    setIsCloseModalOpen(true);
  }

  function closeCloseModal() {
    if (isClosingTerminal) return;
    setClosePassword("");
    setCloseError("");
    setIsCloseModalOpen(false);
  }

  async function handleCloseTerminal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isClosingTerminal) return;

    const rawPassword = closePassword.trim();
    if (!rawPassword) {
      setCloseError("Ingresa la contrasena para salir de la terminal.");
      return;
    }

    setCloseError("");
    setIsClosingTerminal(true);

    try {
      const users = await fetchUsersApi();
      const passwordHash = md5(rawPassword);
      const allowed = users.some((user) => {
        const role = resolveAppUserRole(user);
        return (role === "admin" || role === "operator") && user.password === passwordHash;
      });

      if (!allowed) {
        setCloseError("La contrasena no corresponde a un administrador u operador.");
        return;
      }

      if (pendingOrder?.status === "por pagar") {
        try {
          await updateOrderStatusApi(pendingOrder.id, { status: "cancelada" });
        } catch {
          // evitamos dejar una orden pendiente al salir
        }
      }

      setIsCloseModalOpen(false);
      nav("/operation");
    } catch {
      setCloseError("No se pudo validar la contrasena en este momento.");
    } finally {
      setIsClosingTerminal(false);
    }
  }

  const currentStepIndex = step === "summary" ? 3 : step === "payment" ? 2 : step === "review" ? 1 : 0;
  const isSummaryStep = step === "summary";

  function renderStepIndicator() {
    return (
      <div className={styles.stepper} aria-label="Pasos de autoventa">
        {STEPS.map((item, index) => {
          const isCurrent = !isSummaryStep && index === currentStepIndex;
          const isDone = isSummaryStep || index < currentStepIndex;
          const isUpcoming = !isCurrent && !isDone;
          const connectorLabel =
            index >= STEPS.length - 1 ? "" : isSummaryStep ? "---" : index === currentStepIndex ? "->" : "---";

          return (
            <Fragment key={item.key}>
              <span
                className={`${styles.stepPill} ${isCurrent ? styles.stepPillActive : ""} ${isDone ? styles.stepPillDone : ""} ${isUpcoming ? styles.stepPillUpcoming : ""}`}
              >
                {index + 1}. {item.label}
              </span>
              {connectorLabel ? (
                <span
                  className={`${styles.stepConnector} ${!isSummaryStep && index === currentStepIndex ? styles.stepConnectorArrow : ""}`}
                  aria-hidden="true"
                >
                  {connectorLabel}
                </span>
              ) : null}
            </Fragment>
          );
        })}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {showLanding ? (
        <section className={`${styles.hero} ${styles.heroFullscreen}`}>
          <div className={styles.heroTopbar}>
            {renderStepIndicator()}
            <button type="button" className={styles.secondaryBtn} onClick={openCloseModal}>
              Cerrar terminal
            </button>
          </div>

          {noticeText ? (
            <div
              className={`${styles.notice} ${styles.heroNotice} ${noticeTone === "error" ? styles.noticeError : noticeTone === "warning" ? styles.noticeWarning : styles.noticeSuccess}`}
            >
              <span>{noticeText}</span>
              <button type="button" className={styles.noticeClose} onClick={clearNotices} aria-label="Cerrar aviso">
                X
              </button>
            </div>
          ) : null}

          <div className={styles.heroContent}>
            <span className={styles.heroEyebrow}>Pantalla completa</span>
            <h1 className={styles.heroTitle}>Selecciona productos, revisa la compra y paga desde una sola terminal.</h1>
            <p className={styles.heroText}>
              Dejamos el banner base preparado para el arte final. La experiencia ya funciona con categorias, carrito,
              pago y resumen.
            </p>
            <button type="button" className={styles.heroButton} onClick={startShopping}>
              Comenzar compra
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className={styles.pageTopbar}>
            {renderStepIndicator()}
            <button type="button" className={styles.secondaryBtn} onClick={openCloseModal}>
              Cerrar terminal
            </button>
          </div>

          {noticeText ? (
            <div
              className={`${styles.notice} ${noticeTone === "error" ? styles.noticeError : noticeTone === "warning" ? styles.noticeWarning : styles.noticeSuccess}`}
            >
              <span>{noticeText}</span>
              <button type="button" className={styles.noticeClose} onClick={clearNotices} aria-label="Cerrar aviso">
                X
              </button>
            </div>
          ) : null}

          {step === "browse" ? (
            <>
              <section className={styles.browserShell}>
                <aside className={styles.sidebar}>
                  <h2 className={styles.sidebarTitle}>Categorias</h2>
                  <div className={styles.categoryList}>
                    {categoryStats.map((item) => (
                      <button
                        key={item.category}
                        type="button"
                        className={`${styles.categoryBtn} ${selectedCategory === item.category ? styles.categoryBtnActive : ""}`}
                        onClick={() => setSelectedCategory(item.category)}
                        disabled={item.count === 0}
                      >
                        <span>{getCategoryLabel(item.category)}</span>
                      </button>
                    ))}
                  </div>
                </aside>

                <div className={styles.browserMain}>
                  {loading ? <p className={styles.emptyState}>Cargando productos...</p> : null}

                  {!loading && visibleProducts.length === 0 ? (
                    <p className={styles.emptyState}>No hay productos disponibles en esta categoria.</p>
                  ) : null}

                  {!loading && visibleProducts.length > 0 ? (
                    <div className={styles.productGrid}>
                      {visibleProducts.map((product) => {
                        const stock = getProductStock(product);
                        const imageUrl = resolveImageUrl(product.imageUrl);
                        const quantityInCart = cartQuantityMap.get(product.id) || 0;
                        return (
                          <article key={product.id} className={`${styles.productCard} ${stock < 1 ? styles.productCardDisabled : ""}`}>
                            <div className={styles.productMedia}>
                              {imageUrl ? (
                                <img className={styles.productImage} src={imageUrl} alt={product.name} />
                              ) : (
                                <div className={styles.productFallback}>{product.name.slice(0, 1).toUpperCase()}</div>
                              )}
                              {stock < 1 ? (
                                <span className={`${styles.productBadge} ${styles.productBadgeMuted}`}>Sin stock</span>
                              ) : quantityInCart > 0 ? (
                                <span className={styles.productBadge}>En carrito: {quantityInCart}</span>
                              ) : null}
                            </div>

                            <div className={styles.productBody}>
                              <div>
                                <h3 className={styles.productName}>{product.name}</h3>
                                <p className={styles.productMeta}>Stock disponible: {stock}</p>
                              </div>

                              <div className={styles.productFooter}>
                                <strong className={styles.productPrice}>{formatMoneyARS(product.price)}</strong>
                                <button
                                  type="button"
                                  className={styles.primaryBtn}
                                  onClick={() => addProductToCart(product)}
                                  disabled={stock < 1}
                                >
                                  {stock < 1 ? "Sin stock" : "Anadir"}
                                </button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </section>

              <div className={styles.bottomBar}>
                <div className={styles.bottomBarSummary}>
                  <span>{cartUnits} productos seleccionados</span>
                  <strong>Total parcial: {formatMoneyARS(cartBaseTotal)}</strong>
                </div>
                <button type="button" className={styles.primaryBtn} onClick={goToReviewStep} disabled={cart.length === 0}>
                  Continuar
                </button>
              </div>
            </>
          ) : null}
        </>
      )}

      {step === "review" ? (
        <>
          <section className={styles.stepShell}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.sectionEyebrow}>Revision</span>
                <h1 className={styles.sectionTitle}>Confirma los productos seleccionados.</h1>
              </div>
              <div className={styles.sectionStats}>
                <span>{cartUnits} unidades</span>
                <strong>{formatMoneyARS(cartBaseTotal)}</strong>
              </div>
            </div>

            {cart.length === 0 ? (
              <p className={styles.emptyState}>Todavia no hay productos en el carrito.</p>
            ) : (
              <div className={styles.reviewList}>
                {cart.map((item) => {
                  const product = productMap.get(item.productId);
                  const imageUrl = resolveImageUrl(item.imageUrl || product?.imageUrl);
                  const stock = getProductStock(product);
                  return (
                    <article key={item.productId} className={styles.reviewCard}>
                      <div className={styles.reviewMedia}>
                        {imageUrl ? (
                          <img className={styles.reviewImage} src={imageUrl} alt={item.productName} />
                        ) : (
                          <div className={styles.reviewFallback}>{item.productName.slice(0, 1).toUpperCase()}</div>
                        )}
                      </div>

                      <div className={styles.reviewBody}>
                        <div>
                          <h3 className={styles.reviewName}>{item.productName}</h3>
                          <p className={styles.reviewMeta}>
                            {getCategoryLabel(item.category)} - Stock disponible: {stock}
                          </p>
                        </div>

                        <div className={styles.reviewActions}>
                          <div className={styles.qtyStepper}>
                            <button type="button" className={styles.qtyBtn} onClick={() => decrementCartItemQuantity(item.productId)}>
                              -
                            </button>
                            <span className={styles.qtyValue}>{item.quantity}</span>
                            <button type="button" className={styles.qtyBtn} onClick={() => incrementCartItemQuantity(item.productId)}>
                              +
                            </button>
                          </div>

                          <div className={styles.reviewPriceBlock}>
                            <strong>{formatMoneyARS(item.unitPrice * item.quantity)}</strong>
                            <span>{formatMoneyARS(item.unitPrice)} c/u</span>
                          </div>

                          <button type="button" className={styles.ghostBtn} onClick={() => removeFromCart(item.productId)}>
                            Quitar
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <div className={styles.bottomBar}>
            <div className={styles.bottomBarSummary}>
              <span>Subtotal de la compra</span>
              <strong>{formatMoneyARS(cartBaseTotal)}</strong>
            </div>
            <div className={styles.bottomBarActions}>
              <button type="button" className={styles.secondaryBtn} onClick={goToBrowseStep}>
                Agregar mas productos
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => void goToPaymentStep()}
                disabled={cart.length === 0 || isPreparingPayment}
              >
                {isPreparingPayment ? "Preparando..." : "Avanzar"}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {step === "payment" ? (
        <section className={styles.stepShell}>
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.sectionEyebrow}>Pago</span>
              <h1 className={styles.sectionTitle}>Completa el cobro de la orden.</h1>
            </div>

            {pendingOrder ? (
              <p className={`${styles.paymentTimer} ${isPaymentCountdownWarning ? styles.paymentTimerWarning : ""}`}>
                Tiempo restante: <strong>{paymentCountdownLabel}</strong>
              </p>
            ) : null}
          </div>

          {!pendingOrder ? (
            <p className={styles.emptyState}>No hay una orden pendiente para pagar.</p>
          ) : (
            <div className={styles.paymentLayout}>
              <section className={styles.paymentSummaryCard}>
                <div className={styles.paymentSummaryHead}>
                  <div>
                    <span className={styles.sectionEyebrow}>Orden</span>
                    <h2 className={styles.paymentOrderCode}>{pendingOrder.id}</h2>
                  </div>
                  <span className={styles.paymentMethodLabel}>{formatPaymentMethodLabel(paymentMethod)}</span>
                </div>

                <div className={styles.paymentItems}>
                  {pendingOrder.items.map((item) => (
                    <div key={item.productId} className={styles.paymentItemRow}>
                      <div>
                        <strong>{item.productName}</strong>
                        <span>
                          {item.quantity} x {formatMoneyARS(item.unitPrice)}
                        </span>
                      </div>
                      <strong>{formatMoneyARS(item.unitPrice * item.quantity)}</strong>
                    </div>
                  ))}
                </div>
              </section>

              <section className={styles.paymentCard}>
                <div className={styles.methodGrid}>
                  {PAYMENT_METHODS.map((method) => {
                    const methodAdjustment = resolvePaymentMethodAdjustment(paymentMethodSettings, method);
                    const methodDiscountPercent = normalizePercent(methodAdjustment.discountPercent);
                    const methodSurchargePercent = normalizePercent(methodAdjustment.surchargePercent);
                    const adjustments = [
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
                        {adjustments.length > 0 ? <small>{adjustments.join(" / ")}</small> : null}
                      </button>
                    );
                  })}
                </div>

                <div className={styles.paymentTotals}>
                  <p>
                    <span>Subtotal</span>
                    <strong>{formatMoneyARS(pendingBaseTotal)}</strong>
                  </p>
                  {currentDiscountPercent > 0 ? (
                    <p className={styles.amountDiscount}>
                      <span>Descuento ({currentDiscountPercent}%)</span>
                      <strong>-{formatMoneyARS(paymentDiscountAmount)}</strong>
                    </p>
                  ) : null}
                  {currentSurchargePercent > 0 ? (
                    <p className={styles.amountSurcharge}>
                      <span>Sobrecargo ({currentSurchargePercent}%)</span>
                      <strong>+{formatMoneyARS(paymentSurchargeAmount)}</strong>
                    </p>
                  ) : null}
                  <p>
                    <span>
                      IVA ({ivaPercent}% - {taxSettings.mode === "add_to_total" ? "se suma al total" : "solo informativo"})
                    </span>
                    <strong>{formatMoneyARS(ivaAmount)}</strong>
                  </p>
                  <p className={styles.paymentTotalLine}>
                    <span>Total final</span>
                    <strong>{formatMoneyARS(finalTotalForPayment)}</strong>
                  </p>
                </div>

                <div className={styles.paymentActions}>
                  <button type="button" className={styles.dangerBtn} onClick={() => void rejectPayment()} disabled={isApprovingPayment}>
                    Rechazar pago
                  </button>
                  <button type="button" className={styles.primaryBtn} onClick={() => void approvePayment()} disabled={isApprovingPayment}>
                    {isApprovingPayment ? "Procesando..." : "Aprobar pago"}
                  </button>
                </div>
              </section>
            </div>
          )}
        </section>
      ) : null}

      {step === "summary" && summary ? <AutoSaleSummarySection summary={summary} onRestart={handleRestartFlow} /> : null}

      {isCloseModalOpen ? (
        <CloseTerminalModal
          password={closePassword}
          error={closeError}
          isSubmitting={isClosingTerminal}
          onPasswordChange={setClosePassword}
          onCancel={closeCloseModal}
          onSubmit={handleCloseTerminal}
        />
      ) : null}
    </div>
  );
}
