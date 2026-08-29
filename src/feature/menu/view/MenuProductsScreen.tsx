import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { formatMoneyARS } from "../../../shared/format/locale";
import { normalizeForSearch } from "../../../shared/search/search";
import { formatIngredientQuantity, getIngredientQuantityUnitLabel, type Ingredient } from "../../ingredient/model/ingredient.types";
import { fetchIngredientsApi } from "../../ingredient/service/ingredient.api";
import type { MenuProduct, MenuRecipeItem } from "../model/menu.types";
import { createMenuProductApi, deleteMenuProductApi, fetchMenuProductsApi, updateMenuProductApi } from "../service/menu.api";
import styles from "./MenuProductsScreen.module.css";

function toNumber(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateAvailableServings(menuProduct: MenuProduct, ingredients: Ingredient[]): number | null {
  if (menuProduct.recipeItems.length === 0) return null;
  const stockById = new Map(ingredients.map((item) => [item.id, item.stockQuantity]));
  let min = Number.POSITIVE_INFINITY;

  for (const item of menuProduct.recipeItems) {
    const available = stockById.get(item.ingredientId);
    if (!Number.isFinite(available) || item.quantity <= 0) return 0;
    min = Math.min(min, Math.floor(Number(available) / item.quantity));
  }

  return Number.isFinite(min) ? Math.max(0, min) : null;
}

function getRecipeLineLabel(item: MenuRecipeItem) {
  return `${formatIngredientQuantity(item.quantity, item.stockMode)} de ${item.ingredientName}`;
}

export default function MenuProductsScreen() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [menuProducts, setMenuProducts] = useState<MenuProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [recipeItems, setRecipeItems] = useState<MenuRecipeItem[]>([]);
  const [ingredientId, setIngredientId] = useState("");
  const [ingredientQuantity, setIngredientQuantity] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const reload = useCallback(async (nextSelectedId?: string) => {
    setLoading(true);
    setError("");
    try {
      const [ingredientList, menuList] = await Promise.all([fetchIngredientsApi(), fetchMenuProductsApi()]);
      setIngredients(ingredientList);
      setMenuProducts(menuList);
      if (typeof nextSelectedId === "string") setSelectedId(nextSelectedId);
      setIngredientId((current) => current || ingredientList[0]?.id || "");
    } catch {
      setError("No se pudieron cargar ingredientes o productos del menu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selectedMenuProduct = useMemo(
    () => menuProducts.find((item) => item.id === selectedId) || null,
    [menuProducts, selectedId],
  );

  const selectedIngredient = useMemo(
    () => ingredients.find((item) => item.id === ingredientId) || null,
    [ingredientId, ingredients],
  );

  const filteredMenuProducts = useMemo(() => {
    const query = normalizeForSearch(search);
    return menuProducts
      .filter((item) => {
        if (!query) return true;
        return normalizeForSearch(`${item.name} ${item.description || ""} ${item.recipeItems.map((recipe) => recipe.ingredientName).join(" ")}`).includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [menuProducts, search]);

  const isEditing = !!selectedMenuProduct;
  const parsedPrice = Math.max(0, Math.trunc(toNumber(price)));
  const currentAvailability = useMemo(
    () =>
      calculateAvailableServings(
        {
          id: selectedId || "draft",
          name,
          price: parsedPrice,
          description,
          recipeItems,
          createdAt: new Date().toISOString(),
        },
        ingredients,
      ),
    [description, ingredients, name, parsedPrice, recipeItems, selectedId],
  );

  function clearForm() {
    setSelectedId("");
    setName("");
    setPrice("");
    setDescription("");
    setRecipeItems([]);
    setIngredientQuantity("");
    setMessage("");
    setError("");
  }

  function selectMenuProduct(item: MenuProduct) {
    setSelectedId(item.id);
    setName(item.name);
    setPrice(String(item.price || ""));
    setDescription(item.description || "");
    setRecipeItems(item.recipeItems);
    setIngredientQuantity("");
    setMessage("");
    setError("");
  }

  function addRecipeItem() {
    setError("");
    setMessage("");
    if (!selectedIngredient) {
      setError("Selecciona un ingrediente para agregar a la receta.");
      return;
    }

    const quantity = toNumber(ingredientQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Ingresa una cantidad valida para la receta.");
      return;
    }

    const nextItem: MenuRecipeItem = {
      ingredientId: selectedIngredient.id,
      ingredientName: selectedIngredient.name,
      quantity,
      stockMode: selectedIngredient.stockMode,
    };

    setRecipeItems((current) => {
      const existingIndex = current.findIndex((item) => item.ingredientId === selectedIngredient.id);
      if (existingIndex < 0) return [...current, nextItem];
      return current.map((item, index) => (index === existingIndex ? nextItem : item));
    });
    setIngredientQuantity("");
  }

  function removeRecipeItem(ingredientIdToRemove: string) {
    setRecipeItems((current) => current.filter((item) => item.ingredientId !== ingredientIdToRemove));
  }

  async function submitMenuProduct(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Ingresa el nombre del producto de menu.");
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setError("Ingresa un precio de venta valido.");
      return;
    }
    if (recipeItems.length === 0) {
      setError("Agrega al menos un ingrediente a la receta.");
      return;
    }

    try {
      const draft = {
        name: trimmedName,
        price: parsedPrice,
        description: description.trim() || undefined,
        recipeItems,
      };
      const saved = isEditing ? await updateMenuProductApi(selectedMenuProduct.id, draft) : await createMenuProductApi(draft);
      if (!saved) {
        setError("No se pudo guardar el producto de menu seleccionado.");
        return;
      }
      await reload(saved.id);
      selectMenuProduct(saved);
      setMessage(isEditing ? "Producto de menu actualizado." : "Producto de menu creado.");
    } catch {
      setError("No se pudo guardar el producto de menu.");
    }
  }

  async function removeSelectedMenuProduct() {
    if (!selectedMenuProduct) return;
    setError("");
    setMessage("");
    try {
      const removed = await deleteMenuProductApi(selectedMenuProduct.id);
      if (!removed) {
        setError("No se pudo eliminar el producto de menu.");
        return;
      }
      clearForm();
      await reload();
      setMessage("Producto de menu eliminado.");
    } catch {
      setError("No se pudo eliminar el producto de menu.");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Creacion de menu" }]} asTitle />
            <p className={styles.subtitle}>Productos vendibles compuestos por recetas de ingredientes.</p>
          </div>
          <SessionStatusBar />
        </header>

        <section className={styles.summary}>
          <p><strong>Productos de menu:</strong> {menuProducts.length}</p>
          <p><strong>Ingredientes disponibles:</strong> {ingredients.length}</p>
          <p><strong>Porciones posibles:</strong> {currentAvailability === null ? "-" : currentAvailability}</p>
        </section>

        <div className={styles.layout}>
          <section className={styles.formCard}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>{isEditing ? "Editar producto de menu" : "Crear producto de menu"}</h2>
              <div className={styles.headerActions}>
                <button type="button" className={styles.secondaryBtn} onClick={clearForm}>Nuevo</button>
                <button type="button" className={styles.dangerBtn} onClick={() => void removeSelectedMenuProduct()} disabled={!selectedMenuProduct}>
                  Eliminar
                </button>
              </div>
            </div>

            <form className={styles.form} onSubmit={submitMenuProduct}>
              <label className={styles.field}>
                <span>Nombre</span>
                <input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej: Hamburguesa doble" />
              </label>

              <label className={styles.field}>
                <span>Precio de venta</span>
                <input className={styles.input} type="number" min={1} value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" />
              </label>

              <label className={styles.field}>
                <span>Descripcion</span>
                <textarea className={styles.textarea} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Detalle visible para cocina o caja" />
              </label>

              <section className={styles.recipeEditor}>
                <h3 className={styles.sectionTitle}>Receta</h3>
                <div className={styles.recipeControls}>
                  <select className={styles.input} value={ingredientId} onChange={(event) => setIngredientId(event.target.value)}>
                    <option value="">Seleccionar ingrediente</option>
                    {ingredients.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} - stock {formatIngredientQuantity(item.stockQuantity, item.stockMode)}
                      </option>
                    ))}
                  </select>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    step="0.01"
                    value={ingredientQuantity}
                    onChange={(event) => setIngredientQuantity(event.target.value)}
                    placeholder={selectedIngredient?.stockMode === "weight" ? "Gramos" : "Cantidad"}
                  />
                  <div className={styles.unitPill}>{selectedIngredient ? getIngredientQuantityUnitLabel(selectedIngredient.stockMode) : "-"}</div>
                  <button type="button" className={styles.secondaryBtn} onClick={addRecipeItem}>Agregar</button>
                </div>

                {recipeItems.length === 0 ? (
                  <p className={styles.empty}>Todavia no agregaste ingredientes.</p>
                ) : (
                  <div className={styles.recipeList}>
                    {recipeItems.map((item) => (
                      <div key={item.ingredientId} className={styles.recipeItem}>
                        <div>
                          <strong>{item.ingredientName}</strong>
                          <span>{getRecipeLineLabel(item)}</span>
                        </div>
                        <button type="button" className={styles.removeBtn} onClick={() => removeRecipeItem(item.ingredientId)}>Quitar</button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <div className={styles.previewGrid}>
                <div><span>Precio</span><strong>{parsedPrice > 0 ? formatMoneyARS(parsedPrice) : "-"}</strong></div>
                <div><span>Produccion con stock</span><strong>{currentAvailability === null ? "-" : `${currentAvailability} porciones`}</strong></div>
              </div>

              {error ? <div className={styles.errorBox}>{error}</div> : null}
              {message ? <div className={styles.successBox}>{message}</div> : null}

              <div className={styles.actions}>
                <button type="submit" className={styles.primaryBtn}>{isEditing ? "Guardar receta" : "Crear producto"}</button>
              </div>
            </form>
          </section>

          <section className={styles.listCard}>
            <div className={styles.listHead}>
              <h2 className={styles.cardTitle}>Menu actual</h2>
              <input className={styles.searchInput} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto o ingrediente" />
            </div>

            {loading ? (
              <p className={styles.empty}>Cargando menu...</p>
            ) : filteredMenuProducts.length === 0 ? (
              <p className={styles.empty}>No hay productos de menu para mostrar.</p>
            ) : (
              <div className={styles.menuList}>
                {filteredMenuProducts.map((item) => {
                  const servings = calculateAvailableServings(item, ingredients);
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`${styles.menuCard} ${selectedId === item.id ? styles.menuCardActive : ""}`.trim()}
                      onClick={() => selectMenuProduct(item)}
                    >
                      <div className={styles.menuTop}>
                        <strong>{item.name}</strong>
                        <span>{formatMoneyARS(item.price)}</span>
                      </div>
                      {item.description ? <p className={styles.description}>{item.description}</p> : null}
                      <p className={styles.meta}>{item.recipeItems.length} ingredientes - {servings === null ? "-" : servings} porciones posibles</p>
                      <div className={styles.recipeChips}>
                        {item.recipeItems.map((recipe) => (
                          <span key={recipe.ingredientId}>{recipe.ingredientName}: {formatIngredientQuantity(recipe.quantity, recipe.stockMode)}</span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
