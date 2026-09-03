import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { formatMoneyARS } from "../../../shared/format/locale";
import { normalizeForSearch } from "../../../shared/search/search";
import { DATA_STORE_CHANGED_EVENT } from "../../data/service/data.api";
import { formatIngredientQuantity, getIngredientQuantityUnitLabel, type Ingredient } from "../../ingredient/model/ingredient.types";
import { PRODUCT_CATEGORIES, type ProductCategory } from "../../product/model/product.types";
import { fetchIngredientsApi } from "../../ingredient/service/ingredient.api";
import type { MenuComboItem, MenuProduct, MenuRecipeItem } from "../model/menu.types";
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

function formatCategoryLabel(category: ProductCategory) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function compareIngredientByGroup(a: Ingredient, b: Ingredient) {
  return a.stockMode.localeCompare(b.stockMode) || a.name.localeCompare(b.name);
}

function compareRecipeItemByGroup(a: MenuRecipeItem, b: MenuRecipeItem) {
  return a.stockMode.localeCompare(b.stockMode) || a.ingredientName.localeCompare(b.ingredientName);
}

function compareMenuProductByCategory(a: MenuProduct, b: MenuProduct) {
  return (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name);
}

function compareComboItemByCategory(a: MenuComboItem, b: MenuComboItem) {
  const categoryA = a.type === "category" ? a.categoryName || a.category || "" : "";
  const categoryB = b.type === "category" ? b.categoryName || b.category || "" : "";
  return categoryA.localeCompare(categoryB) || (a.menuProductName || "").localeCompare(b.menuProductName || "");
}

type MenuWorkspaceTab = "products" | "combos";

type ComboWorkspaceProps = {
  menuProducts: MenuProduct[];
  onSaved: () => Promise<void>;
};

function ComboWorkspace({ menuProducts, onSaved }: ComboWorkspaceProps) {
  const availableProducts = menuProducts.filter((item) => item.kind !== "combo").sort(compareMenuProductByCategory);
  const combos = menuProducts.filter((item) => item.kind === "combo").sort(compareMenuProductByCategory);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ProductCategory>("hamburguesa");
  const [menuProductId, setMenuProductId] = useState(availableProducts[0]?.id || "");
  const [itemMode, setItemMode] = useState<"product" | "category">("product");
  const [itemCategory, setItemCategory] = useState<ProductCategory>("bebida");
  const [allowedMenuProductIds, setAllowedMenuProductIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState("1");
  const [comboItems, setComboItems] = useState<MenuComboItem[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selectedCombo = combos.find((item) => item.id === selectedId) || null;
  const parsedPrice = Math.max(0, Math.trunc(toNumber(price)));
  const categoryProducts = availableProducts.filter((item) => item.category === itemCategory).sort(compareMenuProductByCategory);

  function clearForm() {
    setSelectedId("");
    setName("");
    setPrice("");
    setDescription("");
    setCategory("hamburguesa");
    setComboItems([]);
    setAllowedMenuProductIds([]);
    setQuantity("1");
    setMessage("");
    setError("");
  }

  function selectCombo(combo: MenuProduct) {
    setSelectedId(combo.id);
    setName(combo.name);
    setPrice(String(combo.price));
    setDescription(combo.description || "");
    setCategory(combo.category === "combos" || !combo.category ? "hamburguesa" : combo.category);
    setComboItems(combo.comboItems || []);
    setMessage("");
    setError("");
  }

  function addComboItem() {
    const parsedQuantity = Math.trunc(toNumber(quantity));
    const menuProduct = availableProducts.find((item) => item.id === (menuProductId || availableProducts[0]?.id));
    const selectedAllowedIds = allowedMenuProductIds.filter((id) => categoryProducts.some((item) => item.id === id));
    if (parsedQuantity <= 0 || (itemMode === "product" && !menuProduct) || (itemMode === "category" && selectedAllowedIds.length === 0)) {
      setError("Selecciona un producto o categoria e ingresa una cantidad valida.");
      return;
    }
    setComboItems((current) => {
      if (itemMode === "category") {
        const existing = current.find((item) => item.type === "category" && item.category === itemCategory);
        const nextItem: MenuComboItem = { type: "category", category: itemCategory, categoryName: formatCategoryLabel(itemCategory), allowedMenuProductIds: selectedAllowedIds, quantity: parsedQuantity };
        return existing ? current.map((item) => (item === existing ? nextItem : item)) : [...current, nextItem];
      }
      const existing = current.find((item) => item.type === "product" && item.menuProductId === menuProduct!.id);
      const nextItem: MenuComboItem = { type: "product", menuProductId: menuProduct!.id, menuProductName: menuProduct!.name, quantity: parsedQuantity };
      return existing ? current.map((item) => (item === existing ? nextItem : item)) : [...current, nextItem];
    });
    setQuantity("1");
    setAllowedMenuProductIds([]);
    setError("");
  }

  function toggleAllowedProduct(productId: string) {
    setAllowedMenuProductIds((current) =>
      current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId],
    );
  }

  function updateComboItemQuantity(target: MenuComboItem, value: string) {
    const nextQuantity = Math.max(1, Math.trunc(toNumber(value)));
    setComboItems((current) => current.map((item) => (item === target ? { ...item, quantity: nextQuantity } : item)));
  }

  function toggleComboItemAllowedProduct(target: MenuComboItem, productId: string) {
    setComboItems((current) =>
      current.map((item) => {
        if (item !== target || item.type !== "category") return item;
        const allowedIds = item.allowedMenuProductIds || [];
        return {
          ...item,
          allowedMenuProductIds: allowedIds.includes(productId)
            ? allowedIds.filter((id) => id !== productId)
            : [...allowedIds, productId],
        };
      }),
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || parsedPrice <= 0 || comboItems.length === 0) {
      setError("Completa nombre, precio y al menos un producto para el combo.");
      return;
    }
    try {
      const draft = { name: name.trim(), price: parsedPrice, description: description.trim() || undefined, category, recipeItems: [], kind: "combo" as const, comboItems };
      const shouldCreateFromTemplate = selectedCombo && normalizeForSearch(selectedCombo.name) !== normalizeForSearch(name);
      const saved = selectedCombo && !shouldCreateFromTemplate
        ? await updateMenuProductApi(selectedCombo.id, draft)
        : await createMenuProductApi(draft);
      if (!saved) {
        setError("No se pudo guardar el combo seleccionado.");
        return;
      }
      await onSaved();
      setSelectedId(saved.id);
      setMessage(selectedCombo && !shouldCreateFromTemplate ? "Combo actualizado." : "Combo creado y disponible para vender.");
      setError("");
    } catch {
      setError("No se pudo guardar el combo.");
    }
  }

  async function removeSelected() {
    if (!selectedCombo) return;
    try {
      await deleteMenuProductApi(selectedCombo.id);
      clearForm();
      await onSaved();
      setMessage("Combo eliminado.");
    } catch {
      setError("No se pudo eliminar el combo.");
    }
  }

  return (
    <div className={styles.layout}>
      <section className={styles.formCard}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>{selectedCombo ? "Editar combo" : "Crear combo"}</h2>
          <div className={styles.headerActions}>
            <button type="button" className={styles.secondaryBtn} onClick={clearForm}>Nuevo</button>
            <button type="button" className={styles.dangerBtn} onClick={() => void removeSelected()} disabled={!selectedCombo}>Eliminar</button>
          </div>
        </div>
        <form className={styles.form} onSubmit={(event) => void submit(event)}>
          <label className={styles.field}><span>Nombre del combo</span><input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej: Hamburguesa doble + papas + bebida" /></label>
          <label className={styles.field}><span>Precio de venta</span><input className={styles.input} type="number" min={1} value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" /></label>
          <label className={styles.field}><span>Categoria del combo</span><select className={styles.input} value={category} onChange={(event) => setCategory(event.target.value as ProductCategory)}>{PRODUCT_CATEGORIES.filter((item) => item !== "combos").map((item) => <option key={item} value={item}>{formatCategoryLabel(item)}</option>)}</select></label>
          <label className={styles.field}><span>Descripcion</span><textarea className={styles.textarea} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Detalle visible para caja" /></label>
          <section className={styles.recipeEditor}>
            <h3 className={styles.sectionTitle}>Productos incluidos</h3>
            <p className={styles.meta}>Al vender el combo se descuenta la receta de cada producto incluido.</p>
            <div className={styles.comboControls}>
              <select className={styles.input} value={itemMode} onChange={(event) => setItemMode(event.target.value as "product" | "category")}>
                <option value="product">Producto fijo</option>
                <option value="category">Categoria a eleccion</option>
              </select>
              {itemMode === "product" ? <select className={styles.input} value={menuProductId || availableProducts[0]?.id || ""} onChange={(event) => setMenuProductId(event.target.value)}>
                <option value="">Seleccionar producto</option>
                {availableProducts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select> : <select className={styles.input} value={itemCategory} onChange={(event) => { setItemCategory(event.target.value as ProductCategory); setAllowedMenuProductIds([]); }}>{PRODUCT_CATEGORIES.filter((category) => category !== "combos").map((category) => <option key={category} value={category}>{formatCategoryLabel(category)}</option>)}</select>}
              <input className={styles.input} type="number" min={1} step={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Cantidad" />
              <div className={styles.unitPill}>unidades</div>
              <button type="button" className={styles.secondaryBtn} onClick={addComboItem}>Agregar</button>
            </div>
            {itemMode === "category" ? (
              <div className={styles.allowedProducts}>
                <div className={styles.allowedHeader}>
                  <strong>Productos permitidos</strong>
                  <button type="button" className={styles.miniBtn} onClick={() => setAllowedMenuProductIds(categoryProducts.map((item) => item.id))}>Todos</button>
                </div>
                {categoryProducts.length === 0 ? <p className={styles.empty}>No hay productos en esta categoria.</p> : categoryProducts.map((item) => (
                  <label key={item.id} className={styles.checkRow}>
                    <input type="checkbox" checked={allowedMenuProductIds.includes(item.id)} onChange={() => toggleAllowedProduct(item.id)} />
                    <span>{item.name}</span>
                  </label>
                ))}
              </div>
            ) : null}
            {comboItems.length === 0 ? <p className={styles.empty}>Todavia no agregaste productos al combo.</p> : <div className={styles.recipeList}>{[...comboItems].sort(compareComboItemByCategory).map((item) => {
              const itemProducts = item.type === "category" ? availableProducts.filter((product) => product.category === item.category).sort(compareMenuProductByCategory) : [];
              return <div key={item.type === "category" ? `category:${item.category}` : item.menuProductId} className={styles.recipeItem}><div><strong>{item.type === "category" ? `${item.categoryName} a eleccion` : item.menuProductName}</strong><span>{item.type === "category" ? `${(item.allowedMenuProductIds || []).length || "todos"} permitidos` : "Producto fijo"}</span>{item.type === "category" ? <div className={styles.inlineChecks}>{itemProducts.map((product) => <label key={product.id} className={styles.inlineCheck}><input type="checkbox" checked={(item.allowedMenuProductIds || []).includes(product.id)} onChange={() => toggleComboItemAllowedProduct(item, product.id)} /><span>{product.name}</span></label>)}</div> : null}</div><label className={styles.quantityEdit}><span>Cantidad</span><input type="number" min={1} step={1} value={item.quantity} onChange={(event) => updateComboItemQuantity(item, event.target.value)} /></label><button type="button" className={styles.removeBtn} onClick={() => setComboItems((current) => current.filter((entry) => entry !== item))}>Quitar</button></div>;
            })}</div>}
          </section>
          <div className={styles.previewGrid}><div><span>Precio</span><strong>{parsedPrice > 0 ? formatMoneyARS(parsedPrice) : "-"}</strong></div><div><span>Incluye</span><strong>{comboItems.length} productos</strong></div></div>
          {error ? <div className={styles.errorBox}>{error}</div> : null}
          {message ? <div className={styles.successBox}>{message}</div> : null}
          <div className={styles.actions}><button type="submit" className={styles.primaryBtn}>{selectedCombo ? "Guardar combo" : "Crear combo"}</button></div>
        </form>
      </section>
      <section className={styles.listCard}>
        <h2 className={styles.cardTitle}>Combos actuales</h2>
        {combos.length === 0 ? <p className={styles.empty}>No hay combos creados todavia.</p> : <div className={styles.menuList}>{combos.map((combo) => <button type="button" key={combo.id} className={`${styles.menuCard} ${selectedId === combo.id ? styles.menuCardActive : ""}`.trim()} onClick={() => selectCombo(combo)}><div className={styles.menuTop}><strong>{combo.name}</strong><span>{formatMoneyARS(combo.price)}</span></div>{combo.description ? <p className={styles.description}>{combo.description}</p> : null}<div className={styles.recipeChips}>{[...(combo.comboItems || [])].sort(compareComboItemByCategory).map((item) => <span key={item.type === "category" ? `category:${item.category}` : item.menuProductId}>{item.quantity}x {item.type === "category" ? `${item.categoryName} a eleccion (${(item.allowedMenuProductIds || []).length || "todos"})` : item.menuProductName}</span>)}</div></button>)}</div>}
      </section>
    </div>
  );
}

export default function MenuProductsScreen() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [menuProducts, setMenuProducts] = useState<MenuProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | ProductCategory>("all");
  const [activeTab, setActiveTab] = useState<MenuWorkspaceTab>("products");

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState<ProductCategory>("hamburguesa");
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

  useEffect(() => {
    const handler = () => {
      clearForm();
      void reload();
    };
    window.addEventListener(DATA_STORE_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DATA_STORE_CHANGED_EVENT, handler);
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
        if (item.kind === "combo") return false;
        if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
        if (!query) return true;
        return normalizeForSearch(`${item.name} ${item.category || ""} ${item.description || ""} ${item.recipeItems.map((recipe) => recipe.ingredientName).join(" ")}`).includes(query);
      })
      .sort(compareMenuProductByCategory);
  }, [categoryFilter, menuProducts, search]);

  const categoryCounts = useMemo(
    () =>
      PRODUCT_CATEGORIES.reduce(
        (acc, item) => {
          acc[item] = menuProducts.filter((product) => product.kind !== "combo" && product.category === item).length;
          return acc;
        },
        {} as Record<ProductCategory, number>,
      ),
    [menuProducts],
  );

  const isEditing = !!selectedMenuProduct;
  const parsedPrice = Math.max(0, Math.trunc(toNumber(price)));
  const currentAvailability = useMemo(
    () =>
      calculateAvailableServings(
        {
          id: selectedId || "draft",
          name,
          price: parsedPrice,
          category,
          description,
          recipeItems,
          createdAt: new Date().toISOString(),
        },
        ingredients,
      ),
    [category, description, ingredients, name, parsedPrice, recipeItems, selectedId],
  );

  function clearForm() {
    setSelectedId("");
    setName("");
    setPrice("");
    setCategory("hamburguesa");
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
    setCategory(item.category || "hamburguesa");
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

    const quantity = Math.trunc(toNumber(ingredientQuantity));
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

  function updateRecipeItemQuantity(ingredientIdToUpdate: string, value: string) {
    const nextQuantity = Math.max(1, Math.trunc(toNumber(value)));
    setRecipeItems((current) =>
      current.map((item) => (item.ingredientId === ingredientIdToUpdate ? { ...item, quantity: nextQuantity } : item)),
    );
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
        category,
        description: description.trim() || undefined,
        recipeItems,
      };
      const shouldCreateFromTemplate = selectedMenuProduct && normalizeForSearch(selectedMenuProduct.name) !== normalizeForSearch(trimmedName);
      const saved = selectedMenuProduct && !shouldCreateFromTemplate
        ? await updateMenuProductApi(selectedMenuProduct.id, draft)
        : await createMenuProductApi(draft);
      if (!saved) {
        setError("No se pudo guardar el producto de menu seleccionado.");
        return;
      }
      await reload(saved.id);
      selectMenuProduct(saved);
      setMessage(selectedMenuProduct && !shouldCreateFromTemplate ? "Producto de menu actualizado." : "Producto de menu creado.");
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

        <div className={styles.tabs} role="tablist" aria-label="Administracion del menu">
          <button type="button" role="tab" aria-selected={activeTab === "products"} className={`${styles.tabBtn} ${activeTab === "products" ? styles.tabBtnActive : ""}`.trim()} onClick={() => setActiveTab("products")}>Productos de menu</button>
          <button type="button" role="tab" aria-selected={activeTab === "combos"} className={`${styles.tabBtn} ${activeTab === "combos" ? styles.tabBtnActive : ""}`.trim()} onClick={() => setActiveTab("combos")}>Combos</button>
        </div>

        {activeTab === "products" ? (
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
                <span>Categoria</span>
                <select className={styles.input} value={category} onChange={(event) => setCategory(event.target.value as ProductCategory)}>
                  {PRODUCT_CATEGORIES.map((option) => (
                    <option key={option} value={option}>
                      {formatCategoryLabel(option)}
                    </option>
                  ))}
                </select>
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
                    {[...ingredients].sort(compareIngredientByGroup).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} - stock {formatIngredientQuantity(item.stockQuantity, item.stockMode)}
                      </option>
                    ))}
                  </select>
                  <div className={styles.unitPill}>{selectedIngredient ? getIngredientQuantityUnitLabel(selectedIngredient.stockMode) : "-"}</div>
                  <input
                    className={styles.input}
                    type="number"
                    min={1}
                    step="1"
                    value={ingredientQuantity}
                    onChange={(event) => setIngredientQuantity(event.target.value)}
                    placeholder={selectedIngredient?.stockMode === "weight" ? "Gramos" : "Cantidad"}
                  />
                  <button type="button" className={styles.secondaryBtn} onClick={addRecipeItem}>Agregar</button>
                </div>

                {recipeItems.length === 0 ? (
                  <p className={styles.empty}>Todavia no agregaste ingredientes.</p>
                ) : (
                  <div className={styles.recipeList}>
                    {[...recipeItems].sort(compareRecipeItemByGroup).map((item) => (
                      <div key={item.ingredientId} className={styles.recipeItem}>
                        <div>
                          <strong>{item.ingredientName}</strong>
                          <span>{getRecipeLineLabel(item)}</span>
                        </div>
                        <label className={styles.quantityEdit}>
                          <span>{getIngredientQuantityUnitLabel(item.stockMode)}</span>
                          <input type="number" min={1} step={1} value={item.quantity} onChange={(event) => updateRecipeItemQuantity(item.ingredientId, event.target.value)} />
                        </label>
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

            <div className={styles.categoryFilters} aria-label="Categorias del menu">
              <button
                type="button"
                className={`${styles.categoryFilterBtn} ${categoryFilter === "all" ? styles.categoryFilterBtnActive : ""}`.trim()}
                onClick={() => setCategoryFilter("all")}
              >
                Todas <span>{menuProducts.filter((item) => item.kind !== "combo").length}</span>
              </button>
              {PRODUCT_CATEGORIES.map((option) => (
                <button
                  type="button"
                  key={option}
                  className={`${styles.categoryFilterBtn} ${categoryFilter === option ? styles.categoryFilterBtnActive : ""}`.trim()}
                  onClick={() => setCategoryFilter(option)}
                >
                  {formatCategoryLabel(option)} <span>{categoryCounts[option] || 0}</span>
                </button>
              ))}
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
                      <p className={styles.meta}>Categoria: {formatCategoryLabel(item.category || "hamburguesa")}</p>
                      {item.description ? <p className={styles.description}>{item.description}</p> : null}
                      <p className={styles.meta}>{item.recipeItems.length} ingredientes - {servings === null ? "-" : servings} porciones posibles</p>
                      <div className={styles.recipeChips}>
                        {[...item.recipeItems].sort(compareRecipeItemByGroup).map((recipe) => (
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
        ) : (
          <ComboWorkspace menuProducts={menuProducts} onSaved={async () => reload()} />
        )}
      </div>
    </div>
  );
}
