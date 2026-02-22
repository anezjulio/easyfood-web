import { useCallback, useEffect, useMemo, useState } from "react";
import {
  calculateSalePrice,
  inferCostPriceFromSalePrice,
  resolveEffectiveMarginPercent,
  type PriceMarginSettings,
  type Product,
  type ProductCategory,
  type ProductSortKey,
} from "../model/product.types";
import { generateAutoBarcode } from "../model/product.barcode";
import {
  createProductApi,
  deleteProductApi,
  fetchPriceMarginSettingsApi,
  fetchProducts,
  removeProductPriceMarginApi,
  requestProductDeletionApi,
  updateCategoryPriceMarginApi,
  updateProductApi,
  upsertProductPriceMarginApi,
} from "../service/product.api";
import { useAuth } from "../../../app/provider/useAuth";
import { uploadImageFromFile } from "../../../shared/image/image.service";
import { formatDateAR, formatMoneyARS } from "../../../shared/format/locale";
import { matchesPriceFilter } from "../../../shared/product/product-filter";
import { normalizeForSearch } from "../../../shared/search/search";

export function useProductCrudViewModel() {
  const auth = useAuth();
  const isAdmin = auth.user?.role === "admin";

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [marginSettings, setMarginSettings] = useState<PriceMarginSettings | null>(null);

  const [nameFilter, setNameFilter] = useState("");
  const [barcodeFilter, setBarcodeFilter] = useState("");
  const [priceFilter, setPriceFilter] = useState("");
  const [createdAtFilter, setCreatedAtFilter] = useState("");
  const [sortKey, setSortKey] = useState<ProductSortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [hasUserSorted, setHasUserSorted] = useState(false);

  const [name, setName] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [autoGenerateBarcodeOnSubmit, setAutoGenerateBarcodeOnSubmit] = useState(false);
  const [category, setCategory] = useState<ProductCategory>("vivere");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [categoryMarginDraft, setCategoryMarginDraft] = useState("30");
  const [productMarginDraft, setProductMarginDraft] = useState("30");
  const [newProductUseMarginOverride, setNewProductUseMarginOverride] = useState(false);
  const [newProductMarginDraft, setNewProductMarginDraft] = useState("30");

  const reloadProducts = useCallback(async (nextSelectedId?: string | null) => {
    setLoading(true);
    const list = await fetchProducts();
    setProducts(list);
    setLoading(false);
    if (typeof nextSelectedId !== "undefined") {
      setSelectedProductId(nextSelectedId);
    }
  }, []);

  const reloadMarginSettings = useCallback(async () => {
    try {
      const next = await fetchPriceMarginSettingsApi();
      setMarginSettings(next);
    } catch {
      setMarginSettings(null);
    }
  }, []);

  useEffect(() => {
    void reloadProducts(null);
    void reloadMarginSettings();
  }, [reloadMarginSettings, reloadProducts]);

  const selectedProduct = useMemo(
    () => products.find((item) => item.id === selectedProductId) || null,
    [products, selectedProductId],
  );

  const filteredProducts = useMemo(() => {
    const q = normalizeForSearch(nameFilter);
    const p = (priceFilter || "").replace(/\D/g, "");
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

    if (createdAtFilter) {
      list = list.filter((item) => item.createdAt.slice(0, 10) === createdAtFilter);
    }

    const dir = sortDir === "asc" ? 1 : -1;

    return [...list].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      if (sortKey === "category") return (a.category || "").localeCompare(b.category || "") * dir;
      if (sortKey === "price") return (a.price - b.price) * dir;
      if (sortKey === "existencia") return (Number(a.existencia || 0) - Number(b.existencia || 0)) * dir;
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
    });
  }, [products, nameFilter, barcodeFilter, priceFilter, createdAtFilter, sortKey, sortDir]);

  const activeCategoryMarginPercent = useMemo(
    () => resolveEffectiveMarginPercent(marginSettings, selectedProduct?.category || category, undefined),
    [category, marginSettings, selectedProduct?.category],
  );

  const newProductMarginPercent = useMemo(() => {
    const parsed = Math.trunc(Number(newProductMarginDraft));
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return parsed;
  }, [newProductMarginDraft]);

  const effectiveMarginPercent = useMemo(() => {
    if (!selectedProduct && isAdmin && newProductUseMarginOverride) {
      return newProductMarginPercent;
    }
    return resolveEffectiveMarginPercent(marginSettings, selectedProduct?.category || category, selectedProduct?.id);
  }, [
    category,
    isAdmin,
    marginSettings,
    newProductMarginPercent,
    newProductUseMarginOverride,
    selectedProduct,
  ]);

  const salePricePreview = useMemo(() => {
    const parsedCost = Math.trunc(Number(costPrice));
    if (!Number.isFinite(parsedCost) || parsedCost <= 0) return 0;
    return calculateSalePrice(parsedCost, effectiveMarginPercent);
  }, [costPrice, effectiveMarginPercent]);

  const selectedProductHasMarginOverride = useMemo(() => {
    if (!selectedProduct) return false;
    return (marginSettings?.productMargins || []).some((item) => item.productId === selectedProduct.id);
  }, [marginSettings?.productMargins, selectedProduct]);

  useEffect(() => {
    const nextCategoryMargin = marginSettings?.categoryMargins?.[category] ?? 30;
    setCategoryMarginDraft(String(nextCategoryMargin));
  }, [category, marginSettings]);

  useEffect(() => {
    if (selectedProduct) return;
    if (newProductUseMarginOverride) return;
    setNewProductMarginDraft(String(activeCategoryMarginPercent));
  }, [activeCategoryMarginPercent, newProductUseMarginOverride, selectedProduct]);

  useEffect(() => {
    if (!selectedProduct) {
      setProductMarginDraft("30");
      return;
    }
    const override = marginSettings?.productMargins.find((item) => item.productId === selectedProduct.id);
    setProductMarginDraft(String(override?.marginPercent ?? effectiveMarginPercent));
  }, [effectiveMarginPercent, marginSettings?.productMargins, selectedProduct]);

  useEffect(() => {
    if (!selectedProduct) {
      setName("");
      setCostPrice("");
      setImageUrl("");
      setBarcode("");
      setCategory("vivere");
      return;
    }

    const fallbackCost = inferCostPriceFromSalePrice(selectedProduct.price, effectiveMarginPercent);
    const normalizedCost =
      Number.isFinite(Number(selectedProduct.costPrice)) && Number(selectedProduct.costPrice) > 0
        ? Math.trunc(Number(selectedProduct.costPrice))
        : fallbackCost;

    setName(selectedProduct.name);
    setCostPrice(String(Math.max(1, normalizedCost)));
    setImageUrl(selectedProduct.imageUrl || "");
    setBarcode(selectedProduct.barcode || "");
    setCategory(selectedProduct.category || "vivere");
  }, [effectiveMarginPercent, marginSettings, selectedProduct]);

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

  function selectProduct(id: string) {
    setError("");
    setMessage("");
    setSelectedProductId((current) => (current === id ? null : id));
  }

  function clearForm() {
    setSelectedProductId(null);
    setName("");
    setCostPrice("");
    setImageUrl("");
    setBarcode("");
    setAutoGenerateBarcodeOnSubmit(false);
    setCategory("vivere");
    setNewProductUseMarginOverride(false);
    setNewProductMarginDraft(String(marginSettings?.categoryMargins?.vivere ?? 30));
    setError("");
    setMessage("");
  }

  function toggleAutoGenerateBarcodeOnSubmit(checked: boolean) {
    setAutoGenerateBarcodeOnSubmit(checked);
    if (checked) {
      setBarcode(generateAutoBarcode());
    }
  }

  async function uploadImage(file: File) {
    setError("");
    setMessage("");
    setIsUploadingImage(true);
    try {
      const storedPath = await uploadImageFromFile(file);
      setImageUrl(storedPath);
      setMessage("Imagen cargada correctamente.");
    } catch {
      setError("No se pudo cargar la imagen.");
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function saveCategoryMargin() {
    setError("");
    setMessage("");

    const nextMargin = Math.max(0, Math.trunc(Number(categoryMarginDraft)));
    if (!Number.isFinite(nextMargin)) {
      setError("Ingresa un porcentaje de ganancia valido para la categoria.");
      return;
    }

    try {
      const updated = await updateCategoryPriceMarginApi(category, nextMargin);
      setMarginSettings(updated);
      setCategoryMarginDraft(String(updated.categoryMargins[category] ?? nextMargin));
      setMessage("Porcentaje de categoria actualizado.");
    } catch {
      setError("No se pudo actualizar el porcentaje de la categoria.");
    }
  }

  async function saveProductMarginOverride() {
    setError("");
    setMessage("");

    if (!selectedProduct) {
      setError("Selecciona un producto para guardar porcentaje especifico.");
      return;
    }

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

    if (!selectedProduct) {
      setError("Selecciona un producto para quitar el porcentaje especifico.");
      return;
    }

    try {
      const updated = await removeProductPriceMarginApi(selectedProduct.id);
      setMarginSettings(updated);
      const fallback = updated.categoryMargins[selectedProduct.category || "vivere"] ?? 30;
      setProductMarginDraft(String(fallback));
      setMessage("Porcentaje especifico de producto eliminado.");
    } catch {
      setError("No se pudo eliminar el porcentaje especifico del producto.");
    }
  }

  async function submitForm(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    const trimmedName = name.trim();
    const parsedCost = Math.trunc(Number(costPrice));
    if (!trimmedName) {
      setError("El nombre es obligatorio.");
      return;
    }

    if (!Number.isFinite(parsedCost) || parsedCost <= 0) {
      setError("Ingresa un precio de coste valido mayor a 0.");
      return;
    }

    const nextSalePrice = calculateSalePrice(parsedCost, effectiveMarginPercent);
    if (!Number.isFinite(nextSalePrice) || nextSalePrice <= 0) {
      setError("No se pudo calcular el precio de venta.");
      return;
    }
    const typedBarcode = barcode.trim();
    const barcodeForCreate = typedBarcode || (autoGenerateBarcodeOnSubmit ? generateAutoBarcode() : "");
    const nextBarcode = selectedProductId ? typedBarcode : barcodeForCreate;

    if (!selectedProductId && isAdmin && newProductUseMarginOverride) {
      const parsed = Math.trunc(Number(newProductMarginDraft));
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError("Ingresa un porcentaje de ganancia valido para el nuevo producto.");
        return;
      }
    }

    if (selectedProductId) {
      const updated = await updateProductApi(selectedProductId, {
        name: trimmedName,
        price: nextSalePrice,
        costPrice: parsedCost,
        imageUrl,
        barcode: nextBarcode,
        category,
      });

      if (!updated) {
        setError("No se pudo actualizar el producto.");
        return;
      }

      await reloadProducts(updated.id);
      setMessage("Producto actualizado correctamente.");
      return;
    }

    const created = await createProductApi({
      name: trimmedName,
      price: nextSalePrice,
      costPrice: parsedCost,
      marginPercent: effectiveMarginPercent,
      imageUrl,
      barcode: nextBarcode,
      category,
    });

    if (isAdmin && newProductUseMarginOverride) {
      const updatedMargins = await upsertProductPriceMarginApi(created.id, newProductMarginPercent);
      setMarginSettings(updatedMargins);
    }

    await reloadProducts(created.id);
    setMessage("Producto creado correctamente.");
  }

  async function deleteOrRequest() {
    setError("");
    setMessage("");

    if (!selectedProduct) {
      setError("Selecciona un producto para continuar.");
      return;
    }

    if (isAdmin) {
      const ok = await deleteProductApi(selectedProduct.id);
      if (!ok) {
        setError("No se pudo eliminar el producto.");
        return;
      }

      await reloadProducts(null);
      setMessage("Producto eliminado correctamente.");
      return;
    }

    await requestProductDeletionApi(selectedProduct, auth.user?.username || "operator");
    setMessage("Solicitud de eliminacion enviada al administrador.");
  }

  return {
    loading,
    products: filteredProducts,
    selectedProductId,
    selectProduct,
    sortKey,
    sortDir,
    hasUserSorted,
    handleSortChange,
    handleClearSort,
    filters: {
      name: nameFilter,
      barcode: barcodeFilter,
      price: priceFilter,
      createdAt: createdAtFilter,
    },
    handleFilterChange,
    name,
    setName,
    costPrice,
    setCostPrice,
    salePricePreview,
    effectiveMarginPercent,
    imageUrl,
    setImageUrl,
    uploadImage,
    isUploadingImage,
    barcode,
    setBarcode,
    autoGenerateBarcodeOnSubmit,
    setAutoGenerateBarcodeOnSubmit: toggleAutoGenerateBarcodeOnSubmit,
    category,
    setCategory,
    categoryMarginDraft,
    setCategoryMarginDraft,
    saveCategoryMargin,
    productMarginDraft,
    setProductMarginDraft,
    newProductUseMarginOverride,
    setNewProductUseMarginOverride,
    newProductMarginDraft,
    setNewProductMarginDraft,
    selectedProductHasMarginOverride,
    saveProductMarginOverride,
    removeProductMarginOverride,
    submitForm,
    deleteOrRequest,
    clearForm,
    error,
    message,
    isAdmin,
    isEditing: !!selectedProductId,
    selectedProduct,
    formatMoneyARS,
    formatDateAR,
  };
}

