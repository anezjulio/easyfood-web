import { useEffect, useMemo, useState } from "react";
import ProductTable from "../../product/component/ProductTable";
import type { Product, ProductSortKey } from "../../product/model/product.types";
import { fetchProducts } from "../../product/service/product.api";
import type { OperationRequestItem } from "../model/request.types";
import { formatDateAR, formatMoneyARS } from "../../../shared/format/locale";
import { matchesNumericContainsFilter, matchesPriceFilter } from "../../../shared/product/product-filter";
import { normalizeForSearch } from "../../../shared/search/search";
import RequestItemsTable from "./RequestItemsTable";
import styles from "./MerchandiseRequestEditor.module.css";

type ColumnFilters = {
  name: string;
  barcode: string;
  category: string;
  price: string;
  existencia: string;
  createdAt: string;
};

function addProductToItems(current: OperationRequestItem[], product: Product) {
  const existing = current.find((item) => item.productId === product.id);
  if (existing) {
    return current.map((item) => (item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item));
  }

  return [
    ...current,
    {
      productId: product.id,
      productName: product.name,
      quantity: 1,
      barcode: product.barcode,
      category: product.category,
    },
  ];
}

export default function MerchandiseRequestEditor({
  items,
  onChange,
  disabled = false,
  title = "Mercancia solicitada",
  layoutMode = "stacked",
  renderMode = "full",
}: {
  items: OperationRequestItem[];
  onChange: (nextItems: OperationRequestItem[]) => void;
  disabled?: boolean;
  title?: string;
  layoutMode?: "stacked" | "split";
  renderMode?: "full" | "catalog";
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedCatalogProductId, setSelectedCatalogProductId] = useState<string | null>(null);

  const [filters, setFilters] = useState<ColumnFilters>({
    name: "",
    barcode: "",
    category: "",
    price: "",
    existencia: "",
    createdAt: "",
  });
  const [sortKey, setSortKey] = useState<ProductSortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [hasUserSorted, setHasUserSorted] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const list = await fetchProducts();
        if (!alive) return;
        setProducts(list);
      } catch {
        if (!alive) return;
        setLoadError("No se pudo cargar el catalogo de productos.");
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const visibleProducts = useMemo(() => {
    const nameQuery = normalizeForSearch(filters.name);
    const barcodeQuery = filters.barcode.trim();
    const priceDigits = filters.price.replace(/\D/g, "");
    const existenceDigits = filters.existencia.replace(/\D/g, "");
    const categoryFilter = filters.category.trim().toLowerCase();
    const dir = sortDir === "asc" ? 1 : -1;

    return [...products]
      .filter((item) => {
        if (nameQuery && !normalizeForSearch(item.name).includes(nameQuery)) return false;
        if (barcodeQuery && !(item.barcode || "").includes(barcodeQuery)) return false;
        if (categoryFilter && String(item.category || "").trim().toLowerCase() !== categoryFilter) return false;
        if (priceDigits && !matchesPriceFilter(item.price, priceDigits)) return false;
        if (existenceDigits && !matchesNumericContainsFilter(Number(item.existencia || 0), existenceDigits)) return false;
        if (filters.createdAt && (item.ultimoIngreso || item.createdAt).slice(0, 10) !== filters.createdAt) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
        if (sortKey === "category") return (a.category || "").localeCompare(b.category || "") * dir;
        if (sortKey === "price") return (a.price - b.price) * dir;
        if (sortKey === "existencia") return (Number(a.existencia || 0) - Number(b.existencia || 0)) * dir;
        return (new Date(a.ultimoIngreso || a.createdAt).getTime() - new Date(b.ultimoIngreso || b.createdAt).getTime()) * dir;
      });
  }, [filters, products, sortDir, sortKey]);

  useEffect(() => {
    if (!visibleProducts.length) {
      setSelectedCatalogProductId(null);
      return;
    }

    const exists = visibleProducts.some((item) => item.id === selectedCatalogProductId);
    if (!exists) {
      setSelectedCatalogProductId(visibleProducts[0].id);
    }
  }, [selectedCatalogProductId, visibleProducts]);

  const productsById = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);

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
    setSortKey("name");
    setSortDir("asc");
    setHasUserSorted(false);
  }

  function handleFilterChange(key: keyof ColumnFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function addProduct(productId: string) {
    const product = productsById.get(productId);
    if (!product || disabled) return;
    setSelectedCatalogProductId(productId);
    onChange(addProductToItems(items, product));
  }

  function increaseItem(productId: string) {
    const existingProduct = productsById.get(productId);
    if (existingProduct) {
      onChange(addProductToItems(items, existingProduct));
      return;
    }
    onChange(items.map((item) => (item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item)));
  }

  function decreaseItem(productId: string) {
    const nextItems: OperationRequestItem[] = [];
    for (const item of items) {
      if (item.productId !== productId) {
        nextItems.push(item);
      } else if (item.quantity > 1) {
        nextItems.push({ ...item, quantity: item.quantity - 1 });
      }
    }
    onChange(nextItems);
  }

  function changeItemQuantity(productId: string, value: string) {
    const parsed = Math.trunc(Number(value));
    if (!value.trim()) {
      onChange(items.filter((item) => item.productId !== productId));
      return;
    }
    if (!Number.isFinite(parsed)) return;
    if (parsed <= 0) {
      onChange(items.filter((item) => item.productId !== productId));
      return;
    }
    onChange(items.map((item) => (item.productId === productId ? { ...item, quantity: parsed } : item)));
  }

  function removeItem(productId: string) {
    onChange(items.filter((item) => item.productId !== productId));
  }

  const catalogCard = (
    <section className={styles.catalogCard}>
      <div className={styles.head}>
        <div>
          <h3 className={styles.title}>Catalogo de productos</h3>
          <p className={styles.meta}>
            Click sobre una fila para agregar una unidad a la solicitud.
          </p>
        </div>
        <span className={styles.helperText}>{visibleProducts.length} visibles</span>
      </div>

      <ProductTable
        products={visibleProducts}
        loading={loading}
        formatMoney={formatMoneyARS}
        formatDate={formatDateAR}
        selectedProductId={selectedCatalogProductId}
        onSelectProduct={addProduct}
        sortKey={sortKey}
        sortDir={sortDir}
        showSortFeedback={hasUserSorted}
        onSortChange={handleSortChange}
        onSortClear={handleClearSort}
        filters={filters}
        onFilterChange={handleFilterChange}
        showExistence
        showCategory
        showDateColumn={false}
        topMargin={0}
        maxHeight={layoutMode === "split" ? "min(62vh, 780px)" : "min(58vh, 720px)"}
      />

      {loadError ? <div className={styles.errorBox}>{loadError}</div> : null}
    </section>
  );

  if (renderMode === "catalog") {
    return catalogCard;
  }

  return (
    <div className={`${styles.layout} ${layoutMode === "split" ? styles.layoutSplit : ""}`.trim()}>
      {catalogCard}

      <RequestItemsTable
        items={items}
        editable={!disabled}
        title={title}
        helperText="Ajusta cantidades, resta o elimina productos antes de guardar."
        emptyMessage="Todavia no agregaste productos a la solicitud."
        onIncrease={disabled ? undefined : increaseItem}
        onDecrease={disabled ? undefined : decreaseItem}
        onQuantityChange={disabled ? undefined : changeItemQuantity}
        onRemove={disabled ? undefined : removeItem}
      />
    </div>
  );
}
