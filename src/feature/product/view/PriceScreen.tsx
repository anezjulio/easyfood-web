import { useCallback, useEffect, useMemo, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import ProductTable from "../component/ProductTable";
import {
  PRODUCT_CATEGORIES,
  calculateSalePrice,
  inferCostPriceFromSalePrice,
  resolveEffectiveMarginPercent,
  type PriceMarginSettings,
  type Product,
  type ProductCategory,
  type ProductSortKey,
} from "../model/product.types";
import {
  createProductPriceApi,
  fetchPriceMarginSettingsApi,
  fetchProducts,
  removeProductPriceMarginApi,
  updateCategoryPriceMarginApi,
  upsertProductPriceMarginApi,
} from "../service/product.api";
import { formatDateAR, formatMoneyARS } from "../viewmodel/useProductListViewModel";
import styles from "./PriceScreen.module.css";

type PriceTab = "update" | "margins";

function normalize(s: string) {
  return (s || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function matchesPriceFilter(price: number, filterDigits: string): boolean {
  if (!filterDigits) return true;
  const priceDigits = String(Math.trunc(Math.abs(price)));
  const trailingZeros = (filterDigits.match(/0+$/)?.[0].length ?? 0);
  if (trailingZeros >= 2) {
    return priceDigits === filterDigits;
  }
  return priceDigits.includes(filterDigits);
}

function formatPriceTextMask(input: string): string {
  const digits = (input || "").replace(/\D/g, "");
  if (!digits) return "";
  const normalized = digits.replace(/^0+/, "");
  if (!normalized) return "";
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(normalized));
}

function parsePriceTextMask(input: string): number {
  const parsed = Math.trunc(Number((input || "").replace(/\D/g, "")));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

export default function PriceScreen() {
  const [tab, setTab] = useState<PriceTab>("update");
  const [products, setProducts] = useState<Product[]>([]);
  const [marginSettings, setMarginSettings] = useState<PriceMarginSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [nameFilter, setNameFilter] = useState("");
  const [barcodeFilter, setBarcodeFilter] = useState("");
  const [priceFilter, setPriceFilter] = useState("");
  const [createdAtFilter, setCreatedAtFilter] = useState("");
  const [sortKey, setSortKey] = useState<ProductSortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [hasUserSorted, setHasUserSorted] = useState(false);

  const [newCostPrice, setNewCostPrice] = useState("");
  const [selectedCategoryForMargin, setSelectedCategoryForMargin] = useState<ProductCategory>(PRODUCT_CATEGORIES[0]);
  const [categoryMarginDraft, setCategoryMarginDraft] = useState("30");
  const [selectedProductIdForMargin, setSelectedProductIdForMargin] = useState("");
  const [productMarginDraft, setProductMarginDraft] = useState("30");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const reloadProductsAndMargins = useCallback(async (nextSelectedId?: string | null) => {
    setLoading(true);
    try {
      const [productList, marginList] = await Promise.all([fetchProducts(), fetchPriceMarginSettingsApi()]);
      setProducts(productList);
      setMarginSettings(marginList);
      if (typeof nextSelectedId !== "undefined") {
        setSelectedProductId(nextSelectedId);
      }
      setSelectedProductIdForMargin((current) => {
        if (current && productList.some((item) => item.id === current)) return current;
        return productList[0]?.id || "";
      });
    } catch {
      setError("No se pudieron cargar productos o configuraciones de margen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadProductsAndMargins(null);
  }, [reloadProductsAndMargins]);

  const selectedProduct = useMemo(
    () => products.find((item) => item.id === selectedProductId) || null,
    [products, selectedProductId],
  );

  const selectedProductMargin = useMemo(
    () => resolveEffectiveMarginPercent(marginSettings, selectedProduct?.category || "vivere", selectedProduct?.id),
    [marginSettings, selectedProduct?.category, selectedProduct?.id],
  );

  const selectedProductHasOverride = useMemo(() => {
    if (!selectedProduct) return false;
    return (marginSettings?.productMargins || []).some((item) => item.productId === selectedProduct.id);
  }, [marginSettings?.productMargins, selectedProduct]);

  const selectedProductCurrentCost = useMemo(() => {
    if (!selectedProduct) return 0;
    const rawCost = Math.trunc(Number(selectedProduct.costPrice));
    if (Number.isFinite(rawCost) && rawCost > 0) {
      return rawCost;
    }
    return inferCostPriceFromSalePrice(selectedProduct.price, selectedProductMargin);
  }, [selectedProduct, selectedProductMargin]);

  useEffect(() => {
    if (!selectedProduct) {
      setNewCostPrice("");
      return;
    }
    setNewCostPrice(formatPriceTextMask(String(selectedProductCurrentCost)));
  }, [selectedProduct, selectedProductCurrentCost]);

  const selectedProductForMargin = useMemo(
    () => products.find((item) => item.id === selectedProductIdForMargin) || null,
    [products, selectedProductIdForMargin],
  );

  const selectedProductMarginForEditor = useMemo(() => {
    if (!selectedProductForMargin) return 30;
    return resolveEffectiveMarginPercent(
      marginSettings,
      selectedProductForMargin.category || "vivere",
      selectedProductForMargin.id,
    );
  }, [marginSettings, selectedProductForMargin]);

  const selectedProductOverrideMargin = useMemo(() => {
    if (!selectedProductForMargin) return null;
    const override = (marginSettings?.productMargins || []).find((item) => item.productId === selectedProductForMargin.id);
    return override ? override.marginPercent : null;
  }, [marginSettings?.productMargins, selectedProductForMargin]);

  useEffect(() => {
    const draft = marginSettings?.categoryMargins?.[selectedCategoryForMargin] ?? 30;
    setCategoryMarginDraft(String(draft));
  }, [marginSettings, selectedCategoryForMargin]);

  useEffect(() => {
    if (!selectedProductForMargin) {
      setProductMarginDraft("30");
      return;
    }
    setProductMarginDraft(String(selectedProductOverrideMargin ?? selectedProductMarginForEditor));
  }, [selectedProductForMargin, selectedProductOverrideMargin, selectedProductMarginForEditor]);

  const newCostPriceValue = parsePriceTextMask(newCostPrice);
  const newSalePricePreview = calculateSalePrice(newCostPriceValue, selectedProductMargin);

  const filteredProducts = useMemo(() => {
    const q = normalize(nameFilter);
    const p = (priceFilter || "").replace(/\D/g, "");
    let list = products;

    if (q) {
      list = list.filter((item) => normalize(item.name).includes(q));
    }

    if (barcodeFilter.trim()) {
      const barcodeQuery = barcodeFilter.trim();
      list = list.filter((item) => (item.barcode || "").includes(barcodeQuery));
    }

    if (p) {
      list = list.filter((item) => matchesPriceFilter(item.price, p));
    }

    if (createdAtFilter) {
      list = list.filter((item) => item.createdAt.slice(0, 10) === createdAtFilter);
    }

    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      if (sortKey === "price") return (a.price - b.price) * dir;
      if (sortKey === "category") return (a.category || "").localeCompare(b.category || "") * dir;
      if (sortKey === "existencia") return (Number(a.existencia || 0) - Number(b.existencia || 0)) * dir;
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
    });
  }, [products, nameFilter, barcodeFilter, priceFilter, createdAtFilter, sortKey, sortDir]);

  const categoryMarginRows = useMemo(
    () =>
      PRODUCT_CATEGORIES.map((category) => ({
        category,
        marginPercent: marginSettings?.categoryMargins?.[category] ?? 30,
      })),
    [marginSettings],
  );

  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);

  const productOverridesMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of marginSettings?.productMargins || []) {
      map.set(item.productId, item.marginPercent);
    }
    return map;
  }, [marginSettings?.productMargins]);

  const productMarginRows = useMemo(
    () =>
      sortedProducts.map((item) => {
        const category = item.category || "vivere";
        const overrideMarginPercent = productOverridesMap.get(item.id);
        const marginPercent = resolveEffectiveMarginPercent(marginSettings, category, item.id);
        return {
          productId: item.id,
          productName: item.name,
          category,
          marginPercent,
          overrideMarginPercent: typeof overrideMarginPercent === "number" ? overrideMarginPercent : null,
        };
      }),
    [marginSettings, productOverridesMap, sortedProducts],
  );

  const selectedCategoryMarginHistory = useMemo(
    () => (marginSettings?.categoryMarginHistory || []).filter((item) => item.category === selectedCategoryForMargin),
    [marginSettings?.categoryMarginHistory, selectedCategoryForMargin],
  );

  const selectedProductMarginHistory = useMemo(
    () => (marginSettings?.productMarginHistory || []).filter((item) => item.productId === selectedProductIdForMargin),
    [marginSettings?.productMarginHistory, selectedProductIdForMargin],
  );

  function handleSortChange(nextKey: ProductSortKey) {
    setHasUserSorted(true);
    if (sortKey === nextKey) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
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
    if (key === "price") setPriceFilter(value);
    if (key === "createdAt") setCreatedAtFilter(value);
  }

  function clearUpdateForm() {
    setSelectedProductId(null);
    setNewCostPrice("");
    setError("");
    setMessage("");
  }

  async function updatePrice(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!selectedProduct) {
      setError("Selecciona un producto para actualizar precio.");
      return;
    }

    if (!Number.isFinite(newCostPriceValue) || newCostPriceValue <= 0) {
      setError("Ingresa un precio de coste valido mayor a 0.");
      return;
    }

    if (!Number.isFinite(newSalePricePreview) || newSalePricePreview <= 0) {
      setError("No se pudo calcular el precio de venta.");
      return;
    }

    try {
      await createProductPriceApi({
        productId: selectedProduct.id,
        costPrice: newCostPriceValue,
        newPrice: newSalePricePreview,
        marginPercent: selectedProductMargin,
      });
      await reloadProductsAndMargins(selectedProduct.id);
      setMessage("Precio de coste y venta actualizados correctamente.");
    } catch {
      setError("No se pudo actualizar el precio.");
    }
  }

  async function saveCategoryMargin() {
    setError("");
    setMessage("");

    const value = Math.max(0, Math.trunc(Number(categoryMarginDraft)));
    if (!Number.isFinite(value)) {
      setError("Ingresa un porcentaje de margen valido.");
      return;
    }

    try {
      const updated = await updateCategoryPriceMarginApi(selectedCategoryForMargin, value);
      setMarginSettings(updated);
      setMessage(`Margen de categoria actualizado: ${selectedCategoryForMargin}.`);
    } catch {
      setError("No se pudo actualizar el margen por categoria.");
    }
  }

  async function saveProductMargin(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!selectedProductIdForMargin) {
      setError("Selecciona un producto.");
      return;
    }

    const value = Math.max(0, Math.trunc(Number(productMarginDraft)));
    if (!Number.isFinite(value)) {
      setError("Ingresa un porcentaje de margen valido para producto.");
      return;
    }

    try {
      const updated = await upsertProductPriceMarginApi(selectedProductIdForMargin, value);
      setMarginSettings(updated);
      setMessage("Margen especifico por producto guardado.");
    } catch {
      setError("No se pudo guardar el margen por producto.");
    }
  }

  async function removeProductMargin(productId: string) {
    setError("");
    setMessage("");

    try {
      const updated = await removeProductPriceMarginApi(productId);
      setMarginSettings(updated);
      setMessage("Margen especifico eliminado.");
    } catch {
      setError("No se pudo eliminar el margen especifico.");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Precios" }]} asTitle />
            <p className={styles.subtitle}>Gestion de costo, precio de venta y margenes por categoria y producto.</p>
          </div>
          <SessionStatusBar />
        </header>

        <section className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tabBtn} ${tab === "update" ? styles.tabBtnActive : ""}`}
            onClick={() => setTab("update")}
          >
            Actualizar precio
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${tab === "margins" ? styles.tabBtnActive : ""}`}
            onClick={() => setTab("margins")}
          >
            Margenes
          </button>
        </section>

        {tab === "update" ? (
          <div className={styles.layout}>
            <section className={styles.formCard}>
              <h2 className={styles.formTitle}>Actualizar costo y venta</h2>

              <form onSubmit={updatePrice} className={styles.form}>
                <label className={styles.field}>
                  <span>Codigo de barra</span>
                  <div className={styles.valueBox}>{selectedProduct?.barcode || "-"}</div>
                </label>

                <label className={styles.field}>
                  <span>Nombre</span>
                  <div className={styles.valueBox}>{selectedProduct?.name || "-"}</div>
                </label>

                <label className={styles.field}>
                  <span>Categoria</span>
                  <div className={styles.valueBox}>{selectedProduct?.category || "-"}</div>
                </label>

                <label className={styles.field}>
                  <span>Margen aplicado</span>
                  <div className={styles.valueBox}>
                    {selectedProduct ? `${selectedProductMargin}%` : "-"}
                    {selectedProduct ? ` (${selectedProductHasOverride ? "override producto" : "categoria"})` : ""}
                  </div>
                </label>

                <label className={styles.field}>
                  <span>Costo actual</span>
                  <div className={styles.valueBox}>{selectedProduct ? formatMoneyARS(selectedProductCurrentCost) : "-"}</div>
                </label>

                <label className={styles.field}>
                  <span>Venta actual</span>
                  <div className={styles.valueBox}>{selectedProduct ? formatMoneyARS(selectedProduct.price) : "-"}</div>
                </label>

                <label className={styles.field}>
                  <span>Nuevo costo</span>
                  <input
                    type="text"
                    value={newCostPrice}
                    onChange={(e) => setNewCostPrice(formatPriceTextMask(e.target.value))}
                    className={styles.input}
                    inputMode="numeric"
                    placeholder="0"
                  />
                </label>

                <label className={styles.field}>
                  <span>Nueva venta</span>
                  <div className={styles.valueBox}>{newSalePricePreview > 0 ? formatMoneyARS(newSalePricePreview) : "-"}</div>
                </label>

                {error ? <div className={styles.errorBox}>{error}</div> : null}
                {message ? <div className={styles.successBox}>{message}</div> : null}

                <div className={styles.formActions}>
                  <button type="button" className={styles.secondaryBtn} onClick={clearUpdateForm}>
                    Limpiar
                  </button>
                  <button type="submit" className={styles.primaryBtn}>
                    Actualizar precio
                  </button>
                </div>
              </form>
            </section>

            <section className={styles.listCard}>
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
                  price: priceFilter,
                  createdAt: createdAtFilter,
                }}
                onFilterChange={handleFilterChange}
                dateLabel="Fecha"
                topMargin={0}
                maxHeight="100%"
              />
            </section>
          </div>
        ) : (
          <section className={styles.marginsPanel}>
            {message ? <p className={styles.success}>{message}</p> : null}
            {error ? <p className={styles.error}>{error}</p> : null}
            <div className={styles.gridTwo}>
              <section className={styles.subPanel}>
                <h2 className={styles.sectionTitle}>Margenes por categoria</h2>
                <p className={styles.meta}>Selecciona una categoria para editar y ver historial.</p>
                <div className={styles.selectorLayout}>
                  <div className={styles.selectorList}>
                    {categoryMarginRows.map((item) => (
                      <button
                        key={item.category}
                        type="button"
                        className={`${styles.selectorRow} ${selectedCategoryForMargin === item.category ? styles.selectorRowActive : ""}`}
                        onClick={() => setSelectedCategoryForMargin(item.category)}
                      >
                        <span className={styles.selectorMain}>{item.category}</span>
                        <span className={styles.selectorValue}>{item.marginPercent}%</span>
                      </button>
                    ))}
                  </div>

                  <div className={styles.selectorDetail}>
                    <h3 className={styles.detailTitle}>Editar: {selectedCategoryForMargin}</h3>
                    <label className={styles.field}>
                      <span>Margen (%)</span>
                      <input
                        className={styles.input}
                        type="number"
                        min={0}
                        value={categoryMarginDraft}
                        onChange={(event) => setCategoryMarginDraft(event.target.value)}
                      />
                    </label>

                    <div className={styles.formActions}>
                      <button type="button" className={styles.primaryBtn} onClick={() => void saveCategoryMargin()}>
                        Guardar margen
                      </button>
                    </div>

                    <h3 className={styles.historyTitle}>Historial</h3>
                    {selectedCategoryMarginHistory.length === 0 ? (
                      <p className={styles.empty}>Sin cambios registrados.</p>
                    ) : (
                      <div className={styles.historyList}>
                        {selectedCategoryMarginHistory.map((item) => (
                          <article key={item.id} className={styles.historyRow}>
                            <p className={styles.historyValue}>
                              Anterior: {item.previousMarginPercent}% | Nuevo: {item.marginPercent}%
                            </p>
                            <p className={styles.historyDate}>{formatDateAR(item.createdAt)}</p>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className={styles.subPanel}>
                <h2 className={styles.sectionTitle}>Margen por producto</h2>
                <p className={styles.meta}>Lista completa con margen actual. El override tiene prioridad sobre categoria.</p>
                <div className={styles.selectorLayout}>
                  <div className={styles.selectorList}>
                    {productMarginRows.map((item) => (
                      <button
                        key={item.productId}
                        type="button"
                        className={`${styles.selectorRow} ${selectedProductIdForMargin === item.productId ? styles.selectorRowActive : ""}`}
                        onClick={() => setSelectedProductIdForMargin(item.productId)}
                      >
                        <span className={styles.selectorMain}>{item.productName}</span>
                        <span className={styles.selectorMeta}>
                          {item.category} | {item.overrideMarginPercent === null ? "usa categoria" : "override"}
                        </span>
                        <span className={styles.selectorValue}>{item.marginPercent}%</span>
                      </button>
                    ))}
                  </div>

                  <div className={styles.selectorDetail}>
                    {!selectedProductForMargin ? (
                      <p className={styles.empty}>No hay productos para editar margenes.</p>
                    ) : (
                      <>
                        <h3 className={styles.detailTitle}>{selectedProductForMargin.name}</h3>
                        <p className={styles.detailMeta}>
                          Categoria: {selectedProductForMargin.category || "vivere"} | Margen vigente:{" "}
                          {selectedProductMarginForEditor}% ({selectedProductOverrideMargin === null ? "categoria" : "override"})
                        </p>

                        <form className={styles.form} onSubmit={saveProductMargin}>
                          <label className={styles.field}>
                            <span>Margen override (%)</span>
                            <input
                              className={styles.input}
                              type="number"
                              min={0}
                              value={productMarginDraft}
                              onChange={(event) => setProductMarginDraft(event.target.value)}
                            />
                          </label>

                          <div className={styles.formActions}>
                            <button type="submit" className={styles.primaryBtn}>
                              Guardar override
                            </button>
                            <button
                              type="button"
                              className={styles.secondaryBtn}
                              onClick={() => void removeProductMargin(selectedProductForMargin.id)}
                              disabled={selectedProductOverrideMargin === null}
                            >
                              Quitar override
                            </button>
                          </div>
                        </form>

                        <h3 className={styles.historyTitle}>Historial</h3>
                        {selectedProductMarginHistory.length === 0 ? (
                          <p className={styles.empty}>Sin cambios registrados.</p>
                        ) : (
                          <div className={styles.historyList}>
                            {selectedProductMarginHistory.map((item) => (
                              <article key={item.id} className={styles.historyRow}>
                                <p className={styles.historyValue}>
                                  Anterior: {item.previousMarginPercent === null ? "Sin override" : `${item.previousMarginPercent}%`} |
                                  Nuevo: {item.marginPercent === null ? "Sin override" : `${item.marginPercent}%`}
                                </p>
                                <p className={styles.historyDate}>{formatDateAR(item.createdAt)}</p>
                              </article>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
