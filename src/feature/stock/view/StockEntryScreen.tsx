import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import ProductTable from "../../product/component/ProductTable";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import { formatDateAR, formatMoneyARS } from "../../../shared/format/locale";
import { formatIntegerTextMask, parsePositiveIntFromTextMask } from "../../../shared/format/numeric";
import { matchesNumericContainsFilter, matchesPriceFilter } from "../../../shared/product/product-filter";
import { normalizeForSearch } from "../../../shared/search/search";
import {
  PRODUCT_CATEGORIES,
  calculateSalePrice,
  inferCostPriceFromSalePrice,
  resolveEffectiveMarginPercent,
  type PriceMarginSettings,
  type Product,
  type ProductCategory,
  type ProductSortKey,
} from "../../product/model/product.types";
import {
  createProductApi,
  createProductPriceApi,
  fetchPriceMarginSettingsApi,
  fetchProducts,
  removeProductPriceMarginApi,
  updateCategoryPriceMarginApi,
  updateProductApi,
  upsertProductPriceMarginApi,
} from "../../product/service/product.api";
import type { SupplyOrder } from "../../supply/model/supply.types";
import { fetchSupplyOrdersApi } from "../../supply/service/supply.api";
import { createStockEntryApi } from "../service/stock.api";
import { resolveImageUrl, uploadImageFromFile } from "../../../shared/image/image.service";
import { findBarcodeConflict, generateUniqueAutoBarcode, normalizeBarcodeInput } from "../../product/model/product.barcode";
import styles from "./StockEntryScreen.module.css";

type EntryMode = "existing" | "new";

export default function StockEntryScreen() {
  const auth = useAuth();
  const isAdmin = auth.user?.role === "admin";
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const initialProductId = searchParams.get("productId");
  const cameFromProducts = (location.state as { from?: string } | null)?.from === "products";
  const merchandiseFormId = "stock-entry-form";

  const [mode, setMode] = useState<EntryMode>("existing");
  const [products, setProducts] = useState<Product[]>([]);
  const [marginSettings, setMarginSettings] = useState<PriceMarginSettings | null>(null);
  const [receivedOrders, setReceivedOrders] = useState<SupplyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(initialProductId);

  const [nameFilter, setNameFilter] = useState("");
  const [barcodeFilter, setBarcodeFilter] = useState("");
  const [priceFilter, setPriceFilter] = useState("");
  const [existenciaFilter, setExistenciaFilter] = useState("");
  const [createdAtFilter, setCreatedAtFilter] = useState("");
  const [sortKey, setSortKey] = useState<ProductSortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [hasUserSorted, setHasUserSorted] = useState(false);

  const [newName, setNewName] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newBarcode, setNewBarcode] = useState("");
  const [autoGenerateBarcodeOnConfirm, setAutoGenerateBarcodeOnConfirm] = useState(false);
  const [newCategory, setNewCategory] = useState<ProductCategory>("bebida");
  const [newImageUrl, setNewImageUrl] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [existingName, setExistingName] = useState("");
  const [existingBrand, setExistingBrand] = useState("");
  const [existingBarcode, setExistingBarcode] = useState("");
  const [existingCategory, setExistingCategory] = useState<ProductCategory>("bebida");
  const [existingImageUrl, setExistingImageUrl] = useState("");

  const [supplyOrderId, setSupplyOrderId] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [categoryMarginDraft, setCategoryMarginDraft] = useState("30");
  const [productMarginDraft, setProductMarginDraft] = useState("30");
  const [newProductUseMarginOverride, setNewProductUseMarginOverride] = useState(false);
  const [newProductMarginDraft, setNewProductMarginDraft] = useState("30");
  const [quantity, setQuantity] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [description, setDescription] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const reloadData = useCallback(async (nextSelectedId?: string | null) => {
    setLoading(true);
    setError("");
    try {
      const [productList, marginList, supplyOrders] = await Promise.all([
        fetchProducts(),
        fetchPriceMarginSettingsApi(),
        fetchSupplyOrdersApi(),
      ]);
      const received = supplyOrders
        .filter((item) => item.status === "received")
        .sort((a, b) => new Date(b.receivedAt || b.createdAt).getTime() - new Date(a.receivedAt || a.createdAt).getTime());

      setProducts(productList);
      setMarginSettings(marginList);
      setReceivedOrders(received);
      if (typeof nextSelectedId !== "undefined") {
        setSelectedProductId(nextSelectedId);
      }
      setSupplyOrderId((current) => current || received[0]?.id || "");
    } catch {
      setError("No se pudo cargar informacion de productos, margenes o pedidos recibidos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadData(initialProductId);
  }, [initialProductId, reloadData]);

  const selectedProduct = useMemo(
    () => products.find((item) => item.id === selectedProductId) || null,
    [products, selectedProductId],
  );

  useEffect(() => {
    if (initialProductId) {
      setMode("existing");
      return;
    }
    if (mode === "new") return;
    if (!selectedProductId) return;
    setMode("existing");
  }, [initialProductId, mode, selectedProductId]);

  const activeCategory = mode === "existing" ? existingCategory : newCategory;
  const selectedProductHasMarginOverride = useMemo(() => {
    if (!selectedProduct) return false;
    return (marginSettings?.productMargins || []).some((item) => item.productId === selectedProduct.id);
  }, [marginSettings?.productMargins, selectedProduct]);
  const activeCategoryMarginPercent = resolveEffectiveMarginPercent(marginSettings, activeCategory, undefined);
  const newProductMarginPercent = useMemo(() => {
    const parsed = Math.trunc(Number(newProductMarginDraft));
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return parsed;
  }, [newProductMarginDraft]);
  const activeMarginPercent = useMemo(() => {
    if (mode === "new" && isAdmin && newProductUseMarginOverride) {
      return newProductMarginPercent;
    }
    return resolveEffectiveMarginPercent(
      marginSettings,
      activeCategory,
      mode === "existing" ? selectedProduct?.id : undefined,
    );
  }, [activeCategory, isAdmin, marginSettings, mode, newProductMarginPercent, newProductUseMarginOverride, selectedProduct?.id]);

  useEffect(() => {
    const draft = marginSettings?.categoryMargins?.[activeCategory] ?? 30;
    setCategoryMarginDraft(String(draft));
  }, [activeCategory, marginSettings]);

  useEffect(() => {
    if (mode !== "new") return;
    if (newProductUseMarginOverride) return;
    setNewProductMarginDraft(String(activeCategoryMarginPercent));
  }, [activeCategoryMarginPercent, mode, newProductUseMarginOverride]);

  useEffect(() => {
    if (!selectedProduct) {
      setProductMarginDraft(String(activeMarginPercent));
      return;
    }
    const override = marginSettings?.productMargins.find((item) => item.productId === selectedProduct.id);
    setProductMarginDraft(String(override?.marginPercent ?? activeMarginPercent));
  }, [activeMarginPercent, marginSettings?.productMargins, selectedProduct]);

  useEffect(() => {
    if (mode !== "existing") return;
    if (!selectedProduct) {
      setCostPrice("");
      return;
    }
    const fallbackCost = inferCostPriceFromSalePrice(selectedProduct.price, activeMarginPercent);
    const productCost =
      Number.isFinite(Number(selectedProduct.costPrice)) && Number(selectedProduct.costPrice) > 0
        ? Math.trunc(Number(selectedProduct.costPrice))
        : fallbackCost;
    setCostPrice(formatIntegerTextMask(String(productCost)));
  }, [activeMarginPercent, mode, selectedProduct]);

  useEffect(() => {
    if (mode !== "existing") return;
    if (!selectedProduct) {
      setExistingName("");
      setExistingBrand("");
      setExistingBarcode("");
      setExistingCategory("bebida");
      setExistingImageUrl("");
      return;
    }
    setExistingName(selectedProduct.name || "");
    setExistingBrand(selectedProduct.brand || "");
    setExistingBarcode(selectedProduct.barcode || "");
    setExistingCategory(selectedProduct.category || "bebida");
    setExistingImageUrl(selectedProduct.imageUrl || "");
  }, [mode, selectedProduct]);

  const costPriceValue = parsePositiveIntFromTextMask(costPrice);
  const salePricePreview = calculateSalePrice(costPriceValue, activeMarginPercent);

  const filteredProducts = useMemo(() => {
    const q = normalizeForSearch(nameFilter);
    const p = (priceFilter || "").replace(/\D/g, "");
    const e = (existenciaFilter || "").replace(/\D/g, "");
    let list = products;

    if (q) {
      list = list.filter((item) => normalizeForSearch(item.name).includes(q));
    }

    if (barcodeFilter.trim()) {
      const barcodeQuery = barcodeFilter.trim();
      list = list.filter((item) => (item.barcode || "").includes(barcodeQuery));
    }

    if (p) {
      list = list.filter((item) => matchesPriceFilter(item.price, p));
    }

    if (e) {
      list = list.filter((item) => matchesNumericContainsFilter(Number(item.existencia || 0), e));
    }

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
  }, [products, nameFilter, barcodeFilter, priceFilter, existenciaFilter, createdAtFilter, sortKey, sortDir]);

  useEffect(() => {
    if (filteredProducts.length === 0) {
      if (selectedProductId !== null) {
        setSelectedProductId(null);
      }
      return;
    }

    const exists = filteredProducts.some((item) => item.id === selectedProductId);
    if (!exists) {
      setSelectedProductId(filteredProducts[0].id);
    }
  }, [filteredProducts, selectedProductId]);

  function clearStockFields() {
    setQuantity("");
    setExpirationDate("");
    setDescription("");
  }

  function clearNewProductFields() {
    setNewName("");
    setNewBrand("");
    setNewBarcode("");
    setAutoGenerateBarcodeOnConfirm(false);
    setNewCategory("bebida");
    setNewImageUrl("");
    setNewProductUseMarginOverride(false);
    setNewProductMarginDraft(String(marginSettings?.categoryMargins?.bebida ?? 30));
  }

  function preventEnterFromSubmittingBarcode(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
    }
  }

  function handleAutoBarcodeChange(checked: boolean) {
    setAutoGenerateBarcodeOnConfirm(checked);
    if (checked) {
      setNewBarcode(generateUniqueAutoBarcode(products));
    }
  }

  async function handleNewProductImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("El archivo debe ser una imagen.");
      return;
    }

    setError("");
    setMessage("");
    setIsUploadingImage(true);
    try {
      const uploadedPath = await uploadImageFromFile(file);
      setNewImageUrl(uploadedPath);
      setMessage("Imagen del producto cargada correctamente.");
    } catch {
      setError("No se pudo cargar la imagen del producto.");
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function handleExistingProductImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("El archivo debe ser una imagen.");
      return;
    }

    setError("");
    setMessage("");
    setIsUploadingImage(true);
    try {
      const uploadedPath = await uploadImageFromFile(file);
      setExistingImageUrl(uploadedPath);
      setMessage("Imagen del producto cargada correctamente. Confirma el ingreso para guardar el cambio.");
    } catch {
      setError("No se pudo cargar la imagen del producto.");
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function saveSelectedProductChanges() {
    if (!selectedProduct) return null;

    const trimmedName = existingName.trim();
    if (!trimmedName) {
      setError("El nombre del producto es obligatorio.");
      return null;
    }

    const typedBarcode = existingBarcode.trim();
    const barcodeConflict = findBarcodeConflict(products, typedBarcode, selectedProduct.id);
    if (normalizeBarcodeInput(typedBarcode) && barcodeConflict) {
      setError(`El codigo de barra ya existe en ${barcodeConflict.name}.`);
      return null;
    }

    const updated = await updateProductApi(selectedProduct.id, {
      name: trimmedName,
      brand: existingBrand,
      barcode: typedBarcode || undefined,
      category: existingCategory,
      costPrice: costPriceValue,
      price: salePricePreview,
      marginPercent: activeMarginPercent,
      imageUrl: existingImageUrl || undefined,
      supplyOrderId: supplyOrderId || undefined,
    });

    if (!updated) {
      setError("No se pudo actualizar el producto seleccionado.");
      return null;
    }

    return updated;
  }

  async function saveCategoryMargin() {
    setError("");
    setMessage("");

    if (!isAdmin) return;
    const nextMargin = Math.max(0, Math.trunc(Number(categoryMarginDraft)));
    if (!Number.isFinite(nextMargin)) {
      setError("Ingresa un porcentaje de ganancia valido para la categoria.");
      return;
    }

    try {
      const updated = await updateCategoryPriceMarginApi(activeCategory, nextMargin);
      setMarginSettings(updated);
      setCategoryMarginDraft(String(updated.categoryMargins[activeCategory] ?? nextMargin));
      setMessage("Porcentaje de categoria actualizado.");
    } catch {
      setError("No se pudo actualizar el porcentaje de categoria.");
    }
  }

  async function saveProductMarginOverride() {
    setError("");
    setMessage("");

    if (!isAdmin || !selectedProduct) return;

    const nextMargin = Math.max(0, Math.trunc(Number(productMarginDraft)));
    if (!Number.isFinite(nextMargin)) {
      setError("Ingresa un porcentaje de ganancia valido para el producto.");
      return;
    }

    try {
      const updated = await upsertProductPriceMarginApi(selectedProduct.id, nextMargin);
      setMarginSettings(updated);
      setProductMarginDraft(String(nextMargin));
      setMessage("Porcentaje especifico por producto guardado.");
    } catch {
      setError("No se pudo guardar el porcentaje especifico del producto.");
    }
  }

  async function removeProductMarginOverride() {
    setError("");
    setMessage("");

    if (!isAdmin || !selectedProduct) return;

    try {
      const updated = await removeProductPriceMarginApi(selectedProduct.id);
      setMarginSettings(updated);
      const fallback = updated.categoryMargins[selectedProduct.category || "bebida"] ?? 30;
      setProductMarginDraft(String(fallback));
      setMessage("Porcentaje especifico del producto eliminado.");
    } catch {
      setError("No se pudo eliminar el porcentaje especifico del producto.");
    }
  }

  async function submitMerchandise(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    const quantityToAdd = Math.trunc(Number(quantity));
    if (!Number.isFinite(quantityToAdd) || quantityToAdd <= 0) {
      setError("Ingresa una cantidad valida.");
      return;
    }

    if (!expirationDate) {
      setError("La fecha de vencimiento es obligatoria para ingresar mercaderia.");
      return;
    }

    if (!Number.isFinite(costPriceValue) || costPriceValue <= 0) {
      setError("Ingresa un precio de compra valido.");
      return;
    }

    if (!Number.isFinite(salePricePreview) || salePricePreview <= 0) {
      setError("No se pudo calcular el precio de venta.");
      return;
    }

    if (mode === "new" && isAdmin && newProductUseMarginOverride) {
      const parsed = Math.trunc(Number(newProductMarginDraft));
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError("Ingresa un porcentaje de ganancia valido para el nuevo producto.");
        return;
      }
    }

    let targetProductId = selectedProductId;
    let targetProductName = selectedProduct?.name || newName.trim();
    let generatedBarcode: string | null = null;

    try {
      if (mode === "new") {
        const trimmedName = newName.trim();
        if (!trimmedName) {
          setError("Ingresa el nombre del nuevo producto.");
          return;
        }
        const typedBarcode = newBarcode.trim();
        const barcodeToPersist = typedBarcode || (autoGenerateBarcodeOnConfirm ? generateUniqueAutoBarcode(products) : undefined);
        const barcodeConflict = findBarcodeConflict(products, barcodeToPersist || "");
        if (normalizeBarcodeInput(barcodeToPersist || "") && barcodeConflict) {
          setError(`El codigo de barra ya existe en ${barcodeConflict.name}.`);
          return;
        }

        const created = await createProductApi({
          name: trimmedName,
          brand: newBrand,
          barcode: barcodeToPersist,
          category: newCategory,
          costPrice: costPriceValue,
          price: salePricePreview,
          marginPercent: activeMarginPercent,
          imageUrl: newImageUrl || undefined,
          supplyOrderId: supplyOrderId || undefined,
        });
        if (!typedBarcode && barcodeToPersist) {
          generatedBarcode = created.barcode || barcodeToPersist;
        }
        if (isAdmin && newProductUseMarginOverride) {
          const updatedMargins = await upsertProductPriceMarginApi(created.id, newProductMarginPercent);
          setMarginSettings(updatedMargins);
        }
        targetProductId = created.id;
        targetProductName = created.name;
        setMode("existing");
        clearNewProductFields();
      } else {
        if (!selectedProductId || !selectedProduct) {
          setError("Selecciona un producto existente o cambia a nuevo producto.");
          return;
        }

        const updatedProduct = await saveSelectedProductChanges();
        if (!updatedProduct) return;
        targetProductName = updatedProduct.name;

        await createProductPriceApi({
          productId: selectedProductId,
          costPrice: costPriceValue,
          newPrice: salePricePreview,
          marginPercent: activeMarginPercent,
        });
      }

      if (!targetProductId) {
        setError("No se pudo resolver el producto para el ingreso.");
        return;
      }

      await createStockEntryApi({
        productId: targetProductId,
        expirationDate: expirationDate || undefined,
        quantity: quantityToAdd,
        description: description.trim() || undefined,
        supplyOrderId: supplyOrderId || undefined,
        costPrice: costPriceValue,
        salePrice: salePricePreview,
      });

      await reloadData(targetProductId);
      clearStockFields();
      setMessage(
        `Mercaderia ingresada para ${targetProductName || targetProductId}.${generatedBarcode ? ` Codigo generado: ${generatedBarcode}.` : ""}`,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo registrar el ingreso de mercaderia.");
    }
  }

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
    if (key === "price") setPriceFilter(value);
    if (key === "existencia") setExistenciaFilter(value);
    if (key === "createdAt") setCreatedAtFilter(value);
  }

  const compactFieldClass = `${styles.field} ${styles.fieldCompact}`;
  const compactFieldWideClass = `${styles.field} ${styles.fieldCompact} ${styles.fieldSpanTwo}`;
  const marginSourceLabel =
    mode === "new" ? (newProductUseMarginOverride ? "producto nuevo" : "categoria") : selectedProductHasMarginOverride ? "producto" : "categoria";

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs
              asTitle
              items={
                cameFromProducts
                  ? [{ label: "Menu", to: "/operation" }, { label: "Productos", to: "/products/new" }, { label: "Cargar mercancia" }]
                  : [{ label: "Menu", to: "/operation" }, { label: "Cargar mercancia" }]
              }
            />
            <p className={styles.subtitle}>Alta de producto y carga de stock con precio de coste, venta y recepcion asociada.</p>
          </div>
          <SessionStatusBar />
        </header>

        <div className={styles.layout}>
          <div className={styles.formColumn}>
            <div className={styles.modeSwitch}>
              <button
                type="button"
                className={`${styles.modeBtn} ${mode === "existing" ? styles.modeBtnActive : ""}`}
                onClick={() => setMode("existing")}
              >
                Añadir existencia
              </button>
              <button
                type="button"
                className={`${styles.modeBtn} ${mode === "new" ? styles.modeBtnActive : ""}`}
                onClick={() => setMode("new")}
              >
                Nuevo producto
              </button>
            </div>

            <section className={styles.formCard}>
            <form id={merchandiseFormId} onSubmit={submitMerchandise} className={`${styles.form} ${mode === "new" ? styles.formCompact : ""}`}>
              {mode === "new" ? (
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Datos para crear producto</h2>
                  <div className={styles.sectionSplit}>
                    <div className={styles.imagePanel}>
                      {newImageUrl ? (
                        <img className={styles.productImage} src={resolveImageUrl(newImageUrl)} alt={newName || "Crear producto"} />
                      ) : (
                        <div className={styles.imageFallback}>
                          {(newName || "P").slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <label className={styles.uploadBtn} aria-disabled={isUploadingImage}>
                        {isUploadingImage ? "Subiendo..." : "Cargar imagen"}
                        <input
                          type="file"
                          accept="image/*"
                          className={styles.hiddenFileInput}
                          onChange={handleNewProductImageChange}
                          disabled={isUploadingImage}
                        />
                      </label>
                    </div>

                    <div className={`${styles.fieldsColumn} ${styles.fieldMatrix}`}>
                      <label className={`${styles.field} ${styles.fieldCompact}`}>
                        <span>Nombre</span>
                        <input
                          className={styles.input}
                          value={newName}
                          onChange={(event) => setNewName(event.target.value)}
                          placeholder="Ej: Gaseosa lima 500ml"
                        />
                      </label>
                      <label className={`${styles.field} ${styles.fieldCompact}`}>
                        <span>Marca</span>
                        <input
                          className={styles.input}
                          value={newBrand}
                          onChange={(event) => setNewBrand(event.target.value)}
                          placeholder="Ej: Coca-Cola"
                        />
                      </label>
                      <label className={`${styles.field} ${styles.fieldCompact}`}>
                        <span>Codigo de barra</span>
                        <div className={styles.inputStack}>
                          <input
                            className={styles.input}
                            value={newBarcode}
                            onChange={(event) => setNewBarcode(event.target.value)}
                            onKeyDown={preventEnterFromSubmittingBarcode}
                            autoComplete="off"
                            spellCheck={false}
                            disabled={autoGenerateBarcodeOnConfirm}
                            placeholder="Ej: 7791234567890"
                          />
                          <label className={styles.toggleLabel}>
                            <input
                              type="checkbox"
                              checked={autoGenerateBarcodeOnConfirm}
                              onChange={(event) => handleAutoBarcodeChange(event.target.checked)}
                            />
                            Generar automaticamente al confirmar
                          </label>
                        </div>
                      </label>
                      <label className={`${styles.field} ${styles.fieldCompact}`}>
                        <span>Categoria</span>
                        <select
                          className={`${styles.input} ${styles.selectInput}`}
                          value={newCategory}
                          onChange={(event) => setNewCategory(event.target.value as ProductCategory)}
                        >
                          {PRODUCT_CATEGORIES.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                </section>
              ) : (
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Producto seleccionado</h2>
                  <div className={styles.sectionSplit}>
                    <div className={styles.imagePanel}>
                      {existingImageUrl ? (
                        <img
                          className={styles.productImage}
                          src={resolveImageUrl(existingImageUrl)}
                          alt={existingName || "Producto seleccionado"}
                        />
                      ) : (
                        <div className={styles.imageFallback}>
                          {(existingName || "P").slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <label className={styles.uploadBtn} aria-disabled={isUploadingImage || !selectedProduct}>
                        {isUploadingImage ? "Subiendo..." : "Cambiar imagen"}
                        <input
                          type="file"
                          accept="image/*"
                          className={styles.hiddenFileInput}
                          onChange={handleExistingProductImageChange}
                          disabled={isUploadingImage || !selectedProduct}
                        />
                      </label>
                    </div>
                    <div className={`${styles.fieldsColumn} ${styles.fieldMatrix}`}>
                      <label className={`${styles.field} ${styles.fieldCompact}`}>
                        <span>Nombre</span>
                        <input
                          className={styles.input}
                          value={existingName}
                          onChange={(event) => setExistingName(event.target.value)}
                          placeholder="Ej: Gaseosa lima 500ml"
                          disabled={!selectedProduct}
                        />
                      </label>
                      <label className={`${styles.field} ${styles.fieldCompact}`}>
                        <span>Marca</span>
                        <input
                          className={styles.input}
                          value={existingBrand}
                          onChange={(event) => setExistingBrand(event.target.value)}
                          placeholder="Ej: Coca-Cola"
                          disabled={!selectedProduct}
                        />
                      </label>
                      <label className={`${styles.field} ${styles.fieldCompact}`}>
                        <span>Codigo de barra</span>
                        <input
                          className={styles.input}
                          value={existingBarcode}
                          onChange={(event) => setExistingBarcode(event.target.value)}
                          onKeyDown={preventEnterFromSubmittingBarcode}
                          autoComplete="off"
                          spellCheck={false}
                          placeholder="Ej: 7791234567890"
                          disabled={!selectedProduct}
                        />
                      </label>
                      <label className={`${styles.field} ${styles.fieldCompact}`}>
                        <span>Categoria</span>
                        <select
                          className={`${styles.input} ${styles.selectInput}`}
                          value={existingCategory}
                          onChange={(event) => setExistingCategory(event.target.value as ProductCategory)}
                          disabled={!selectedProduct}
                        >
                          {PRODUCT_CATEGORIES.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className={`${styles.field} ${styles.fieldCompact}`}>
                        <span>Stock actual</span>
                        <div className={styles.valueBox}>{Math.max(0, Math.trunc(Number(selectedProduct?.existencia || 0)))}</div>
                      </div>
                      {isAdmin ? (
                        <div className={`${styles.field} ${styles.fieldCompact}`}>
                          <span>Precio de venta actual</span>
                          <div className={styles.valueBox}>{selectedProduct ? formatMoneyARS(selectedProduct.price) : "-"}</div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>
              )}

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Precio</h2>
                <div className={styles.fieldMatrix}>
                  <label className={compactFieldClass}>
                    <span>Precio de compra</span>
                    <input
                      className={styles.input}
                      type="text"
                      inputMode="numeric"
                      value={costPrice}
                      onChange={(event) => setCostPrice(formatIntegerTextMask(event.target.value))}
                      placeholder="0"
                    />
                  </label>

                  {isAdmin ? (
                    <>
                      <label className={compactFieldClass}>
                        <span>% categoria</span>
                        <div className={styles.inputWithAction}>
                          <input
                            className={styles.input}
                            type="number"
                            min={0}
                            value={categoryMarginDraft}
                            onChange={(event) => setCategoryMarginDraft(event.target.value)}
                            placeholder="0"
                          />
                          <button type="button" className={styles.inlineBtn} onClick={() => void saveCategoryMargin()}>
                            Guardar
                          </button>
                        </div>
                      </label>

                      {mode === "existing" && selectedProduct ? (
                        <label className={compactFieldClass}>
                          <span>% producto</span>
                          <div className={styles.inputWithAction}>
                            <input
                              className={styles.input}
                              type="number"
                              min={0}
                              value={productMarginDraft}
                              onChange={(event) => setProductMarginDraft(event.target.value)}
                              placeholder="0"
                            />
                            <button type="button" className={styles.inlineBtn} onClick={() => void saveProductMarginOverride()}>
                              Guardar
                            </button>
                            {selectedProductHasMarginOverride ? (
                              <button type="button" className={styles.inlineBtn} onClick={() => void removeProductMarginOverride()}>
                                Quitar
                              </button>
                            ) : null}
                          </div>
                        </label>
                      ) : null}

                      {mode === "new" ? (
                        <label className={compactFieldClass}>
                          <span>% producto</span>
                          <div className={styles.inputWithAction}>
                            <label className={styles.toggleLabel}>
                              <input
                                type="checkbox"
                                checked={newProductUseMarginOverride}
                                onChange={(event) => setNewProductUseMarginOverride(event.target.checked)}
                              />
                              Margen propio
                            </label>
                            <input
                              className={styles.input}
                              type="number"
                              min={0}
                              value={newProductMarginDraft}
                              onChange={(event) => setNewProductMarginDraft(event.target.value)}
                              placeholder="0"
                              disabled={!newProductUseMarginOverride}
                            />
                          </div>
                        </label>
                      ) : null}

                      <label className={compactFieldClass}>
                        <span>Margen aplicado</span>
                        <div className={styles.valueBox}>
                          {activeMarginPercent}% ({marginSourceLabel})
                        </div>
                      </label>
                      <label className={compactFieldClass}>
                        <span>Precio de venta</span>
                        <div className={styles.valueBox}>{salePricePreview > 0 ? formatMoneyARS(salePricePreview) : "-"}</div>
                      </label>
                    </>
                  ) : null}
                </div>
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Ingreso de stock</h2>
                <div className={styles.fieldMatrix}>
                  <label className={compactFieldClass}>
                    <span>Codigo recepcion</span>
                    <select
                      className={`${styles.input} ${styles.selectInput}`}
                      value={supplyOrderId}
                      onChange={(event) => setSupplyOrderId(event.target.value)}
                    >
                      <option value="">Sin asociar</option>
                      {receivedOrders.map((order) => (
                        <option key={order.id} value={order.id}>
                          {order.id} - {order.supplierName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={compactFieldClass}>
                    <span>Vencimiento *</span>
                    <input
                      className={styles.input}
                      type="date"
                      value={expirationDate}
                      onChange={(event) => setExpirationDate(event.target.value)}
                      required
                    />
                  </label>
                  <label className={compactFieldClass}>
                    <span>Cantidad *</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                      placeholder="0"
                    />
                  </label>
                  <label className={compactFieldWideClass}>
                    <span>Descripcion</span>
                    <textarea
                      className={styles.textarea}
                      rows={2}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Notas del ingreso de mercaderia"
                    />
                  </label>
                </div>
              </section>

              {error ? <div className={styles.errorBox}>{error}</div> : null}
              {message ? <div className={styles.successBox}>{message}</div> : null}

              <div className={styles.formActions}>
                <button type="submit" className={styles.primaryBtn}>
                  Confirmar ingreso
                </button>
              </div>
            </form>
            </section>
          </div>

          <section className={styles.listCard}>
            <ProductTable
              products={filteredProducts}
              loading={loading}
              formatMoney={formatMoneyARS}
              formatDate={formatDateAR}
              selectedProductId={selectedProductId}
              onSelectProduct={(id) => {
                setMode("existing");
                setSelectedProductId(id);
                setMessage("");
                setError("");
              }}
              sortKey={sortKey}
              sortDir={sortDir}
              showSortFeedback={hasUserSorted}
              onSortChange={handleSortChange}
              onSortClear={handleClearSort}
              filters={{
                name: nameFilter,
                barcode: barcodeFilter,
                price: priceFilter,
                existencia: existenciaFilter,
                createdAt: createdAtFilter,
              }}
              onFilterChange={handleFilterChange}
              showExistence
              dateLabel="Fecha ingreso"
              topMargin={0}
              maxHeight="100%"
            />
          </section>
        </div>
      </div>
    </div>
  );
}


