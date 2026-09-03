import type React from "react";
import { useEffect, useMemo, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { formatDateAR } from "../../../shared/format/locale";
import { normalizeForSearch } from "../../../shared/search/search";
import {
  getIngredientStockModeLabel,
  type Ingredient,
  type IngredientStockMode,
} from "../model/ingredient.types";
import { createIngredientApi, deleteIngredientApi, fetchIngredientsApi, updateIngredientApi } from "../service/ingredient.api";
import styles from "./IngredientsScreen.module.css";

function buildExpirationPreview(days: string): string {
  const parsed = Math.max(0, Math.trunc(Number(days) || 0));
  const date = new Date();
  date.setDate(date.getDate() + parsed);
  return date.toISOString().slice(0, 10);
}

export default function IngredientsScreen() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [stockModeFilter, setStockModeFilter] = useState<"all" | IngredientStockMode>("all");

  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("5");
  const [stockMode, setStockMode] = useState<IngredientStockMode>("unit");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function reload(nextSelectedId?: string) {
    setLoading(true);
    setError("");
    try {
      const list = await fetchIngredientsApi();
      setIngredients(list);
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

  const selectedIngredient = useMemo(
    () => ingredients.find((item) => item.id === selectedId) || null,
    [ingredients, selectedId],
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

  function clearForm() {
    setSelectedId("");
    setName("");
    setExpiresInDays("5");
    setStockMode("unit");
    setMessage("");
    setError("");
  }

  function selectIngredient(item: Ingredient) {
    setSelectedId(item.id);
    setName(item.name);
    setExpiresInDays(String(item.expiresInDays));
    setStockMode(item.stockMode);
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
      const draft = {
        name: trimmedName,
        expiresInDays: parsedDays,
        stockMode,
        stockQuantity: selectedIngredient && normalizeForSearch(selectedIngredient.name) === normalizeForSearch(trimmedName) ? selectedIngredient.stockQuantity : 0,
        entryQuantity: 0,
      };
      const shouldCreateFromTemplate = selectedIngredient && normalizeForSearch(selectedIngredient.name) !== normalizeForSearch(trimmedName);
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

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Ingredientes y productos" }]} asTitle />
            <p className={styles.subtitle}>Carga ingredientes de receta y productos envasados como bebidas, caducidad y stock por peso, paquete o unidad.</p>
          </div>
          <SessionStatusBar />
        </header>

        <section className={styles.summary}>
          <p><strong>Ingredientes y productos:</strong> {ingredients.length}</p>
          <p><strong>Por peso:</strong> {ingredients.filter((item) => item.stockMode === "weight").length}</p>
          <p><strong>Por unidad:</strong> {ingredients.filter((item) => item.stockMode === "unit").length}</p>
        </section>

        <div className={styles.layout}>
          <section className={styles.formCard}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>{isEditing ? "Editar ingrediente o producto" : "Crear ingrediente o producto"}</h2>
              <div className={styles.headerActions}>
                <button type="button" className={styles.secondaryBtn} onClick={clearForm}>Nuevo</button>
                <button type="button" className={styles.dangerBtn} onClick={() => void removeSelectedIngredient()} disabled={!selectedIngredient}>
                  Eliminar
                </button>
              </div>
            </div>

            <form className={styles.form} onSubmit={submitIngredient}>
              <label className={styles.field}>
                <span>Nombre</span>
                <input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej: Tomate, lechuga o Coca-Cola 500 ml" />
              </label>

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
                <span>Modo de stock</span>
                <select className={styles.input} value={stockMode} onChange={(event) => setStockMode(event.target.value as IngredientStockMode)}>
                  <option value="weight">Por peso</option>
                  <option value="package">Por paquete</option>
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
                <button type="submit" className={styles.primaryBtn}>{isEditing ? "Guardar cambios" : "Crear ingrediente o producto"}</button>
              </div>
            </form>
          </section>

          <section className={styles.listCard}>
            <div className={styles.listHead}>
              <h2 className={styles.cardTitle}>Lista de ingredientes y productos</h2>
              <div className={styles.filters}>
                <input className={styles.searchInput} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar ingrediente o producto" />
                <select className={styles.filterSelect} value={stockModeFilter} onChange={(event) => setStockModeFilter(event.target.value as "all" | IngredientStockMode)}>
                  <option value="all">Todos</option>
                  <option value="weight">Peso</option>
                  <option value="package">Paquete</option>
                  <option value="unit">Unidad</option>
                </select>
              </div>
            </div>

            {loading ? (
              <p className={styles.empty}>Cargando ingredientes y productos...</p>
            ) : filteredIngredients.length === 0 ? (
              <p className={styles.empty}>No hay ingredientes o productos para mostrar.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Ingrediente</th>
                      <th>Modo</th>
                      <th>Caduca</th>
                      <th>Vencimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIngredients.map((item) => (
                      <tr key={item.id} className={selectedId === item.id ? styles.selectedRow : ""} onClick={() => selectIngredient(item)}>
                        <td><strong>{item.name}</strong></td>
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
      </div>
    </div>
  );
}
