import type React from "react";
import { useEffect, useMemo, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { formatDateAR } from "../../../shared/format/locale";
import { normalizeForSearch } from "../../../shared/search/search";
import {
  formatIngredientQuantity,
  getIngredientQuantityUnitLabel,
  getIngredientStockModeLabel,
  type Ingredient,
  type IngredientStockMode,
} from "../model/ingredient.types";
import { createIngredientApi, deleteIngredientApi, fetchIngredientsApi, updateIngredientApi } from "../service/ingredient.api";
import styles from "./IngredientsScreen.module.css";

type WeightEntryUnit = "g" | "kg";

function toNumber(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toEntryQuantity(value: string, mode: IngredientStockMode, weightUnit: WeightEntryUnit): number {
  const parsed = toNumber(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  if (mode === "weight" && weightUnit === "kg") return parsed * 1000;
  return parsed;
}

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
  const [stockQuantity, setStockQuantity] = useState("0");
  const [entryQuantity, setEntryQuantity] = useState("");
  const [weightEntryUnit, setWeightEntryUnit] = useState<WeightEntryUnit>("kg");
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

  const currentQuantity = Math.max(0, toNumber(stockQuantity));
  const entryQuantityValue = toEntryQuantity(entryQuantity, stockMode, weightEntryUnit);
  const projectedQuantity = currentQuantity + entryQuantityValue;
  const isEditing = !!selectedIngredient;
  const expirationPreview = buildExpirationPreview(expiresInDays);

  function clearForm() {
    setSelectedId("");
    setName("");
    setExpiresInDays("5");
    setStockMode("unit");
    setStockQuantity("0");
    setEntryQuantity("");
    setWeightEntryUnit("kg");
    setMessage("");
    setError("");
  }

  function selectIngredient(item: Ingredient) {
    setSelectedId(item.id);
    setName(item.name);
    setExpiresInDays(String(item.expiresInDays));
    setStockMode(item.stockMode);
    setStockQuantity(String(item.stockQuantity));
    setEntryQuantity("");
    setWeightEntryUnit(item.stockMode === "weight" ? "kg" : "g");
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
        stockQuantity: currentQuantity,
        entryQuantity: entryQuantityValue,
      };
      const saved = isEditing ? await updateIngredientApi(selectedIngredient.id, draft) : await createIngredientApi(draft);
      if (!saved) {
        setError("No se pudo guardar el ingrediente seleccionado.");
        return;
      }
      setEntryQuantity("");
      await reload(saved.id);
      selectIngredient(saved);
      setMessage(isEditing ? "Ingrediente actualizado." : "Ingrediente creado.");
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
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Ingredientes" }]} asTitle />
            <p className={styles.subtitle}>Alta de ingredientes, caducidad y stock por peso, paquete o unidad.</p>
          </div>
          <SessionStatusBar />
        </header>

        <section className={styles.summary}>
          <p><strong>Ingredientes:</strong> {ingredients.length}</p>
          <p><strong>Por peso:</strong> {ingredients.filter((item) => item.stockMode === "weight").length}</p>
          <p><strong>Bajo stock:</strong> {ingredients.filter((item) => item.stockQuantity <= 0).length}</p>
        </section>

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
              <label className={styles.field}>
                <span>Nombre</span>
                <input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej: Medallon de carne" />
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
                <span>Modo de manejo</span>
                <select className={styles.input} value={stockMode} onChange={(event) => setStockMode(event.target.value as IngredientStockMode)}>
                  <option value="weight">Por peso</option>
                  <option value="package">Por paquete</option>
                  <option value="unit">Por unidad</option>
                </select>
              </label>

              <label className={styles.field}>
                <span>Stock actual</span>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  step={stockMode === "weight" ? 1 : 0.01}
                  value={stockQuantity}
                  onChange={(event) => setStockQuantity(event.target.value)}
                  placeholder="0"
                />
              </label>

              <div className={styles.field}>
                <span>Ingreso</span>
                <div className={styles.inlineFields}>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    step="0.01"
                    value={entryQuantity}
                    onChange={(event) => setEntryQuantity(event.target.value)}
                    placeholder={stockMode === "weight" ? "Ej: 2.5" : "0"}
                  />
                  {stockMode === "weight" ? (
                    <select className={styles.smallSelect} value={weightEntryUnit} onChange={(event) => setWeightEntryUnit(event.target.value as WeightEntryUnit)}>
                      <option value="kg">kg</option>
                      <option value="g">g</option>
                    </select>
                  ) : (
                    <div className={styles.unitPill}>{getIngredientQuantityUnitLabel(stockMode)}</div>
                  )}
                </div>
              </div>

              <div className={styles.previewGrid}>
                <div><span>Stock resultante</span><strong>{formatIngredientQuantity(projectedQuantity, stockMode)}</strong></div>
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
                <input className={styles.searchInput} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar ingrediente" />
                <select className={styles.filterSelect} value={stockModeFilter} onChange={(event) => setStockModeFilter(event.target.value as "all" | IngredientStockMode)}>
                  <option value="all">Todos</option>
                  <option value="weight">Peso</option>
                  <option value="package">Paquete</option>
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
                      <th>Modo</th>
                      <th>Stock</th>
                      <th>Caduca</th>
                      <th>Vencimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIngredients.map((item) => (
                      <tr key={item.id} className={selectedId === item.id ? styles.selectedRow : ""} onClick={() => selectIngredient(item)}>
                        <td><strong>{item.name}</strong></td>
                        <td>{getIngredientStockModeLabel(item.stockMode)}</td>
                        <td>{formatIngredientQuantity(item.stockQuantity, item.stockMode)}</td>
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
