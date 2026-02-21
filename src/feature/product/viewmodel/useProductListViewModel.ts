import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Product, ProductSortKey } from "../model/product.types";
import { fetchProducts } from "../service/product.api";

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

export function formatMoneyARS(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDateAR(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-AR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function useProductListViewModel() {
  const nav = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [nameFilter, setNameFilter] = useState("");
  const [barcodeFilter, setBarcodeFilter] = useState("");
  const [priceFilter, setPriceFilter] = useState("");
  const [createdAtFilter, setCreatedAtFilter] = useState("");
  const [sortKey, setSortKey] = useState<ProductSortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc"); // por defecto: mas nuevo -> mas viejo
  const [hasUserSorted, setHasUserSorted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const list = await fetchProducts();
      if (!alive) return;
      setProducts(list);
      setSelectedProductId(null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
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
      if (sortKey === "category") return (a.category || "").localeCompare(b.category || "") * dir;
      if (sortKey === "price") return (a.price - b.price) * dir;
      if (sortKey === "existencia") return (Number(a.existencia || 0) - Number(b.existencia || 0)) * dir;
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
    });
  }, [products, nameFilter, barcodeFilter, priceFilter, createdAtFilter, sortKey, sortDir]);

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
    if (key === "createdAt") setCreatedAtFilter(value);
  }

  function onAddProduct() {
    nav("/products/new");
  }

  function onEnterStock() {
    if (!selectedProductId) return;
    nav(`/stock?productId=${encodeURIComponent(selectedProductId)}`, { state: { from: "products" } });
  }

  function selectProduct(id: string) {
    setSelectedProductId((current) => (current === id ? null : id));
  }

  return {
    loading,
    products: filtered,
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
    onAddProduct,
    onEnterStock,
    selectProduct,
    formatMoneyARS,
    formatDateAR,
    selectedProductId,
  };
}
