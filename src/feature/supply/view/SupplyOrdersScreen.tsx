import { useCallback, useEffect, useMemo, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import { formatDateTimeAR as formatDateTime, formatMoneyARS } from "../../../shared/format/locale";
import { formatIntegerTextMask, parsePositiveIntFromTextMask } from "../../../shared/format/numeric";
import { normalizeForSearch } from "../../../shared/search/search";
import {
  calculateSalePrice,
  PRODUCT_CATEGORIES,
  resolveEffectiveMarginPercent,
  type PriceMarginSettings,
  type Product,
  type ProductCategory,
} from "../../product/model/product.types";
import { findBarcodeConflict, generateUniqueAutoBarcode, normalizeBarcodeInput } from "../../product/model/product.barcode";
import { createProductApi, fetchPriceMarginSettingsApi, fetchProducts } from "../../product/service/product.api";
import type { SupplyOrder, SupplyOrderItemDraft } from "../model/supply.types";
import {
  cancelSupplyOrderApi,
  createSupplyOrderApi,
  fetchSupplyOrdersApi,
  updateSupplyOrderApi,
} from "../service/supply.api";
import styles from "./SupplyOrdersScreen.module.css";

type Tab = "create" | "list";

type SelectedSupplyItem = {
  productId: string;
  productName: string;
  quantity: number;
  barcode?: string;
  brand?: string;
  category?: ProductCategory;
};

function sortProductsByName(products: Product[]) {
  return [...products].sort((a, b) => a.name.localeCompare(b.name));
}

export default function SupplyOrdersScreen() {
  const auth = useAuth();
  const isAdmin = auth.user?.role === "admin";
  const currentUsername = normalizeForSearch(auth.user?.username || "");

  const [activeTab, setActiveTab] = useState<Tab>(isAdmin ? "create" : "list");
  const [orders, setOrders] = useState<SupplyOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [marginSettings, setMarginSettings] = useState<PriceMarginSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [supplierName, setSupplierName] = useState("");
  const [description, setDescription] = useState("");
  const [expectedTotal, setExpectedTotal] = useState("");
  const [selectedItems, setSelectedItems] = useState<SelectedSupplyItem[]>([]);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  const [productSearch, setProductSearch] = useState("");
  const [selectedCatalogProductId, setSelectedCatalogProductId] = useState<string | null>(null);

  const [newProductName, setNewProductName] = useState("");
  const [newProductBrand, setNewProductBrand] = useState("");
  const [newProductCategory, setNewProductCategory] = useState<ProductCategory>("vivere");
  const [newProductBarcode, setNewProductBarcode] = useState("");
  const [newProductCostPrice, setNewProductCostPrice] = useState("");
  const [newProductQuantity, setNewProductQuantity] = useState("");
  const [autoGenerateBarcode, setAutoGenerateBarcode] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [orderList, productList, marginList] = await Promise.all([
        fetchSupplyOrdersApi(),
        fetchProducts(),
        fetchPriceMarginSettingsApi(),
      ]);
      setOrders(orderList);
      setProducts(sortProductsByName(productList));
      setMarginSettings(marginList);
    } catch {
      setError("No se pudo cargar la informacion de pedidos o productos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setActiveTab(isAdmin ? "create" : "list");
  }, [isAdmin]);

  useEffect(() => {
    if (!selectedCatalogProductId) return;
    const exists = products.some((item) => item.id === selectedCatalogProductId);
    if (!exists) {
      setSelectedCatalogProductId(null);
    }
  }, [products, selectedCatalogProductId]);

  const sortedOrders = useMemo(() => {
    const pending = orders
      .filter((item) => item.status === "pending")
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const processed = orders
      .filter((item) => item.status !== "pending")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return [...pending, ...processed];
  }, [orders]);

  const visibleOrders = useMemo(() => {
    if (isAdmin) return sortedOrders;
    return sortedOrders.filter((item) => normalizeForSearch(item.createdBy) === currentUsername);
  }, [currentUsername, isAdmin, sortedOrders]);

  const supplierOptions = useMemo(() => {
    const uniqueByKey = new Map<string, string>();
    for (const item of orders) {
      const supplier = item.supplierName.trim();
      if (!supplier) continue;
      const key = supplier.toLowerCase();
      if (!uniqueByKey.has(key)) {
        uniqueByKey.set(key, supplier);
      }
    }
    return [...uniqueByKey.values()].sort((a, b) => a.localeCompare(b));
  }, [orders]);

  const pendingCount = useMemo(() => visibleOrders.filter((item) => item.status === "pending").length, [visibleOrders]);
  const totalRequestedUnits = useMemo(
    () => selectedItems.reduce((acc, item) => acc + Math.max(0, Math.trunc(item.quantity)), 0),
    [selectedItems],
  );
  const productsById = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);
  const visibleProducts = useMemo(() => {
    const query = normalizeForSearch(productSearch);
    return products.filter((item) =>
      !query
        ? true
        : normalizeForSearch(`${item.name} ${item.brand || ""} ${item.barcode || ""} ${item.category || ""}`).includes(query),
    );
  }, [productSearch, products]);

  const canEditPendingOrder = useCallback(
    (order: SupplyOrder) => isAdmin && order.status === "pending" && normalizeForSearch(order.createdBy) === currentUsername,
    [currentUsername, isAdmin],
  );

  const editingOrder = useMemo(
    () => visibleOrders.find((item) => item.id === editingOrderId && canEditPendingOrder(item)) || null,
    [canEditPendingOrder, editingOrderId, visibleOrders],
  );

  useEffect(() => {
    if (!editingOrderId) return;
    if (editingOrder) return;
    setEditingOrderId(null);
  }, [editingOrder, editingOrderId]);

  const newProductCostValue = parsePositiveIntFromTextMask(newProductCostPrice);
  const newProductQuantityValue = parsePositiveIntFromTextMask(newProductQuantity);
  const newProductMarginPercent = resolveEffectiveMarginPercent(marginSettings, newProductCategory, undefined);
  const newProductSalePreview = calculateSalePrice(newProductCostValue, newProductMarginPercent);

  function clearMiniProductForm() {
    setNewProductName("");
    setNewProductBrand("");
    setNewProductCategory("vivere");
    setNewProductBarcode("");
    setNewProductCostPrice("");
    setNewProductQuantity("");
    setAutoGenerateBarcode(false);
  }

  function resetForm() {
    setSupplierName("");
    setDescription("");
    setExpectedTotal("");
    setSelectedItems([]);
    setEditingOrderId(null);
    clearMiniProductForm();
    setError("");
    setWarning("");
    setMessage("");
  }

  function loadOrderIntoForm(order: SupplyOrder, mode: "edit" | "clone") {
    const nextItems: SelectedSupplyItem[] = [];
    let skippedCount = 0;

    for (const item of order.items) {
      const product = productsById.get(item.productId);
      if (!product) {
        skippedCount += 1;
        continue;
      }
      nextItems.push({
        productId: product.id,
        productName: product.name,
        quantity: Math.max(1, Math.trunc(item.quantity)),
        barcode: product.barcode,
        brand: product.brand,
        category: product.category,
      });
    }

    setEditingOrderId(mode === "edit" ? order.id : null);
    setSupplierName(order.supplierName);
    setDescription(order.description || "");
    setExpectedTotal(String(order.expectedTotal));
    setSelectedItems(nextItems);
    setActiveTab("create");
    setError("");
    setMessage("");
    setWarning(
      skippedCount > 0
        ? `Se omitieron ${skippedCount} productos del pedido porque ya no existen en el catalogo.`
        : mode === "edit"
          ? `Editando pedido ${order.id}.`
          : "Productos cargados para pedir nuevamente.",
    );
  }

  function addProductToSelection(product: Product, quantity = 1) {
    setSelectedItems((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) {
        return current.map((item) =>
          item.productId === product.id ? { ...item, quantity: item.quantity + quantity } : item,
        );
      }
      return [
        ...current,
        {
          productId: product.id,
          productName: product.name,
          quantity,
          barcode: product.barcode,
          brand: product.brand,
          category: product.category,
        },
      ];
    });
    setError("");
    setWarning("");
    setMessage("");
  }

  function removeOneFromSelection(productId: string) {
    setSelectedItems((current) => {
      const existing = current.find((item) => item.productId === productId);
      if (!existing) return current;
      if (existing.quantity <= 1) {
        return current.filter((item) => item.productId !== productId);
      }
      return current.map((item) =>
        item.productId === productId ? { ...item, quantity: item.quantity - 1 } : item,
      );
    });
    setError("");
    setWarning("");
    setMessage("");
  }

  function updateSelectedQuantity(productId: string, nextValue: string) {
    const trimmedValue = String(nextValue || "").trim();

    setSelectedItems((current) => {
      const existing = current.find((item) => item.productId === productId);
      const product = productsById.get(productId);

      if (!trimmedValue) {
        return current.filter((item) => item.productId !== productId);
      }

      const parsed = Math.trunc(Number(trimmedValue));
      if (!Number.isFinite(parsed)) return current;
      if (parsed <= 0) {
        return current.filter((item) => item.productId !== productId);
      }

      if (existing) {
        return current.map((item) => (item.productId === productId ? { ...item, quantity: parsed } : item));
      }

      if (!product) return current;

      return [
        ...current,
        {
          productId: product.id,
          productName: product.name,
          quantity: parsed,
          barcode: product.barcode,
          brand: product.brand,
          category: product.category,
        },
      ];
    });

    setError("");
    setWarning("");
    setMessage("");
  }

  async function createAndAddProduct() {
    setError("");
    setWarning("");
    setMessage("");

    const trimmedName = newProductName.trim();
    const typedBarcode = newProductBarcode.trim();
    const barcodeToPersist = typedBarcode || (autoGenerateBarcode ? generateUniqueAutoBarcode(products) : "");
    const barcodeConflict = findBarcodeConflict(products, barcodeToPersist);

    if (!trimmedName) {
      setError("Ingresa el nombre del nuevo producto.");
      return;
    }
    if (newProductCostValue <= 0) {
      setError("Ingresa un precio de coste inicial valido.");
      return;
    }
    if (newProductQuantityValue <= 0) {
      setError("Ingresa la cantidad del nuevo producto para el pedido.");
      return;
    }
    if (normalizeBarcodeInput(barcodeToPersist) && barcodeConflict) {
      setError(`El codigo de barra ya existe en ${barcodeConflict.name}.`);
      return;
    }

    try {
      const created = await createProductApi({
        name: trimmedName,
        brand: newProductBrand,
        category: newProductCategory,
        costPrice: newProductCostValue,
        price: newProductSalePreview,
        marginPercent: newProductMarginPercent,
        barcode: barcodeToPersist || undefined,
      });

      setProducts((current) => sortProductsByName([created, ...current]));
      setSelectedItems((current) => [
        ...current,
        {
          productId: created.id,
          productName: created.name,
          quantity: newProductQuantityValue,
          barcode: created.barcode,
          brand: created.brand,
          category: created.category,
        },
      ]);
      setSelectedCatalogProductId(created.id);
      clearMiniProductForm();
      setMessage(`Producto ${created.name} creado y agregado al pedido.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "No se pudo crear el producto.");
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setWarning("");
    setMessage("");

    if (!isAdmin) {
      setError("Solo los administradores pueden crear pedido de mercancia.");
      return;
    }

    const supplier = supplierName.trim();
    const notes = description.trim();
    const total = Math.trunc(Number(expectedTotal));

    if (!supplier) {
      setError("Ingresa el nombre del proveedor.");
      return;
    }
    if (!Number.isFinite(total) || total <= 0) {
      setError("Ingresa un monto total esperado valido.");
      return;
    }
    if (selectedItems.length === 0) {
      setError("Agrega al menos un producto al pedido.");
      return;
    }

    const itemDrafts: SupplyOrderItemDraft[] = selectedItems.map((item) => ({
      productId: item.productId,
      quantity: Math.max(1, Math.trunc(item.quantity)),
    }));

    try {
      const successMessage = editingOrder ? "Pedido pendiente actualizado." : "Pedido esperado registrado.";
      if (editingOrder) {
        const updated = await updateSupplyOrderApi(editingOrder.id, {
          supplierName: supplier,
          description: notes,
          expectedTotal: total,
          items: itemDrafts,
        });
        setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await createSupplyOrderApi({
          supplierName: supplier,
          description: notes,
          expectedTotal: total,
          items: itemDrafts,
          createdBy: auth.user?.username || "operator",
        });
        setOrders((current) => [created, ...current]);
      }
      resetForm();
      setActiveTab("list");
      setMessage(successMessage);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "No se pudo guardar el pedido.");
    }
  }

  async function cancelPendingOrder(order: SupplyOrder) {
    if (!canEditPendingOrder(order)) return;
    setError("");
    setWarning("");
    setMessage("");
    const confirmed = window.confirm("Seguro que quieres cancelar este pedido pendiente?");
    if (!confirmed) return;
    try {
      await cancelSupplyOrderApi(order.id);
      setOrders((current) => current.filter((item) => item.id !== order.id));
      if (editingOrderId === order.id) {
        resetForm();
      }
      setWarning("Pedido pendiente cancelado.");
      setActiveTab("list");
    } catch {
      setError("No se pudo cancelar el pedido pendiente.");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Pedido mercancia" }]} asTitle />
            <p className={styles.subtitle}>Arma pedidos por producto, cantidades y reusa ordenes anteriores.</p>
          </div>
          <SessionStatusBar />
        </header>

        <section className={styles.tabs}>
          {isAdmin ? (
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "create" ? styles.tabBtnActive : ""}`.trim()}
              onClick={() => setActiveTab("create")}
            >
              Nuevo pedido
            </button>
          ) : null}
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "list" ? styles.tabBtnActive : ""}`.trim()}
            onClick={() => setActiveTab("list")}
          >
            Pedidos cargados
          </button>
        </section>

        {activeTab === "create" ? (
          <section className={styles.formCard}>
            <h2 className={styles.cardTitle}>{editingOrder ? "Editar pedido pendiente" : "Nuevo pedido esperado"}</h2>

            {isAdmin ? (
              <form className={styles.form} onSubmit={onSubmit}>
                {editingOrder ? <p className={styles.editingHint}>Editando pedido {editingOrder.id}.</p> : null}

                <div className={styles.createLayout}>
                  <section className={`${styles.panelCard} ${styles.newProductCard}`}>
                    <div className={styles.cardHead}>
                      <h3 className={styles.subTitle}>Crear producto y agregar</h3>
                      <span className={styles.helperText}>Alta rapida para el pedido</span>
                    </div>

                    <div className={styles.miniFormGrid}>
                      <label className={styles.fieldCompact}>
                        <span>Nombre</span>
                        <input
                          className={styles.input}
                          value={newProductName}
                          onChange={(event) => setNewProductName(event.target.value)}
                          placeholder="Ej: Galleta premium"
                        />
                      </label>

                      <label className={styles.fieldCompact}>
                        <span>Marca</span>
                        <input
                          className={styles.input}
                          value={newProductBrand}
                          onChange={(event) => setNewProductBrand(event.target.value)}
                          placeholder="Ej: Coca-Cola"
                        />
                      </label>

                      <label className={styles.fieldCompact}>
                        <span>Categoria</span>
                        <select
                          className={styles.input}
                          value={newProductCategory}
                          onChange={(event) => setNewProductCategory(event.target.value as ProductCategory)}
                        >
                          {PRODUCT_CATEGORIES.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className={styles.fieldCompact}>
                        <span>Codigo de barra</span>
                        <input
                          className={styles.input}
                          value={newProductBarcode}
                          onChange={(event) => setNewProductBarcode(event.target.value)}
                          placeholder="Ej: 7791234567890"
                          disabled={autoGenerateBarcode}
                        />
                      </label>

                      <label className={styles.toggleLabel}>
                        <input
                          type="checkbox"
                          checked={autoGenerateBarcode}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setAutoGenerateBarcode(checked);
                            if (checked) {
                              setNewProductBarcode(generateUniqueAutoBarcode(products));
                            }
                          }}
                        />
                        Generar codigo automaticamente
                      </label>

                      <label className={styles.fieldCompact}>
                        <span>Coste inicial</span>
                        <input
                          className={styles.input}
                          type="text"
                          inputMode="numeric"
                          value={newProductCostPrice}
                          onChange={(event) => setNewProductCostPrice(formatIntegerTextMask(event.target.value))}
                          placeholder="0"
                        />
                      </label>

                      <label className={styles.fieldCompact}>
                        <span>Cantidad para pedir</span>
                        <input
                          className={styles.input}
                          type="text"
                          inputMode="numeric"
                          value={newProductQuantity}
                          onChange={(event) => setNewProductQuantity(formatIntegerTextMask(event.target.value))}
                          placeholder="0"
                        />
                      </label>

                      <div className={styles.valueBox}>
                        <strong>Precio sugerido:</strong> {newProductSalePreview > 0 ? formatMoneyARS(newProductSalePreview) : "-"}
                      </div>

                      <button type="button" className={styles.primaryBtn} onClick={() => void createAndAddProduct()}>
                        Crear y agregar
                      </button>
                    </div>
                  </section>

                  <section className={`${styles.panelCard} ${styles.orderFormCard}`}>
                    <div className={styles.cardHead}>
                      <h3 className={styles.subTitle}>{editingOrder ? "Editar pedido pendiente" : "Nuevo pedido esperado"}</h3>
                      <span className={styles.helperText}>Proveedor, monto y observaciones</span>
                    </div>

                    <div className={styles.topFields}>
                      <label className={styles.field}>
                        <span>Proveedor</span>
                        <input
                          className={styles.input}
                          list="supplier-options"
                          value={supplierName}
                          onChange={(event) => setSupplierName(event.target.value)}
                          placeholder="Nombre del proveedor"
                        />
                        <datalist id="supplier-options">
                          {supplierOptions.map((supplier) => (
                            <option key={supplier} value={supplier} />
                          ))}
                        </datalist>
                      </label>

                      <label className={styles.field}>
                        <span>Monto total esperado</span>
                        <input
                          className={styles.input}
                          type="number"
                          min={1}
                          value={expectedTotal}
                          onChange={(event) => setExpectedTotal(event.target.value)}
                          placeholder="0"
                        />
                      </label>
                    </div>

                    <label className={`${styles.field} ${styles.descriptionField}`.trim()}>
                      <span>Observaciones</span>
                      <textarea
                        className={`${styles.textarea} ${styles.descriptionTextarea}`.trim()}
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        rows={5}
                        placeholder="Notas para el proveedor o para la recepcion"
                      />
                    </label>
                  </section>

                  <section className={`${styles.panelCard} ${styles.catalogCard}`}>
                    <div className={styles.cardHead}>
                      <h3 className={styles.subTitle}>Productos existentes</h3>
                      <span className={styles.helperText}>{visibleProducts.length} visibles | doble click para agregar</span>
                    </div>

                    <input
                      className={styles.input}
                      value={productSearch}
                      onChange={(event) => setProductSearch(event.target.value)}
                      placeholder="Buscar por nombre, categoria o codigo"
                    />

                    <div className={styles.tableCard}>
                      <div className={`${styles.tableHead} ${styles.catalogTableHead}`}>
                        <div>Codigo</div>
                        <div>Nombre</div>
                        <div>Marca</div>
                        <div>Categoria</div>
                        <div className={styles.cellCenter}>Stock</div>
                      </div>

                      <div className={styles.tableBody}>
                        {visibleProducts.length === 0 ? (
                          <p className={styles.empty}>No hay productos para mostrar.</p>
                        ) : (
                          visibleProducts.map((product, index) => (
                            <button
                              key={product.id}
                              type="button"
                              className={`${styles.tableRowButton} ${styles.catalogTableRow} ${
                                index % 2 === 0 ? styles.tableRowOdd : ""
                              } ${selectedCatalogProductId === product.id ? styles.tableRowActive : ""}`.trim()}
                              onClick={() => setSelectedCatalogProductId(product.id)}
                              onDoubleClick={() => addProductToSelection(product)}
                              aria-label={`Agregar ${product.name} al pedido con doble click`}
                            >
                              <div className={styles.codeCell}>{product.barcode || "-"}</div>
                              <div className={styles.nameCell}>{product.name}</div>
                              <div className={styles.nameCell}>{product.brand || "-"}</div>
                              <div className={styles.categoryCell}>{product.category || "vivere"}</div>
                              <div className={styles.stockCell}>{Math.max(0, Math.trunc(Number(product.existencia || 0)))}</div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </section>

                  <section className={`${styles.panelCard} ${styles.selectedCard}`}>
                    <div className={styles.cardHead}>
                      <h3 className={styles.subTitle}>Productos del pedido</h3>
                      <span className={styles.helperText}>
                        {selectedItems.length} productos | {totalRequestedUnits} unidades
                      </span>
                    </div>

                    <div className={styles.tableCard}>
                      <div className={`${styles.tableHead} ${styles.selectedTableHead}`}>
                        <div>Nombre</div>
                        <div>Marca</div>
                        <div>Categoria</div>
                        <div>Codigo</div>
                        <div className={styles.cellCenter}>Cantidad</div>
                      </div>

                      <div className={styles.tableBody}>
                        {selectedItems.length === 0 ? (
                          <p className={styles.empty}>Aun no agregaste productos al pedido.</p>
                        ) : (
                          selectedItems.map((item, index) => (
                            <div
                              key={item.productId}
                              className={`${styles.selectedTableRow} ${index % 2 === 0 ? styles.tableRowOdd : ""}`.trim()}
                            >
                              <div className={styles.nameCell}>{item.productName}</div>
                              <div className={styles.nameCell}>{item.brand || "-"}</div>
                              <div className={styles.categoryCell}>{item.category || "vivere"}</div>
                              <div className={styles.codeCell}>{item.barcode || "-"}</div>
                              <div className={styles.quantityCell}>
                                <div className={styles.quantityStepper}>
                                  <button
                                    type="button"
                                    className={styles.stepBtn}
                                    onClick={() => removeOneFromSelection(item.productId)}
                                    aria-label={`Quitar una unidad de ${item.productName}`}
                                  >
                                    -
                                  </button>
                                  <input
                                    className={styles.stepInput}
                                    type="number"
                                    min={1}
                                    value={String(item.quantity)}
                                    onChange={(event) => updateSelectedQuantity(item.productId, event.target.value)}
                                    aria-label={`Cantidad solicitada para ${item.productName}`}
                                  />
                                  <button
                                    type="button"
                                    className={styles.stepBtn}
                                    onClick={() => {
                                      const product = productsById.get(item.productId);
                                      if (!product) return;
                                      addProductToSelection(product);
                                    }}
                                    aria-label={`Agregar una unidad de ${item.productName}`}
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </section>
                </div>

                {error ? <div className={styles.errorBox}>{error}</div> : null}
                {warning ? <div className={styles.warningBox}>{warning}</div> : null}
                {message ? <div className={styles.successBox}>{message}</div> : null}

                <div className={styles.actions}>
                  <button type="button" className={styles.secondaryBtn} onClick={resetForm}>
                    {editingOrder ? "Salir edicion" : "Limpiar"}
                  </button>
                  <button type="submit" className={styles.primaryBtn}>
                    {editingOrder ? "Guardar cambios" : "Guardar pedido"}
                  </button>
                </div>
              </form>
            ) : (
              <p className={styles.empty}>Solo los administradores pueden crear pedido de mercancia.</p>
            )}
          </section>
        ) : null}

        {activeTab === "list" ? (
          <section className={styles.listCard}>
            <div className={styles.listHead}>
              <h2 className={styles.cardTitle}>Pedidos cargados</h2>
              <div className={styles.pendingHint}>Pendientes: {pendingCount}</div>
            </div>

            {loading ? (
              <p className={styles.empty}>Cargando pedidos...</p>
            ) : visibleOrders.length === 0 ? (
              <p className={styles.empty}>Aun no hay pedidos cargados.</p>
            ) : (
              <div className={styles.orderList}>
                {visibleOrders.map((order) => {
                  const editablePending = canEditPendingOrder(order);
                  const totalUnits = order.items.reduce((acc, item) => acc + Math.max(0, Math.trunc(item.quantity)), 0);

                  return (
                    <article key={order.id} className={styles.orderCard}>
                      <div className={styles.orderTop}>
                        <div>
                          <h3 className={styles.orderTitle}>{order.supplierName}</h3>
                          <p className={styles.orderMeta}>
                            {order.id} | {formatDateTime(order.createdAt)}
                          </p>
                        </div>

                        <div className={styles.orderActions}>
                          <span className={`${styles.badge} ${order.status === "pending" ? styles.badgePending : styles.badgeReceived}`.trim()}>
                            {order.status === "pending" ? "Pendiente" : "Recibido"}
                          </span>
                          <strong className={styles.orderAmount}>{formatMoneyARS(order.expectedTotal)}</strong>
                        </div>
                      </div>

                      {order.description ? <p className={styles.orderDescription}>{order.description}</p> : null}

                      <div className={styles.orderSummaryRow}>
                        <span>{order.items.length} productos</span>
                        <span>{totalUnits} unidades</span>
                        <span>Cargado por {order.createdBy || "operator"}</span>
                      </div>

                      {order.items.length > 0 ? (
                        <div className={styles.orderItemsTable}>
                          <div
                            className={`${styles.orderItemsHead} ${
                              order.status === "received" ? styles.orderItemsHeadReceived : ""
                            }`.trim()}
                          >
                            <div>Producto / Cant. esperada</div>
                            <div>Marca</div>
                            {order.status === "received" ? (
                              <>
                                <div className={styles.cellRight}>No llego</div>
                                <div className={styles.cellRight}>Recibido</div>
                                <div>Vencimiento</div>
                              </>
                            ) : null}
                          </div>

                          {order.items.map((item, index) => (
                            <div
                              key={`${order.id}-${item.productId}`}
                              className={`${styles.orderItemRow} ${index % 2 === 1 ? styles.orderItemRowOdd : ""} ${
                                order.status === "received" ? styles.orderItemRowReceived : ""
                              }`.trim()}
                            >
                              <div className={styles.orderItemLead}>
                                <span className={styles.orderItemName}>{item.productName}</span>
                                <span className={styles.orderItemQtyBadge}>x{item.quantity}</span>
                              </div>
                              <div>{item.brand || "-"}</div>
                              {order.status === "received" ? (
                                <>
                                  <div className={styles.cellRight}>{item.missingQuantity || 0}</div>
                                  <div className={styles.cellRight}>{item.receivedQuantity || 0}</div>
                                  <div>{item.expirationDate || "-"}</div>
                                </>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className={styles.emptyInline}>Pedido sin detalle de productos.</p>
                      )}

                      {order.status === "received" ? (
                        <div className={styles.receivedBox}>
                          <p>
                            <strong>Total recibido:</strong> {formatMoneyARS(order.actualTotal || 0)}
                          </p>
                          <p>
                            <strong>Monto restante:</strong> {formatMoneyARS(order.remainingAmount || 0)}
                          </p>
                          {order.receiveComment ? (
                            <p>
                              <strong>Comentario recepcion:</strong> {order.receiveComment}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      <div className={styles.orderButtons}>
                        {isAdmin ? (
                          <button type="button" className={styles.secondaryBtn} onClick={() => loadOrderIntoForm(order, "clone")}>
                            Pedir nuevamente
                          </button>
                        ) : null}
                        {editablePending ? (
                          <>
                            <button type="button" className={styles.secondaryBtn} onClick={() => loadOrderIntoForm(order, "edit")}>
                              Editar
                            </button>
                            <button type="button" className={styles.removeBtn} onClick={() => void cancelPendingOrder(order)}>
                              Cancelar
                            </button>
                          </>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {error ? <div className={styles.errorBox}>{error}</div> : null}
            {warning ? <div className={styles.warningBox}>{warning}</div> : null}
            {message ? <div className={styles.successBox}>{message}</div> : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
