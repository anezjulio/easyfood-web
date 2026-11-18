import StockNavigation from "../../stock/component/StockNavigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import type { Ingredient, IngredientCategory } from "../../ingredient/model/ingredient.types";
import { formatIngredientQuantity, getIngredientQuantityUnitLabel, getIngredientStockModeLabel, getIngredientStockRatio, getIngredientStockTone } from "../../ingredient/model/ingredient.types";
import { fetchIngredientCategoriesApi, fetchIngredientsApi, updateIngredientApi } from "../../ingredient/service/ingredient.api";
import styles from "./InventoryScreen.module.css";
import toneStyles from "../../ingredient/view/IngredientStockTone.module.css";

const stockFilters = [
  { id: "unit", label: "Por unidad" },
  { id: "weight", label: "Por peso" },
  { id: "grams", label: "En gramos" },
] as const;
const stockPercent = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1 });

export default function InventoryScreen() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [categories, setCategories] = useState<IngredientCategory[]>([]);
  const [selectedIngredientId, setSelectedIngredientId] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState<(typeof stockFilters)[number]["id"] | null>(null);
  const [thresholdDrafts, setThresholdDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ingredientList, categoryList] = await Promise.all([fetchIngredientsApi(), fetchIngredientCategoriesApi()]);
      setIngredients(ingredientList);
      setCategories(categoryList);
      setThresholdDrafts(Object.fromEntries(ingredientList.map((item) => [item.id, String(item.minStockQuantity || "")])));
    } catch {
      setError("No se pudo cargar el inventario.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selectedIngredient = useMemo(
    () => ingredients.find((item) => item.id === selectedIngredientId) || null,
    [ingredients, selectedIngredientId],
  );

  const categoryNameById = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const categoryGroups = useMemo(() => {
    const groups = new Map<string, Ingredient[]>();
    const sortedIngredients = [...ingredients].sort((a, b) => a.name.localeCompare(b.name, "es-AR"));

    for (const ingredient of sortedIngredients) {
      const categoryId = ingredient.categoryId && categoryNameById[ingredient.categoryId] ? ingredient.categoryId : "";
      const group = groups.get(categoryId) || [];
      group.push(ingredient);
      groups.set(categoryId, group);
    }

    return [...groups].sort(([a], [b]) => {
      if (!a || !b) return Number(!a) - Number(!b);
      return categoryNameById[a].localeCompare(categoryNameById[b], "es-AR");
    });
  }, [categoryNameById, ingredients]);

  const query = search.trim().toLocaleLowerCase("es-AR");
  const stockGroups = categoryGroups
    .filter(([categoryId]) => categoryFilter === null || categoryId === categoryFilter)
    .map(([categoryId, items]) => ({
      categoryId,
      items: items.filter((item) => {
        if (!item.name.toLocaleLowerCase("es-AR").includes(query)) return false;
        if (stockFilter === "grams") return item.stockMode === "weight" && item.stockQuantity < 1000;
        return stockFilter === null || item.stockMode === stockFilter;
      }),
    }))
    .filter(({ items }) => items.length > 0);

  async function saveThreshold(ingredient: Ingredient) {
    setError("");
    setMessage("");
    const minStockQuantity = Math.max(0, Math.trunc(Number(thresholdDrafts[ingredient.id]) || 0)) || undefined;
    setSaving(true);
    try {
      const saved = await updateIngredientApi(ingredient.id, {
        name: ingredient.name,
        productId: ingredient.productId,
        metric: ingredient.metric,
        categoryId: ingredient.categoryId,
        expiresInDays: ingredient.expiresInDays,
        stockMode: ingredient.stockMode,
        stockQuantity: ingredient.stockQuantity,
        entryQuantity: 0,
        minStockQuantity,
        portionSizeGrams: ingredient.portionSizeGrams,
      });
      if (!saved) throw new Error("Ingrediente no encontrado.");
      setIngredients((current) => current.map((item) => item.id === saved.id ? saved : item));
      setThresholdDrafts((current) => ({ ...current, [saved.id]: String(saved.minStockQuantity || "") }));
      setMessage(`Rango minimo actualizado para ${saved.name}.`);
    } catch {
      setError("No se pudo guardar el rango minimo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Productos", to: "/products/new" }, { label: "Inventario" }]} asTitle />
            <p className={styles.subtitle}>Control de stock de ingredientes e insumos.</p>
          </div>
          <SessionStatusBar />
        </header>
        <StockNavigation />

        <div className={styles.tabs} role="tablist" aria-label="Inventario">
          <button id="current-stock-tab" type="button" role="tab" aria-selected="true" aria-controls="current-stock" className={`${styles.tabBtn} ${styles.tabBtnActive}`}>
            Stock actual
          </button>
        </div>

        <section id="current-stock" role="tabpanel" aria-labelledby="current-stock-tab" className={styles.stockPanel}>
          <div className={styles.stockTools}>
            <label className={styles.filterField}>Buscar
              <input className={styles.input} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre del ingrediente" />
            </label>
            <label className={styles.filterField}>Categoría
              <select className={styles.input} value={categoryFilter === null ? "all" : `category:${categoryFilter}`} onChange={(event) => setCategoryFilter(event.target.value === "all" ? null : event.target.value.slice("category:".length))}>
                <option value="all">Todas las categorías</option>
                {categoryGroups.map(([categoryId, items]) => (
                  <option key={categoryId} value={`category:${categoryId}`}>{categoryNameById[categoryId] || "Sin categoria"} ({items.length})</option>
                ))}
              </select>
            </label>
            <div className={styles.typeFilters} role="group" aria-label="Tipo de stock">
              {stockFilters.map(({ id, label }) => (
                <button key={id} type="button" className={styles.inlineBtn} aria-pressed={stockFilter === id} onClick={() => setStockFilter(stockFilter === id ? null : id)}>{label}</button>
              ))}
            </div>
          </div>
          {selectedIngredient ? (
            <form className={styles.thresholdForm} onSubmit={(event) => {
              event.preventDefault();
              void saveThreshold(selectedIngredient);
            }}>
              <label className={styles.thresholdLabel}>
                <span>Cantidad para avisar de {selectedIngredient.name} ({getIngredientQuantityUnitLabel(selectedIngredient.stockMode)})</span>
                <input className={styles.thresholdInput} type="number" min={0} value={thresholdDrafts[selectedIngredient.id] || ""} onChange={(event) => setThresholdDrafts((current) => ({ ...current, [selectedIngredient.id]: event.target.value }))} />
              </label>
              <button type="submit" className={styles.inlineBtn} disabled={saving}>Guardar</button>
            </form>
          ) : null}
          {error ? <div role="alert" className={styles.errorBox}>{error}</div> : null}
          {message ? <div role="status" className={styles.successBox}>{message}</div> : null}
          {loading ? <p className={styles.empty}>Cargando inventario...</p> : null}
          {!loading && !error && stockGroups.length === 0 ? <p className={styles.empty}>No hay ingredientes que coincidan.</p> : null}
          {stockGroups.map(({ categoryId, items }) => (
            <section key={categoryId} className={styles.stockGroup} aria-label={categoryNameById[categoryId] || "Sin categoria"}>
              <h2>{categoryNameById[categoryId] || "Sin categoria"}</h2>
              <div className={styles.stockGrid}>
                {items.map((item) => {
                  const ratio = item.stockQuantity <= 0 ? 0 : getIngredientStockRatio(item);
                  return (
                    <button key={item.id} type="button" aria-pressed={selectedIngredientId === item.id} className={`${styles.inventoryItem} ${toneStyles.stockTone}`} data-stock-tone={getIngredientStockTone(item, ratio)} onClick={() => {
                      setSelectedIngredientId(item.id);
                      setMessage("");
                    }}>
                      <strong>{item.name} <span className={styles.stockPercent}>{ratio === null ? "—" : `(${stockPercent.format(ratio).replace(/\s/g, "")})`}</span></strong>
                      <strong>{formatIngredientQuantity(item.stockQuantity, item.stockMode)}</strong>
                      <small>{getIngredientStockModeLabel(item.stockMode)}</small>
                      <small>{item.minStockQuantity ? `Avisar: ${formatIngredientQuantity(item.minStockQuantity, item.stockMode)}` : "Sin aviso"}</small>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </section>
      </div>
    </div>
  );
}
