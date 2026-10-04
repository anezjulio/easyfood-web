import type React from "react";
import { useEffect, useMemo, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { formatDateAR } from "../../../shared/format/locale";
import { normalizeForSearch } from "../../../shared/search/search";
import { DATA_STORE_CHANGED_EVENT } from "../../data/service/data.api";
import {
  formatIngredientQuantity,
  getIngredientStockModeLabel,
  type Ingredient,
  type IngredientCategory,
  type IngredientStockMode,
} from "../model/ingredient.types";
import { createIngredientApi, deleteIngredientApi, fetchIngredientCategoriesApi, fetchIngredientsApi, updateIngredientApi } from "../service/ingredient.api";
import styles from "./IngredientsScreen.module.css";

function buildExpirationPreview(days: string): string {
  const parsed = Math.max(0, Math.trunc(Number(days) || 0));
  const date = new Date();
  date.setDate(date.getDate() + parsed);
  return date.toISOString().slice(0, 10);
}

export default function IngredientsScreen() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [categories, setCategories] = useState<IngredientCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [stockModeFilter, setStockModeFilter] = useState<"all" | IngredientStockMode>("all");
  const [activeTab, setActiveTab] = useState<"ingredients" | "portions">("ingredients");

  const [name, setName] = useState("");
  const [renameSelectedIngredient, setRenameSelectedIngredient] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState("5");
  const [stockMode, setStockMode] = useState<IngredientStockMode>("unit");
  const [categoryId, setCategoryId] = useState("varios");
  const [portionIngredientId, setPortionIngredientId] = useState("");
  const [portionSizeGrams, setPortionSizeGrams] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function reload(nextSelectedId?: string) {
    setLoading(true);
    setError("");
    try {
      const [list, categoryList] = await Promise.all([fetchIngredientsApi(), fetchIngredientCategoriesApi()]);
      setIngredients(list);
      setCategories(categoryList);
      if (typeof nextSelectedId === "string") setSelectedId(nextSelectedId);
    } catch {
      setError("No se pudieron cargar los ingredientes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    const handler = () => {
      clearForm();
      void reload();
    };
    window.addEventListener(DATA_STORE_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DATA_STORE_CHANGED_EVENT, handler);
  }, []);

  const selectedIngredient = useMemo(
    () => ingredients.find((item) => item.id === selectedId) || null,
    [ingredients, selectedId],
  );
  const selectedPortionIngredient = useMemo(
    () => ingredients.find((item) => item.id === portionIngredientId) || null,
    [ingredients, portionIngredientId],
  );
  const portionIngredients = useMemo(
    () => ingredients.filter((item) => item.stockMode === "weight").sort((a, b) => a.name.localeCompare(b.name)),
    [ingredients],
  );

  const filteredIngredients = useMemo(() => {
    const query = normalizeForSearch(search);
    return ingredients
      .filter((item) => (query ? normalizeForSearch(item.name).includes(query) : true))
      .filter((item) => (stockModeFilter === "all" ? true : item.stockMode === stockModeFilter))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [ingredients, search, stockModeFilter]);

  const isEditing = !!selectedIngredient;
  const expirationPreview = buildExpirationPreview(expiresInDays);

  useEffect(() => {
    if (portionIngredientId && portionIngredients.some((item) => item.id === portionIngredientId)) return;
    setPortionIngredientId(portionIngredients[0]?.id || "");
  }, [portionIngredientId, portionIngredients]);

  useEffect(() => {
    setPortionSizeGrams(selectedPortionIngredient?.portionSizeGrams ? String(selectedPortionIngredient.portionSizeGrams) : "");
  }, [selectedPortionIngredient]);

  function clearForm() {
    setSelectedId("");
    setName("");
    setRenameSelectedIngredient(false);
    setExpiresInDays("5");
    setStockMode("unit");
    setCategoryId("varios");
    setMessage("");
    setError("");
  }

  function selectIngredient(item: Ingredient) {
    setSelectedId(item.id);
    setName(item.name);
    setRenameSelectedIngredient(false);
    setExpiresInDays(String(item.expiresInDays));
    setStockMode(item.stockMode);
    setCategoryId(item.categoryId || "varios");
    setMessage("");
    setError("");
  }

  async function submitIngredient(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    const trimmedName = name.trim();
    const parsedDays = Math.max(0, Math.trunc(Number(expiresInDays) || 0));
    if (!trimmedName) {
      setError("Ingresa el nombre del ingrediente.");
      return;
    }
    if (!Number.isFinite(parsedDays) || parsedDays < 0) {
      setError("Ingresa una cantidad valida de dias antes de caducar.");
      return;
    }

    try {
      const metric: "unit" | "weight" = stockMode === "weight" ? "weight" : "unit";
      const draft = {
        name: trimmedName,
        categoryId,
        expiresInDays: parsedDays,
        stockMode,
        metric,
        stockQuantity: selectedIngredient ? selectedIngredient.stockQuantity : 0,
        entryQuantity: 0,
        portionSizeGrams: selectedIngredient?.portionSizeGrams,
      };
      const shouldCreateFromTemplate = selectedIngredient && normalizeForSearch(selectedIngredient.name) !== normalizeForSearch(trimmedName) && !renameSelectedIngredient;
      const saved = selectedIngredient && !shouldCreateFromTemplate ? await updateIngredientApi(selectedIngredient.id, draft) : await createIngredientApi(draft);
      if (!saved) {
        setError("No se pudo guardar el ingrediente seleccionado.");
        return;
      }
      if (selectedIngredient && !shouldCreateFromTemplate) {
        await reload(saved.id);
        selectIngredient(saved);
        setMessage("Ingrediente actualizado.");
      } else {
        await reload();
        clearForm();
        setMessage("Ingrediente creado.");
      }
    } catch {
      setError("No se pudo guardar el ingrediente.");
    }
  }

  async function removeSelectedIngredient() {
    if (!selectedIngredient) return;
    setError("");
    setMessage("");
    try {
      const removed = await deleteIngredientApi(selectedIngredient.id);
      if (!removed) {
        setError("No se pudo eliminar el ingrediente.");
        return;
      }
      clearForm();
      await reload();
      setMessage("Ingrediente eliminado.");
    } catch {
      setError("No se pudo eliminar el ingrediente.");
    }
  }

  async function submitPortion(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!selectedPortionIngredient) {
      setError("Selecciona un ingrediente por peso.");
      return;
    }
    const grams = Math.max(0, Math.trunc(Number(portionSizeGrams) || 0));
    if (!Number.isFinite(grams) || grams <= 0) {
      setError("Ingresa los gramos de la porcion.");
      return;
    }
    try {
      const saved = await updateIngredientApi(selectedPortionIngredient.id, {
        name: selectedPortionIngredient.name,
        categoryId: selectedPortionIngredient.categoryId,
        expiresInDays: selectedPortionIngredient.expiresInDays,
        stockMode: selectedPortionIngredient.stockMode,
        stockQuantity: selectedPortionIngredient.stockQuantity,
        entryQuantity: 0,
        portionSizeGrams: grams,
      });
      if (!saved) {
        setError("No se pudo guardar la porcion.");
        return;
      }
      await reload(saved.id);
      setPortionIngredientId(saved.id);
      setMessage("Porcion guardada.");
    } catch {
      setError("No se pudo guardar la porcion.");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Ingredientes y productos" }]} asTitle />
            <p className={styles.subtitle}>Carga ingredientes de receta, caducidad, stock por peso o unidad y porciones en gramos.</p>
          </div>
          <SessionStatusBar />
        </header>

        <section className={styles.summary}>
          <p><strong>Ingredientes:</strong> {ingredients.length}</p>
          <p><strong>Por peso:</strong> {ingredients.filter((item) => item.stockMode === "weight").length}</p>
          <p><strong>Por unidad:</strong> {ingredients.filter((item) => item.stockMode === "unit").length}</p>
        </section>

        <div className={styles.tabs}>
          <button type="button" className={`${styles.tabBtn} ${activeTab === "ingredients" ? styles.tabBtnActive : ""}`} onClick={() => setActiveTab("ingredients")}>
            Ingredientes
          </button>
          <button type="button" className={`${styles.tabBtn} ${activeTab === "portions" ? styles.tabBtnActive : ""}`} onClick={() => setActiveTab("portions")}>
            Porciones
          </button>
        </div>

        {activeTab === "portions" ? (
          <div className={styles.layout}>
            <section className={styles.formCard}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Porciones por peso</h2>
              </div>
              <form className={styles.form} onSubmit={submitPortion}>
                <label className={styles.field}>
                  <span>Ingrediente</span>
                  <select className={styles.input} value={portionIngredientId} onChange={(event) => setPortionIngredientId(event.target.value)}>
                    {portionIngredients.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Gramos por porcion</span>
                  <input className={styles.input} type="number" min={1} value={portionSizeGrams} onChange={(event) => setPortionSizeGrams(event.target.value)} placeholder="Ej: 120" />
                </label>
                <div className={styles.previewGrid}>
                  <div><span>Stock actual</span><strong>{selectedPortionIngredient ? formatIngredientQuantity(selectedPortionIngredient.stockQuantity, selectedPortionIngredient.stockMode) : "-"}</strong></div>
                  <div><span>Rinde</span><strong>{selectedPortionIngredient && Number(portionSizeGrams) > 0 ? Math.floor(selectedPortionIngredient.stockQuantity / Number(portionSizeGrams)) : 0} porciones</strong></div>
                </div>
                {error ? <div className={styles.errorBox}>{error}</div> : null}
                {message ? <div className={styles.successBox}>{message}</div> : null}
                <div className={styles.actions}>
                  <button type="submit" className={styles.primaryBtn}>Guardar porcion</button>
                </div>
              </form>
            </section>
            <section className={styles.listCard}>
              <div className={styles.listHead}>
                <h2 className={styles.cardTitle}>Ingredientes con porcion</h2>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Ingrediente</th><th>Stock</th><th>Porcion</th><th>Rinde</th></tr></thead>
                  <tbody>
                    {portionIngredients.map((item) => (
                      <tr key={item.id} className={portionIngredientId === item.id ? styles.selectedRow : ""} onClick={() => setPortionIngredientId(item.id)}>
                        <td><strong>{item.name}</strong></td>
                        <td>{formatIngredientQuantity(item.stockQuantity, item.stockMode)}</td>
                        <td>{item.portionSizeGrams ? `${item.portionSizeGrams} g` : "-"}</td>
                        <td>{item.portionSizeGrams ? Math.floor(item.stockQuantity / item.portionSizeGrams) : 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : (
        <div className={styles.layout}>
          <section className={styles.formCard}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>{isEditing ? "Editar ingrediente" : "Crear ingrediente"}</h2>
              <div className={styles.headerActions}>
                <button type="button" className={styles.secondaryBtn} onClick={clearForm}>Nuevo</button>
                <button type="button" className={styles.dangerBtn} onClick={() => void removeSelectedIngredient()} disabled={!selectedIngredient}>
                  Eliminar
                </button>
              </div>
            </div>

            <form className={styles.form} onSubmit={submitIngredient}>
              <div className={styles.nameRow}>
                <label className={styles.field}>
                  <span>Nombre</span>
                  <input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej: Tomate, lechuga o pan de pancho" />
                </label>
                <label className={styles.inlineToggle}><input type="checkbox" checked={renameSelectedIngredient} onChange={(event) => setRenameSelectedIngredient(event.target.checked)} disabled={!selectedIngredient} />Modificar</label>
              </div>

              <label className={styles.field}>
                <span>Dias antes de caducar</span>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  value={expiresInDays}
                  onChange={(event) => setExpiresInDays(event.target.value)}
                  placeholder="0"
                />
              </label>

              <label className={styles.field}>
                <span>Categoria</span>
                <select className={styles.input} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span>Modo de stock</span>
                <select className={styles.input} value={stockMode} onChange={(event) => setStockMode(event.target.value as IngredientStockMode)}>
                  <option value="weight">Por peso</option>
                  <option value="unit">Por unidad</option>
                </select>
              </label>

              <div className={styles.previewGrid}>
                <div><span>Modo</span><strong>{getIngredientStockModeLabel(stockMode)}</strong></div>
                <div><span>Proximo vencimiento</span><strong>{formatDateAR(expirationPreview)}</strong></div>
              </div>

              {error ? <div className={styles.errorBox}>{error}</div> : null}
              {message ? <div className={styles.successBox}>{message}</div> : null}

              <div className={styles.actions}>
                <button type="submit" className={styles.primaryBtn}>{isEditing ? "Guardar cambios" : "Crear ingrediente"}</button>
              </div>
            </form>
          </section>

          <section className={styles.listCard}>
            <div className={styles.listHead}>
              <h2 className={styles.cardTitle}>Lista de ingredientes</h2>
              <div className={styles.filters}>
                <input className={styles.searchInput} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar ingrediente o producto" />
                <select className={styles.filterSelect} value={stockModeFilter} onChange={(event) => setStockModeFilter(event.target.value as "all" | IngredientStockMode)}>
                  <option value="all">Todos</option>
                  <option value="weight">Peso</option>
                  <option value="unit">Unidad</option>
                </select>
              </div>
            </div>

            {loading ? (
              <p className={styles.empty}>Cargando ingredientes...</p>
            ) : filteredIngredients.length === 0 ? (
              <p className={styles.empty}>No hay ingredientes para mostrar.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Ingrediente</th>
                      <th>Categoria</th>
                      <th>Modo</th>
                      <th>Caduca</th>
                      <th>Vencimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIngredients.map((item) => (
                      <tr key={item.id} className={selectedId === item.id ? styles.selectedRow : ""} onClick={() => selectIngredient(item)}>
                        <td><strong>{item.name}</strong></td>
                        <td>{categories.find((category) => category.id === item.categoryId)?.name || "-"}</td>
                        <td>{getIngredientStockModeLabel(item.stockMode)}</td>
                        <td>{item.expiresInDays} dias</td>
                        <td>{item.nextExpirationDate ? formatDateAR(item.nextExpirationDate) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
        )}
      </div>
    </div>
  );
}
