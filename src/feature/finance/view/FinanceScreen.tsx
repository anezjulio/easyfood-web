import { useCallback, useEffect, useMemo, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import { formatDateAR } from "../../../shared/format/locale";
import {
  PRODUCT_CATEGORIES,
  resolveEffectiveMarginPercent,
  type PriceMarginSettings,
  type Product,
  type ProductCategory,
} from "../../product/model/product.types";
import {
  fetchPriceMarginSettingsApi,
  fetchProducts,
  removeProductPriceMarginApi,
  updateCategoryPriceMarginApi,
  upsertProductPriceMarginApi,
} from "../../product/service/product.api";
import {
  PAYMENT_METHODS,
  formatPaymentMethodLabel,
  normalizePercent,
  type PaymentMethod,
  type PaymentMethodSettings,
  type TaxSettings,
} from "../../sale/model/sale.types";
import {
  fetchPaymentMethodSettingsApi,
  fetchTaxSettingsApi,
  updatePaymentMethodSettingApi,
  updateTaxSettingsApi,
} from "../../sale/service/sale.api";
import styles from "./FinanceScreen.module.css";

type FinanceTab = "prices" | "payments" | "tax";

export default function FinanceScreen() {
  const auth = useAuth();
  const isAdmin = auth.user?.role === "admin";
  const [tab, setTab] = useState<FinanceTab>("prices");
  const [products, setProducts] = useState<Product[]>([]);
  const [marginSettings, setMarginSettings] = useState<PriceMarginSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [selectedCategoryForMargin, setSelectedCategoryForMargin] = useState<ProductCategory>(PRODUCT_CATEGORIES[0]);
  const [categoryMarginDraft, setCategoryMarginDraft] = useState("30");
  const [selectedProductIdForMargin, setSelectedProductIdForMargin] = useState("");
  const [productMarginDraft, setProductMarginDraft] = useState("30");

  const [paymentDiscountDrafts, setPaymentDiscountDrafts] = useState<Record<PaymentMethod, string>>({
    efectivo: "0",
    "tarjeta debito": "0",
    "tarjeta credito": "0",
    mercadopago: "0",
  });
  const [paymentSurchargeDrafts, setPaymentSurchargeDrafts] = useState<Record<PaymentMethod, string>>({
    efectivo: "0",
    "tarjeta debito": "0",
    "tarjeta credito": "0",
    mercadopago: "0",
  });
  const [taxPercentDraft, setTaxPercentDraft] = useState("21");
  const [taxModeDraft, setTaxModeDraft] = useState<TaxSettings["mode"]>("show_only");

  const syncPaymentDrafts = useCallback((settings: PaymentMethodSettings) => {
    const discount = {} as Record<PaymentMethod, string>;
    const surcharge = {} as Record<PaymentMethod, string>;
    for (const method of PAYMENT_METHODS) {
      const row = settings.methods.find((item) => item.method === method);
      discount[method] = String(row?.discountPercent ?? 0);
      surcharge[method] = String(row?.surchargePercent ?? 0);
    }
    setPaymentDiscountDrafts(discount);
    setPaymentSurchargeDrafts(surcharge);
  }, []);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [productList, marginList, paymentList, taxList] = await Promise.all([
        fetchProducts(),
        fetchPriceMarginSettingsApi(),
        fetchPaymentMethodSettingsApi(),
        fetchTaxSettingsApi(),
      ]);
      setProducts(productList);
      setMarginSettings(marginList);
      syncPaymentDrafts(paymentList);
      setTaxPercentDraft(String(normalizePercent(taxList.ivaPercent)));
      setTaxModeDraft(taxList.mode);
      setSelectedProductIdForMargin((current) => {
        if (current && productList.some((item) => item.id === current)) return current;
        return productList[0]?.id || "";
      });
    } catch {
      setError("No se pudieron cargar configuraciones financieras.");
    } finally {
      setLoading(false);
    }
  }, [syncPaymentDrafts]);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  useEffect(() => {
    const nextDraft = marginSettings?.categoryMargins?.[selectedCategoryForMargin] ?? 30;
    setCategoryMarginDraft(String(nextDraft));
  }, [marginSettings, selectedCategoryForMargin]);

  const selectedProductForMargin = useMemo(
    () => products.find((item) => item.id === selectedProductIdForMargin) || null,
    [products, selectedProductIdForMargin],
  );

  const selectedProductMarginForEditor = useMemo(() => {
    if (!selectedProductForMargin) return 30;
    return resolveEffectiveMarginPercent(
      marginSettings,
      selectedProductForMargin.category || "bebida",
      selectedProductForMargin.id,
    );
  }, [marginSettings, selectedProductForMargin]);

  const selectedProductOverrideMargin = useMemo(() => {
    if (!selectedProductForMargin) return null;
    const override = (marginSettings?.productMargins || []).find((item) => item.productId === selectedProductForMargin.id);
    return override ? override.marginPercent : null;
  }, [marginSettings?.productMargins, selectedProductForMargin]);

  useEffect(() => {
    if (!selectedProductForMargin) {
      setProductMarginDraft("30");
      return;
    }
    setProductMarginDraft(String(selectedProductOverrideMargin ?? selectedProductMarginForEditor));
  }, [selectedProductForMargin, selectedProductMarginForEditor, selectedProductOverrideMargin]);

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
        const category = item.category || "bebida";
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
      setError("No se pudo actualizar el margen de categoria.");
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

  async function savePaymentMethod(method: PaymentMethod) {
    setError("");
    setMessage("");
    const discountPercent = Math.max(0, Math.trunc(Number(paymentDiscountDrafts[method])));
    const surchargePercent = Math.max(0, Math.trunc(Number(paymentSurchargeDrafts[method])));
    if (!Number.isFinite(discountPercent) || !Number.isFinite(surchargePercent)) {
      setError("Ingresa valores validos para descuento y sobrecargo.");
      return;
    }
    try {
      const updated = await updatePaymentMethodSettingApi(method, { discountPercent, surchargePercent });
      syncPaymentDrafts(updated);
      setMessage(`Metodo actualizado: ${formatPaymentMethodLabel(method)}.`);
    } catch {
      setError("No se pudieron guardar los ajustes del metodo de pago.");
    }
  }

  async function saveTaxSettings(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    const ivaPercent = Math.max(0, Math.trunc(Number(taxPercentDraft)));
    if (!Number.isFinite(ivaPercent)) {
      setError("Ingresa un porcentaje de IVA valido.");
      return;
    }
    try {
      const updated = await updateTaxSettingsApi({ ivaPercent, mode: taxModeDraft });
      setTaxPercentDraft(String(normalizePercent(updated.ivaPercent)));
      setTaxModeDraft(updated.mode);
      setMessage("Configuracion de impuesto actualizada.");
    } catch {
      setError("No se pudo guardar la configuracion de impuesto.");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Finanzas" }]} asTitle />
            <p className={styles.subtitle}>Configuraciones de margenes, metodos de pago e impuesto.</p>
          </div>
          <SessionStatusBar />
        </header>

        {!isAdmin ? (
          <section className={styles.guardBox}>
            <p>Solo administradores pueden ingresar a Finanzas.</p>
          </section>
        ) : (
          <>
            <section className={styles.tabs}>
              <button
                type="button"
                className={`${styles.tabBtn} ${tab === "prices" ? styles.tabBtnActive : ""}`}
                onClick={() => setTab("prices")}
              >
                Precios
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${tab === "payments" ? styles.tabBtnActive : ""}`}
                onClick={() => setTab("payments")}
              >
                Metodos de pago
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${tab === "tax" ? styles.tabBtnActive : ""}`}
                onClick={() => setTab("tax")}
              >
                Impuesto
              </button>
            </section>

            {loading ? <p className={styles.meta}>Cargando configuraciones...</p> : null}
            {message ? <p className={styles.success}>{message}</p> : null}
            {error ? <p className={styles.error}>{error}</p> : null}

            {tab === "prices" ? (
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
                  <p className={styles.meta}>Lista completa con margen actual. Override tiene prioridad.</p>
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
                            Categoria: {selectedProductForMargin.category || "bebida"} | Margen vigente:{" "}
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
            ) : null}

            {tab === "payments" ? (
              <section className={styles.subPanel}>
                <h2 className={styles.sectionTitle}>Metodos de pago</h2>
                <p className={styles.meta}>Configura descuento y sobrecargo porcentual por metodo.</p>
                <div className={styles.paymentList}>
                  {PAYMENT_METHODS.map((method) => (
                    <article key={method} className={styles.paymentRow}>
                      <strong className={styles.paymentName}>{formatPaymentMethodLabel(method)}</strong>
                      <label className={styles.fieldInline}>
                        <span>Descuento %</span>
                        <input
                          className={styles.input}
                          type="number"
                          min={0}
                          value={paymentDiscountDrafts[method]}
                          onChange={(event) =>
                            setPaymentDiscountDrafts((current) => ({
                              ...current,
                              [method]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className={styles.fieldInline}>
                        <span>Sobrecargo %</span>
                        <input
                          className={styles.input}
                          type="number"
                          min={0}
                          value={paymentSurchargeDrafts[method]}
                          onChange={(event) =>
                            setPaymentSurchargeDrafts((current) => ({
                              ...current,
                              [method]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <button type="button" className={styles.secondaryBtn} onClick={() => void savePaymentMethod(method)}>
                        Guardar
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {tab === "tax" ? (
              <section className={styles.subPanel}>
                <h2 className={styles.sectionTitle}>Impuesto (IVA)</h2>
                <p className={styles.meta}>Se muestra en ventas junto al precio y puede sumarse opcionalmente al total final.</p>
                <form className={styles.form} onSubmit={saveTaxSettings}>
                  <label className={styles.field}>
                    <span>Porcentaje IVA</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={0}
                      value={taxPercentDraft}
                      onChange={(event) => setTaxPercentDraft(event.target.value)}
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Aplicacion</span>
                    <select
                      className={styles.select}
                      value={taxModeDraft}
                      onChange={(event) => setTaxModeDraft(event.target.value as TaxSettings["mode"])}
                    >
                      <option value="show_only">Solo mostrar el IVA</option>
                      <option value="add_to_total">Sumar IVA al total final</option>
                    </select>
                  </label>

                  <div className={styles.formActions}>
                    <button type="submit" className={styles.primaryBtn}>
                      Guardar impuesto
                    </button>
                  </div>
                </form>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

