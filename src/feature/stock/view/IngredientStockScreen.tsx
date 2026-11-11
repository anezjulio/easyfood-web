import ExpirationInput, { expirationDays } from "../../../shared/component/ExpirationInput";
import { useEffect, useState } from "react";
import StockNavigation from "../component/StockNavigation";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { normalizeForSearch } from "../../../shared/search/search";
import { formatIngredientQuantity, type Ingredient, type IngredientCategory } from "../../ingredient/model/ingredient.types";
import { fetchIngredientCategoriesApi } from "../../ingredient/service/ingredient.api";
import { readJsonOrThrow } from "../../../shared/http/http";
import { createIngredientStockEntriesApi, type IngredientStockEntry } from "../service/stock.api";
import styles from "../../ingredient/view/IngredientsScreen.module.css";
import stockStyles from "./IngredientStockScreen.module.css";

type Draft = { quantity: string; purchaseTotal: string; expirationDate: string };
type NewDraft = Draft & { id: string; name: string; stockMode: "unit" | "weight"; categoryId: string; portionName: string; portionSizeGrams: string };

export default function IngredientStockScreen() {
  const [newIngredients, setNewIngredients] = useState<NewDraft[]>([]);
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
    if (saving || (!pending.length && !newIngredients.length)) return;
    setError("");
    setMessage("");
    if (pending.some((item) => !getDraft(item).purchaseTotal.trim() || !Number.isFinite(Number(getDraft(item).purchaseTotal)) || Number(getDraft(item).purchaseTotal) < 0)) {
      setError("Ingresa el costo total de compra de cada ingrediente cargado. Usa 0 si no tuvo costo.");
      return;
    }
    if (newIngredients.some((item) => !item.name.trim() || !item.purchaseTotal.trim() || !Number.isFinite(Number(item.purchaseTotal)) || Number(item.purchaseTotal) < 0 || (item.stockMode === "weight" && (!item.portionName.trim() || !Number.isFinite(Number(item.portionSizeGrams)) || Number(item.portionSizeGrams) <= 0)))) {
      setError("Completa nombre, costo y, para ingredientes por peso, nombre y gramos de la porcion.");
      return;
    }
    const entries: IngredientStockEntry[] = [
      ...pending.map((item) => ({ ingredientId: item.id, ...getDraft(item), metric: item.stockMode === "weight" ? "kilos" as const : "unit" as const, quantity: Number(getDraft(item).quantity), purchaseTotal: Number(getDraft(item).purchaseTotal) })),
      ...newIngredients.map((item) => ({ newIngredient: { name: item.name.trim(), categoryId: item.categoryId || undefined, stockMode: item.stockMode, expiresInDays: Number(expirationDays(item.expirationDate)), portionName: item.stockMode === "weight" ? item.portionName.trim() : undefined, portionSizeGrams: item.stockMode === "weight" ? Number(item.portionSizeGrams) : undefined }, quantity: Number(item.quantity), purchaseTotal: Number(item.purchaseTotal), expirationDate: item.expirationDate, metric: item.stockMode === "weight" ? "kilos" as const : "unit" as const })),
    ];
    if (entries.some((entry) => !Number.isFinite(entry.quantity) || entry.quantity <= 0 || !entry.expirationDate || (entry.metric === "unit" && !Number.isInteger(entry.quantity)))) {
      setError("Completa una cantidad positiva y un vencimiento para cada ingrediente cargado. Unidades y paquetes requieren cantidades enteras.");
      return;
    }
    setSaving(true);
    try {
      setIngredients(await createIngredientStockEntriesApi(entries));
      setDrafts({});
      setNewIngredients([]);
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
        <section className={stockStyles.newList} aria-label="Nuevos ingredientes">
          {newIngredients.map((item, index) => {
            const update = (patch: Partial<NewDraft>) => setNewIngredients((current) => current.map((row) => row.id === item.id ? { ...row, ...patch } : row));
            return <fieldset key={item.id} className={stockStyles.newCard} disabled={saving}>
              <legend>Nuevo ingrediente {index + 1}</legend>
              <div className={stockStyles.newFields} role="group" aria-label="Ingrediente">
                <span className={stockStyles.groupTitle}>Ingrediente</span>
                <label className={styles.field}>Ingrediente<input aria-label="Nombre" className={styles.input} value={item.name} onChange={(event) => update({ name: event.target.value })} /></label>
                <label className={styles.field}>Tipo<select className={styles.input} value={item.stockMode} onChange={(event) => update({ stockMode: event.target.value as "unit" | "weight" })}><option value="unit">Unidad</option><option value="weight">Peso</option></select></label>

                <label className={styles.field}>Categoria<select className={styles.input} value={item.categoryId} onChange={(event) => update({ categoryId: event.target.value })}><option value="">Sin categoria</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              </div>
              {item.stockMode === "weight" && <div className={stockStyles.portionFields} role="group" aria-label="Porcion">
                <span className={stockStyles.groupTitle}>Porci?n</span>
                <label className={styles.field}>Nombre porcion<input className={styles.input} value={item.portionName} onChange={(event) => update({ portionName: event.target.value })} /></label>
                <label className={styles.field}>Gr<input aria-label="Gramos por porcion" className={styles.input} type="number" min="0.001" step="any" value={item.portionSizeGrams} onChange={(event) => update({ portionSizeGrams: event.target.value })} /></label>
              </div>}
              <div className={stockStyles.stockFields} role="group" aria-label="Stock">
                <span className={stockStyles.groupTitle}>Stock</span>
                <label className={styles.field}>Costo (ARS)<input aria-label="Costo de compra (total ARS)" className={styles.input} type="number" min="0" step="0.01" value={item.purchaseTotal} onChange={(event) => update({ purchaseTotal: event.target.value })} /></label>
                <label className={styles.field}>Vencimiento (fecha/dias)<ExpirationInput className={styles.input} value={item.expirationDate} onChange={(value) => update({ expirationDate: value })} /></label>
                <label className={styles.field}>Cantidad ({item.stockMode === "weight" ? "kg" : "u."})<input aria-label={`Cantidad recibida (${item.stockMode === "weight" ? "kg" : "unidades"})`} className={styles.input} type="number" min={item.stockMode === "weight" ? "0.001" : "1"} step={item.stockMode === "weight" ? "any" : "1"} value={item.quantity} onChange={(event) => update({ quantity: event.target.value })} /></label>

              </div>
              <button type="button" className={`${styles.secondaryBtn} ${stockStyles.removeBtn}`}  onClick={() => setNewIngredients((current) => current.filter((row) => row.id !== item.id))}>Quitar</button>
            </fieldset>;
          })}
          <div className={stockStyles.createRow}><span>Crear nuevo ingrediente</span><button type="button" className={styles.secondaryBtn} aria-label="Agregar nuevo ingrediente" disabled={saving || loading} onClick={() => setNewIngredients((current) => [...current, { id: crypto.randomUUID(), name: "", stockMode: "unit", categoryId: "", portionName: "", portionSizeGrams: "", quantity: "", purchaseTotal: "", expirationDate: "" }])}>+</button></div>
        </section>
        {error && <p className={styles.errorBox} role="alert">{error}</p>}
        {message && <p className={styles.successBox} role="status">{message}</p>}
        {loading ? <p role="status">Cargando ingredientes...</p> : (
          <form className={styles.form} onSubmit={save}>
            <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <div className={`${styles.filters} ${stockStyles.filters}`}>
                <label className={stockStyles.filterField}>Buscar:
                  <input aria-label="Buscar ingrediente" className={styles.searchInput} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre del ingrediente" />
                </label>
                <label className={stockStyles.filterField}>Categoria:
                  <select aria-label="Categoria de ingrediente" className={styles.filterSelect} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                    <option value="">Todas las categorias</option>
                    {categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name} ({category.count})</option>)}
                    {uncategorizedCount > 0 && <option value="uncategorized">Sin categoria ({uncategorizedCount})</option>}
                  </select>
                </label>
                <div className={stockStyles.typeFilters} role="group" aria-label="Tipo de stock">
                  <button type="button" className={styles.secondaryBtn} aria-pressed={stockModeFilter === "unit"} onClick={() => setStockModeFilter((current) => current === "unit" ? null : "unit")}>Por unidad</button>
                  <button type="button" className={styles.secondaryBtn} aria-pressed={stockModeFilter === "weight"} onClick={() => setStockModeFilter((current) => current === "weight" ? null : "weight")}>Por peso</button>
                </div>
                <button className={styles.primaryBtn} disabled={!pending.length && !newIngredients.length} type="submit">{saving ? "Guardando..." : `Guardar ingresos (${pending.length + newIngredients.length})`}</button>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Ingrediente</th><th>Costo de compra (total ARS)</th><th>Vencimiento (fecha/dias)</th><th>Cantidad recibida</th><th>Stock actual</th><th>Porciones</th></tr></thead>
                  <tbody>{visible.map((item) => {
                    const draft = getDraft(item);
                    return <tr key={item.id}>
                      <td>{item.name}</td>
                      <td><input className={styles.input} aria-label={`Costo de compra de ${item.name}`} type="number" min={0} step="0.01" placeholder="Total del ingreso" value={draft.purchaseTotal} onChange={(event) => change(item, { purchaseTotal: event.target.value })} /></td>
                      <td><ExpirationInput className={styles.input} aria-label={`Vencimiento de ${item.name}`}  value={draft.expirationDate} onChange={(value) => change(item, { expirationDate: value })} /></td>
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
