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
import type { Ingredient, IngredientCategory } from "../../ingredient/model/ingredient.types";
import { formatIngredientQuantity, getIngredientStockModeLabel } from "../../ingredient/model/ingredient.types";
import {
  createIngredientCategoryApi,
  deleteIngredientCategoryApi,
  fetchIngredientCategoriesApi,
  fetchIngredientsApi,
  updateIngredientApi,
  updateIngredientCategoryApi,
} from "../../ingredient/service/ingredient.api";
import styles from "./StockEntryScreen.module.css";

type EntryMode = "existing" | "new";
type StockTab = "products" | "raw" | "rawCategories";

export default function StockEntryScreen() {
  const auth = useAuth();
  const isAdmin = auth.user?.role === "admin";
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const initialProductId = searchParams.get("productId");
  const cameFromProducts = (location.state as { from?: string } | null)?.from === "products";
  const merchandiseFormId = "stock-entry-form";

  const [mode, setMode] = useState<EntryMode>("existing");
  const [activeTab, setActiveTab] = useState<StockTab>("raw");
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ingredientCategories, setIngredientCategories] = useState<IngredientCategory[]>([]);
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
  const [stockMetric, setStockMetric] = useState<"unit" | "grams" | "kilos">("unit");
  const [expirationDate, setExpirationDate] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIngredientId, setSelectedIngredientId] = useState("");
  const [ingredientCategoryId, setIngredientCategoryId] = useState("varios");
  const [ingredientQuantity, setIngredientQuantity] = useState("");
  const [ingredientMetric, setIngredientMetric] = useState<"unit" | "grams" | "kilos">("unit");
  const [ingredientExpirationDate, setIngredientExpirationDate] = useState("");
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [selectedIngredientCategoryId, setSelectedIngredientCategoryId] = useState("");
  const [ingredientCategoryName, setIngredientCategoryName] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const reloadData = useCallback(async (nextSelectedId?: string | null) => {
    setLoading(true);
    setError("");
    try {
      const [productList, marginList, supplyOrders, ingredientList, ingredientCategoryList] = await Promise.all([
        fetchProducts(),
        fetchPriceMarginSettingsApi(),
        fetchSupplyOrdersApi(),
        fetchIngredientsApi(),
        fetchIngredientCategoriesApi(),
      ]);
      const received = supplyOrders
        .filter((item) => item.status === "received")
        .sort((a, b) => new Date(b.receivedAt || b.createdAt).getTime() - new Date(a.receivedAt || a.createdAt).getTime());

      setProducts(productList);
      setIngredients(ingredientList);
      setIngredientCategories(ingredientCategoryList);
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
  const selectedIngredient = useMemo(
    () => ingredients.find((item) => item.id === selectedIngredientId) || null,
    [ingredients, selectedIngredientId],
  );
  const filteredIngredients = useMemo(() => {
    const query = normalizeForSearch(ingredientSearch);
    return ingredients
      .filter((item) => (query ? normalizeForSearch(`${item.name} ${item.categoryId || ""}`).includes(query) : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [ingredientSearch, ingredients]);
  const groupedIngredientCategories = useMemo(
    () =>
      ingredientCategories.map((category) => ({
        category,
        items: ingredients.filter((ingredient) => ingredient.categoryId === category.id).sort((a, b) => a.name.localeCompare(b.name)),
      })),
    [ingredientCategories, ingredients],
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

  useEffect(() => {
    if (!selectedIngredient) return;
    setIngredientCategoryId(selectedIngredient.categoryId || ingredientCategories[0]?.id || "varios");
    setIngredientMetric(selectedIngredient.stockMode === "weight" ? "grams" : "unit");
  }, [ingredientCategories, selectedIngredient]);

  useEffect(() => {
    setStockMetric(selectedProduct?.stockMode === "weight" ? "grams" : "unit");
  }, [selectedProduct]);

  const costPriceValue = parsePositiveIntFromTextMask(costPrice);
  const salePricePreview = calculateSalePrice(costPriceValue, activeMarginPercent);

  const filteredProducts = useMemo(() => {
    const q = normalizeForSearch(nameFilter);
    const p = (priceFilter || "").replace(/\D/g, "");
    const e = (existenciaFilter || "").replace(/\D/g, "");
    let list = products.filter((item) => item.type !== "receta" && item.type !== "combo" && item.type !== "ingrediente");

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
    setStockMetric("unit");
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
      categoryIds: selectedProduct.categoryIds?.length ? selectedProduct.categoryIds : [existingCategory],
      type: selectedProduct.type || "bebida",
      stockMode: stockMetric === "unit" ? "unit" : "weight",
      stockType: selectedProduct.type || selectedProduct.stockType || "bebida",
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

    const quantityToAdd = stockMetric === "unit" ? Math.trunc(Number(quantity)) : Number(quantity);
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
          categoryIds: [newCategory],
          type: "bebida",
          stockMode: stockMetric === "unit" ? "unit" : "weight",
          stockType: "bebida",
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
        metric: stockMetric,
        movementType: "in",
        description: description.trim() || undefined,
        supplyOrderId: supplyOrderId || undefined,
        costPrice: costPriceValue,
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

  async function submitIngredientStock(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!selectedIngredient) {
      setError("Selecciona una materia prima.");
      return;
    }
    const parsed = Number(ingredientQuantity);
    const quantityToAdd = ingredientMetric === "unit" ? Math.trunc(parsed) : parsed;
    const ingredientStockDelta = ingredientMetric === "kilos" ? Math.trunc(parsed * 1000) : ingredientMetric === "grams" ? Math.trunc(parsed) : Math.trunc(parsed);
    if (!Number.isFinite(quantityToAdd) || quantityToAdd <= 0) {
      setError("Ingresa una cantidad valida.");
      return;
    }
    if (!ingredientExpirationDate) {
      setError("La fecha de vencimiento es obligatoria para ingresar materia prima.");
      return;
    }

    try {
      const expirationMs = new Date(`${ingredientExpirationDate}T00:00:00`).getTime();
      const todayMs = new Date(new Date().toISOString().slice(0, 10)).getTime();
      const expiresInDays = Number.isFinite(expirationMs) ? Math.max(0, Math.ceil((expirationMs - todayMs) / 86_400_000)) : selectedIngredient.expiresInDays;
      await createStockEntryApi({
        productId: selectedIngredient.productId || selectedIngredient.id,
        expirationDate: ingredientExpirationDate,
        quantity: quantityToAdd,
        metric: ingredientMetric,
        movementType: "in",
        description: `Ingreso de materia prima: ${selectedIngredient.name}`,
      });
      const saved = await updateIngredientApi(selectedIngredient.id, {
        name: selectedIngredient.name,
        categoryId: ingredientCategoryId || selectedIngredient.categoryId,
        expiresInDays,
        stockMode: selectedIngredient.stockMode,
        stockQuantity: selectedIngredient.stockQuantity,
        entryQuantity: ingredientStockDelta,
        portionSizeGrams: selectedIngredient.portionSizeGrams,
      });
      if (!saved) {
        setError("No se pudo actualizar la materia prima.");
        return;
      }
      await reloadData(undefined);
      setSelectedIngredientId(saved.id);
      setIngredientQuantity("");
      setIngredientExpirationDate("");
      setMessage(`Materia prima ingresada: ${saved.name}.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo registrar la materia prima.");
    }
  }

  function selectIngredientCategory(category: IngredientCategory) {
    setSelectedIngredientCategoryId(category.id);
    setIngredientCategoryName(category.name);
    setError("");
    setMessage("");
  }

  async function submitIngredientCategory(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    const name = ingredientCategoryName.trim();
    if (!name) {
      setError("Ingresa el nombre de la categoria.");
      return;
    }
    try {
      const saved = selectedIngredientCategoryId
        ? await updateIngredientCategoryApi(selectedIngredientCategoryId, { name })
        : await createIngredientCategoryApi({ name });
      if (!saved) {
        setError("No se pudo guardar la categoria.");
        return;
      }
      await reloadData(undefined);
      setSelectedIngredientCategoryId(saved.id);
      setIngredientCategoryName(saved.name);
      setMessage("Categoria de materia prima guardada.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo guardar la categoria.");
    }
  }

  async function removeSelectedIngredientCategory() {
    if (!selectedIngredientCategoryId) return;
    setError("");
    setMessage("");
    try {
      const removed = await deleteIngredientCategoryApi(selectedIngredientCategoryId);
      if (!removed) {
        setError("No se pudo eliminar la categoria.");
        return;
      }
      await reloadData(undefined);
      setSelectedIngredientCategoryId("");
      setIngredientCategoryName("");
      setMessage("Categoria de materia prima eliminada.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo eliminar la categoria.");
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

        <div className={styles.tabs} role="tablist" aria-label="Carga de mercancia">
          <button type="button" role="tab" aria-selected={activeTab === "raw"} className={`${styles.tabBtn} ${activeTab === "raw" ? styles.tabBtnActive : ""}`.trim()} onClick={() => setActiveTab("raw")}>
            Materia prima
          </button>
          <button type="button" role="tab" aria-selected={activeTab === "rawCategories"} className={`${styles.tabBtn} ${activeTab === "rawCategories" ? styles.tabBtnActive : ""}`.trim()} onClick={() => setActiveTab("rawCategories")}>
            Categorias materia prima
          </button>
          <button type="button" role="tab" aria-selected={activeTab === "products"} className={`${styles.tabBtn} ${activeTab === "products" ? styles.tabBtnActive : ""}`.trim()} onClick={() => setActiveTab("products")}>
            Productos kiosko
          </button>
        </div>

        {activeTab === "raw" ? (
          <div className={styles.layout}>
            <section className={styles.formCard}>
              <form className={styles.form} onSubmit={submitIngredientStock}>
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Ingreso de materia prima</h2>
                  <div className={styles.fieldMatrix}>
                    <label className={compactFieldClass}>
                      <span>Materia prima</span>
                      <select className={`${styles.input} ${styles.selectInput}`} value={selectedIngredientId} onChange={(event) => setSelectedIngredientId(event.target.value)}>
                        <option value="">Seleccionar</option>
                        {ingredients.map((ingredient) => (
                          <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className={compactFieldClass}>
                      <span>Categoria</span>
                      <select className={`${styles.input} ${styles.selectInput}`} value={ingredientCategoryId} onChange={(event) => setIngredientCategoryId(event.target.value)} disabled={!selectedIngredient}>
                        {ingredientCategories.map((category) => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                      </select>
                    </label>
                    <div className={compactFieldClass}>
                      <span>Stock actual</span>
                      <div className={styles.valueBox}>{selectedIngredient ? formatIngredientQuantity(selectedIngredient.stockQuantity, selectedIngredient.stockMode) : "-"}</div>
                    </div>
                    <div className={compactFieldClass}>
                      <span>Modo</span>
                      <div className={styles.valueBox}>{selectedIngredient ? getIngredientStockModeLabel(selectedIngredient.stockMode) : "-"}</div>
                    </div>
                    <label className={compactFieldClass}>
                      <span>Cantidad</span>
                      <input className={styles.input} type="number" min="0" step={ingredientMetric === "unit" ? "1" : "0.01"} value={ingredientQuantity} onChange={(event) => setIngredientQuantity(event.target.value)} placeholder={ingredientMetric === "kilos" ? "Ej: 2.5" : "0"} />
                    </label>
                    <label className={compactFieldClass}>
                      <span>Metrica</span>
                      <select className={`${styles.input} ${styles.selectInput}`} value={ingredientMetric} onChange={(event) => setIngredientMetric(event.target.value as "unit" | "grams" | "kilos")} disabled={!selectedIngredient}>
                        {selectedIngredient?.stockMode === "weight" ? (
                          <>
                            <option value="grams">Gramos</option>
                            <option value="kilos">Kilos</option>
                          </>
                        ) : (
                          <option value="unit">Unidad</option>
                        )}
                      </select>
                    </label>
                    <label className={compactFieldClass}>
                      <span>Vencimiento *</span>
                      <input className={styles.input} type="date" value={ingredientExpirationDate} onChange={(event) => setIngredientExpirationDate(event.target.value)} required />
                    </label>
                  </div>
                </section>
                {error ? <div className={styles.errorBox}>{error}</div> : null}
                {message ? <div className={styles.successBox}>{message}</div> : null}
                <div className={styles.formActions}>
                  <button type="submit" className={styles.primaryBtn}>Confirmar ingreso</button>
                </div>
              </form>
            </section>

            <section className={styles.formCard}>
              <div className={styles.form}>
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Materia prima cargada</h2>
                  <input className={styles.input} value={ingredientSearch} onChange={(event) => setIngredientSearch(event.target.value)} placeholder="Buscar materia prima" />
                  <div className={styles.rawList}>
                    {filteredIngredients.map((ingredient) => (
                      <button type="button" key={ingredient.id} className={`${styles.rawItem} ${selectedIngredientId === ingredient.id ? styles.rawItemActive : ""}`} onClick={() => setSelectedIngredientId(ingredient.id)}>
                        <strong>{ingredient.name}</strong>
                        <span>{ingredientCategories.find((category) => category.id === ingredient.categoryId)?.name || "Sin categoria"}</span>
                        <small>{formatIngredientQuantity(ingredient.stockQuantity, ingredient.stockMode)}</small>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            </section>
          </div>
        ) : activeTab === "rawCategories" ? (
          <div className={styles.layout}>
            <section className={styles.formCard}>
              <form className={styles.form} onSubmit={submitIngredientCategory}>
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>{selectedIngredientCategoryId ? "Editar categoria" : "Crear categoria"}</h2>
                  <label className={compactFieldClass}>
                    <span>Nombre</span>
                    <input className={styles.input} value={ingredientCategoryName} onChange={(event) => setIngredientCategoryName(event.target.value)} placeholder="Ej: Vegetales, Carnes, Empaques" />
                  </label>
                </section>
                {error ? <div className={styles.errorBox}>{error}</div> : null}
                {message ? <div className={styles.successBox}>{message}</div> : null}
                <div className={styles.formActions}>
                  <button type="button" className={styles.secondaryBtn} onClick={() => { setSelectedIngredientCategoryId(""); setIngredientCategoryName(""); }}>Nueva</button>
                  <button type="button" className={styles.secondaryBtn} onClick={() => void removeSelectedIngredientCategory()} disabled={!selectedIngredientCategoryId}>Eliminar</button>
                  <button type="submit" className={styles.primaryBtn}>Guardar categoria</button>
                </div>
              </form>
            </section>
            <section className={styles.formCard}>
              <div className={styles.form}>
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Categorias y materia prima asociada</h2>
                  <div className={styles.rawList}>
                    {groupedIngredientCategories.map((group) => (
                      <button type="button" key={group.category.id} className={`${styles.rawItem} ${selectedIngredientCategoryId === group.category.id ? styles.rawItemActive : ""}`} onClick={() => selectIngredientCategory(group.category)}>
                        <strong>{group.category.name}</strong>
                        <span>{group.items.length} productos asociados</span>
                        <small>{group.items.map((item) => item.name).join(", ") || "Sin productos"}</small>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            </section>
          </div>
        ) : (
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
                      min={stockMetric === "unit" ? 1 : 0}
                      step={stockMetric === "unit" ? 1 : 0.01}
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                      placeholder="0"
                    />
                  </label>
                  <label className={compactFieldClass}>
                    <span>Metrica</span>
                    <select className={`${styles.input} ${styles.selectInput}`} value={stockMetric} onChange={(event) => setStockMetric(event.target.value as "unit" | "grams" | "kilos")}>
                      <option value="unit">Unidad</option>
                      <option value="grams">Gramos</option>
                      <option value="kilos">Kilos</option>
                    </select>
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
        )}
      </div>
    </div>
  );
}


