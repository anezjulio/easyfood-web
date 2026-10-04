import { useCallback, useEffect, useMemo, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import type { Ingredient, IngredientCategory } from "../../ingredient/model/ingredient.types";
import { formatIngredientQuantity, getIngredientStockModeLabel } from "../../ingredient/model/ingredient.types";
import { fetchIngredientCategoriesApi, fetchIngredientsApi, updateIngredientApi } from "../../ingredient/service/ingredient.api";
import { createStockEntryApi } from "../../stock/service/stock.api";
import styles from "./InventoryScreen.module.css";

type InventoryTab = "entry" | "current";
type EntryMode = "kilos" | "units" | "packages";

export default function InventoryScreen() {
  const [activeTab, setActiveTab] = useState<InventoryTab>("entry");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [categories, setCategories] = useState<IngredientCategory[]>([]);
  const [selectedIngredientId, setSelectedIngredientId] = useState("");
  const [entryMode, setEntryMode] = useState<EntryMode>("kilos");
  const [quantity, setQuantity] = useState("");
  const [unitsPerPackage, setUnitsPerPackage] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [search, setSearch] = useState("");
  const [thresholdDrafts, setThresholdDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ingredientList, categoryList] = await Promise.all([fetchIngredientsApi(), fetchIngredientCategoriesApi()]);
      setIngredients(ingredientList);
      setCategories(categoryList);
      setThresholdDrafts(Object.fromEntries(ingredientList.map((item) => [item.id, String(item.minStockQuantity || "")])));
      setSelectedIngredientId((current) => current || ingredientList[0]?.id || "");
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

  useEffect(() => {
    if (!selectedIngredient) return;
    setEntryMode(selectedIngredient.stockMode === "weight" ? "kilos" : "units");
  }, [selectedIngredient]);

  const categoryNameById = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const filteredIngredients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ingredients
      .filter((item) => `${item.name} ${categoryNameById[item.categoryId || ""] || ""}`.toLowerCase().includes(q))
      .sort((a, b) => (a.categoryId || "").localeCompare(b.categoryId || "") || a.name.localeCompare(b.name));
  }, [categoryNameById, ingredients, search]);

  const baseEntryQuantity = useMemo(() => {
    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return 0;
    if (entryMode === "kilos") return Math.trunc(parsedQuantity * 1000);
    if (entryMode === "packages") {
      const parsedUnits = Math.trunc(Number(unitsPerPackage));
      if (!Number.isFinite(parsedUnits) || parsedUnits <= 0) return 0;
      return Math.trunc(parsedQuantity) * parsedUnits;
    }
    return Math.trunc(parsedQuantity);
  }, [entryMode, quantity, unitsPerPackage]);

  async function submitEntry(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!selectedIngredient) {
      setError("Selecciona un item de inventario.");
      return;
    }
    if (baseEntryQuantity <= 0) {
      setError("Ingresa una cantidad valida.");
      return;
    }
    if (!expirationDate) {
      setError("La fecha de vencimiento es obligatoria.");
      return;
    }

    try {
      await createStockEntryApi({
        productId: selectedIngredient.productId || selectedIngredient.id,
        expirationDate,
        quantity: entryMode === "kilos" ? Number(quantity) : baseEntryQuantity,
        metric: entryMode === "kilos" ? "kilos" : "unit",
        movementType: "in",
        description: `Ingreso inventario: ${selectedIngredient.name}`,
      });
      const saved = await updateIngredientApi(selectedIngredient.id, {
        name: selectedIngredient.name,
        productId: selectedIngredient.productId,
        metric: selectedIngredient.metric,
        categoryId: selectedIngredient.categoryId,
        expiresInDays: selectedIngredient.expiresInDays,
        stockMode: selectedIngredient.stockMode,
        stockQuantity: selectedIngredient.stockQuantity,
        entryQuantity: baseEntryQuantity,
        minStockQuantity: selectedIngredient.minStockQuantity,
        portionSizeGrams: selectedIngredient.portionSizeGrams,
      });
      if (!saved) {
        setError("No se pudo actualizar el inventario.");
        return;
      }
      await reload();
      setSelectedIngredientId(saved.id);
      setQuantity("");
      setUnitsPerPackage("");
      setExpirationDate("");
      setMessage(`Stock cargado para ${saved.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar stock.");
    }
  }

  async function saveThreshold(ingredient: Ingredient) {
    setError("");
    setMessage("");
    const minStockQuantity = Math.max(0, Math.trunc(Number(thresholdDrafts[ingredient.id]) || 0)) || undefined;
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
      if (!saved) return;
      await reload();
      setMessage(`Rango minimo actualizado para ${saved.name}.`);
    } catch {
      setError("No se pudo guardar el rango minimo.");
    }
  }

  function getStockTone(ingredient: Ingredient) {
    const stock = Math.max(0, Number(ingredient.stockQuantity) || 0);
    const min = Math.max(0, Number(ingredient.minStockQuantity) || 0);
    if (stock <= 0) return styles.stockCritical;
    if (min > 0 && stock <= min) return styles.stockWarning;
    return "";
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Productos", to: "/products/new" }, { label: "Inventario" }]} asTitle />
            <p className={styles.subtitle}>Carga y control de stock de ingredientes e insumos.</p>
          </div>
          <SessionStatusBar />
        </header>

        <div className={styles.tabs} role="tablist" aria-label="Inventario">
          <button type="button" role="tab" aria-selected={activeTab === "entry"} className={`${styles.tabBtn} ${activeTab === "entry" ? styles.tabBtnActive : ""}`.trim()} onClick={() => setActiveTab("entry")}>
            Cargar stock
          </button>
          <button type="button" role="tab" aria-selected={activeTab === "current"} className={`${styles.tabBtn} ${activeTab === "current" ? styles.tabBtnActive : ""}`.trim()} onClick={() => setActiveTab("current")}>
            Stock actual
          </button>
        </div>

        {activeTab === "entry" ? (
          <div className={styles.layout}>
            <section className={styles.formCard}>
              <form className={styles.form} onSubmit={submitEntry}>
                <label className={styles.field}>
                  <span>Item</span>
                  <select className={styles.input} value={selectedIngredientId} onChange={(event) => setSelectedIngredientId(event.target.value)}>
                    {ingredients.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Tipo de carga</span>
                  <select className={styles.input} value={entryMode} onChange={(event) => setEntryMode(event.target.value as EntryMode)}>
                    <option value="kilos">Kilos</option>
                    <option value="units">Unidades</option>
                    <option value="packages">Paquetes</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Cantidad</span>
                  <input className={styles.input} type="number" min={entryMode === "kilos" ? 0.01 : 1} step={entryMode === "kilos" ? 0.01 : 1} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
                </label>
                {entryMode === "packages" ? (
                  <label className={styles.field}>
                    <span>Unidades por paquete</span>
                    <input className={styles.input} type="number" min={1} step={1} value={unitsPerPackage} onChange={(event) => setUnitsPerPackage(event.target.value)} />
                  </label>
                ) : null}
                <label className={styles.field}>
                  <span>Vencimiento</span>
                  <input className={styles.input} type="date" value={expirationDate} onChange={(event) => setExpirationDate(event.target.value)} />
                </label>
                <div className={styles.previewBox}>
                  {selectedIngredient ? `${formatIngredientQuantity(baseEntryQuantity, selectedIngredient.stockMode)} a sumar` : "-"}
                </div>
                {error ? <div className={styles.errorBox}>{error}</div> : null}
                {message ? <div className={styles.successBox}>{message}</div> : null}
                <button className={styles.primaryBtn} type="submit">Confirmar carga</button>
              </form>
            </section>
            <section className={styles.listCard}>
              {filteredIngredients.map((item) => (
                <button key={item.id} type="button" className={`${styles.inventoryItem} ${selectedIngredientId === item.id ? styles.inventoryItemActive : ""}`.trim()} onClick={() => setSelectedIngredientId(item.id)}>
                  <strong>{item.name}</strong>
                  <span>{categoryNameById[item.categoryId || ""] || "Sin categoria"}</span>
                  <small>{formatIngredientQuantity(item.stockQuantity, item.stockMode)} disponibles</small>
                </button>
              ))}
            </section>
          </div>
        ) : (
          <section className={styles.stockPanel}>
            <div className={styles.stockTools}>
              <input className={styles.input} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar ingrediente o insumo" />
            </div>
            <div className={styles.stockTable}>
              <div className={styles.stockHead}>
                <div>Item</div>
                <div>Categoria</div>
                <div>Tipo</div>
                <div>Stock</div>
                <div>Minimo</div>
                <div />
              </div>
              {loading ? <p className={styles.empty}>Cargando inventario...</p> : null}
              {filteredIngredients.map((item) => (
                <div key={item.id} className={`${styles.stockRow} ${getStockTone(item)}`.trim()}>
                  <div>{item.name}</div>
                  <div>{categoryNameById[item.categoryId || ""] || "Sin categoria"}</div>
                  <div>{getIngredientStockModeLabel(item.stockMode)}</div>
                  <div>{formatIngredientQuantity(item.stockQuantity, item.stockMode)}</div>
                  <div>
                    <input className={styles.thresholdInput} type="number" min={0} value={thresholdDrafts[item.id] || ""} onChange={(event) => setThresholdDrafts((current) => ({ ...current, [item.id]: event.target.value }))} />
                  </div>
                  <button type="button" className={styles.inlineBtn} onClick={() => void saveThreshold(item)}>Guardar</button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
