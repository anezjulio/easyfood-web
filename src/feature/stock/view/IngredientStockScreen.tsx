import { useEffect, useState } from "react";
import StockNavigation from "../component/StockNavigation";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { normalizeForSearch } from "../../../shared/search/search";
import { formatIngredientQuantity, type Ingredient, type IngredientCategory } from "../../ingredient/model/ingredient.types";
import { fetchIngredientCategoriesApi } from "../../ingredient/service/ingredient.api";
import { readJsonOrThrow } from "../../../shared/http/http";
import { createIngredientStockEntriesApi } from "../service/stock.api";
import styles from "../../ingredient/view/IngredientsScreen.module.css";
import stockStyles from "./IngredientStockScreen.module.css";

type Draft = { quantity: string; purchaseTotal: string; expirationDate: string };

export default function IngredientStockScreen() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [categories, setCategories] = useState<IngredientCategory[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [stockModeFilter, setStockModeFilter] = useState<"unit" | "weight" | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [items, categoryList] = await Promise.all([
        fetch("/ingredients").then((response) => readJsonOrThrow<Ingredient[]>(response)),
        fetchIngredientCategoriesApi(),
      ]);
      setIngredients(items);
      setCategories(categoryList);
    } catch {
      setError("No se pudo cargar la lista de ingredientes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function getDraft(item: Ingredient): Draft {
    return drafts[item.id] || { quantity: "", purchaseTotal: "", expirationDate: "" };
  }

  function change(item: Ingredient, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [item.id]: { ...getDraft(item), ...patch } }));
    setMessage("");
  }

  function getCategoryId(item: Ingredient) {
    return categories.some((category) => category.id === item.categoryId) ? item.categoryId : "uncategorized";
  }

  const categoryOptions = categories
    .map((category) => ({ ...category, count: ingredients.filter((item) => getCategoryId(item) === category.id).length }))
    .filter((category) => category.count > 0);
  const uncategorizedCount = ingredients.filter((item) => getCategoryId(item) === "uncategorized").length;
  const pending = ingredients.filter((item) => Boolean(drafts[item.id]?.quantity.trim()));
  const visible = ingredients.filter((item) =>
    (!stockModeFilter || (stockModeFilter === "weight" ? item.stockMode === "weight" : item.stockMode !== "weight")) &&
    (!categoryId || getCategoryId(item) === categoryId) && normalizeForSearch(item.name).includes(normalizeForSearch(search)),
  ).sort((a, b) => a.name.localeCompare(b.name));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !pending.length) return;
    setError("");
    setMessage("");
    if (pending.some((item) => !getDraft(item).purchaseTotal.trim() || !Number.isFinite(Number(getDraft(item).purchaseTotal)) || Number(getDraft(item).purchaseTotal) < 0)) {
      setError("Ingresa el costo total de compra de cada ingrediente cargado. Usa 0 si no tuvo costo.");
      return;
    }
    const entries = pending.map((item) => ({ ingredientId: item.id, ...getDraft(item), metric: item.stockMode === "weight" ? "kilos" as const : "unit" as const, quantity: Number(getDraft(item).quantity), purchaseTotal: Number(getDraft(item).purchaseTotal) }));
    if (entries.some((entry) => !Number.isFinite(entry.quantity) || entry.quantity <= 0 || !entry.expirationDate || (entry.metric === "unit" && !Number.isInteger(entry.quantity)))) {
      setError("Completa una cantidad positiva y un vencimiento para cada ingrediente cargado. Unidades y paquetes requieren cantidades enteras.");
      return;
    }
    setSaving(true);
    try {
      setIngredients(await createIngredientStockEntriesApi(entries));
      setDrafts({});
      setMessage(`Stock ingresado correctamente para ${entries.length} ingrediente(s).`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el stock.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Cargar stock de ingredientes" }]} asTitle />
            <p className={styles.subtitle}>Ingresa el costo total de compra, vencimiento y cantidad. Los kilos se convierten a gramos para las recetas.</p>
          </div>
          <SessionStatusBar />
        </header>
        <StockNavigation showSections />
        {error && <p className={styles.errorBox} role="alert">{error}</p>}
        {message && <p className={styles.successBox} role="status">{message}</p>}
        {loading ? <p role="status">Cargando ingredientes...</p> : (
          <form className={styles.form} onSubmit={save}>
            <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <div className={`${styles.filters} ${stockStyles.filters}`}>
                <label className={styles.field}>Buscar ingrediente
                  <input className={styles.searchInput} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre del ingrediente" />
                </label>
                <label className={styles.field}>Categoria de ingrediente
                  <select className={styles.filterSelect} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                    <option value="">Todas las categorias</option>
                    {categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name} ({category.count})</option>)}
                    {uncategorizedCount > 0 && <option value="uncategorized">Sin categoria ({uncategorizedCount})</option>}
                  </select>
                </label>
                <div className={stockStyles.typeFilters} role="group" aria-label="Tipo de stock">
                  <button type="button" className={styles.secondaryBtn} aria-pressed={stockModeFilter === "unit"} onClick={() => setStockModeFilter((current) => current === "unit" ? null : "unit")}>Por unidad</button>
                  <button type="button" className={styles.secondaryBtn} aria-pressed={stockModeFilter === "weight"} onClick={() => setStockModeFilter((current) => current === "weight" ? null : "weight")}>Por peso</button>
                </div>
                <button className={styles.primaryBtn} disabled={!pending.length} type="submit">{saving ? "Guardando..." : `Guardar ingresos (${pending.length})`}</button>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Ingrediente</th><th>Costo de compra (total ARS)</th><th>Vencimiento</th><th>Cantidad recibida</th><th>Stock actual</th><th>Porciones</th></tr></thead>
                  <tbody>{visible.map((item) => {
                    const draft = getDraft(item);
                    return <tr key={item.id}>
                      <td>{item.name}</td>
                      <td><input className={styles.input} aria-label={`Costo de compra de ${item.name}`} type="number" min={0} step="0.01" placeholder="Total del ingreso" value={draft.purchaseTotal} onChange={(event) => change(item, { purchaseTotal: event.target.value })} /></td>
                      <td><input className={styles.input} aria-label={`Vencimiento de ${item.name}`} type="date" value={draft.expirationDate} onChange={(event) => change(item, { expirationDate: event.target.value })} /></td>
                      <td><div className={stockStyles.quantityField}><input className={styles.input} aria-label={`Cantidad de ${item.name}`} type="number" min={item.stockMode === "weight" ? "0.001" : "1"} step={item.stockMode === "weight" ? "any" : "1"} value={draft.quantity} onChange={(event) => change(item, { quantity: event.target.value })} /><span>{item.stockMode === "weight" ? "kg" : item.stockMode === "package" ? "paq." : "u."}</span></div></td>
                      <td>{formatIngredientQuantity(item.stockQuantity, item.stockMode)}</td>
                      <td>{item.stockMode === "weight" ? Number(item.portionSizeGrams) > 0 ? Math.floor(Math.max(0, item.stockQuantity) / Number(item.portionSizeGrams)).toLocaleString("es-AR") : "Sin configurar" : "—"}</td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
              {!visible.length && <p className={styles.empty}>{ingredients.length ? "No hay ingredientes que coincidan con los filtros." : "Todavia no hay ingredientes. Crea los ingredientes para comenzar a cargar stock."}</p>}
              <p className={styles.empty}>Se guardan todas las filas con cantidad, incluso las ocultas por los filtros.</p>
            </fieldset>
          </form>
        )}
        {!loading && error && !ingredients.length && <button className={styles.secondaryBtn} onClick={() => void load()}>Reintentar</button>}
      </main>
    </div>
  );
}
