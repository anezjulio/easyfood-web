import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { formatMoneyARS } from "../../../shared/format/locale";
import { normalizeForSearch } from "../../../shared/search/search";
import { DATA_STORE_CHANGED_EVENT } from "../../data/service/data.api";
import { formatIngredientQuantity, type Ingredient } from "../../ingredient/model/ingredient.types";
import type { ProductCategory } from "../../product/model/product.types";
import { fetchIngredientsApi } from "../../ingredient/service/ingredient.api";
import type { MenuCategory } from "../model/menu-category.types";
import type { MenuComboItem, MenuProduct, MenuRecipeItem } from "../model/menu.types";
import { createMenuCategoryApi, deleteMenuCategoryApi, fetchMenuCategoriesApi, updateMenuCategoryApi } from "../service/menu-category.api";
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

function formatCategoryLabel(category: ProductCategory, categories: MenuCategory[] = []) {
  return categories.find((item) => item.id === category)?.name || category.charAt(0).toUpperCase() + category.slice(1);
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

function groupMenuProductsByCategory(products: MenuProduct[], categories: MenuCategory[]) {
  const rows = categories.map((category) => ({
    category,
    products: products.filter((item) => item.category === category.id).sort(compareMenuProductByCategory),
  }));
  const uncategorized = products.filter((item) => !item.category || !categories.some((category) => category.id === item.category));
  return [
    ...(uncategorized.length
      ? [{ category: { id: "", name: "Sin categoria", createdAt: "" }, products: uncategorized.sort(compareMenuProductByCategory) }]
      : []),
    ...rows.filter((row) => row.products.length > 0),
  ];
}

function compareComboItemByCategory(a: MenuComboItem, b: MenuComboItem) {
  const categoryA = a.type === "category" ? a.categoryName || a.category || "" : "";
  const categoryB = b.type === "category" ? b.categoryName || b.category || "" : "";
  return categoryA.localeCompare(categoryB) || (a.menuProductName || "").localeCompare(b.menuProductName || "");
}

type MenuWorkspaceTab = "products" | "combos" | "categories";

type ComboWorkspaceProps = {
  categories: MenuCategory[];
  menuProducts: MenuProduct[];
  onSaved: () => Promise<void>;
};

function ComboWorkspace({ categories, menuProducts, onSaved }: ComboWorkspaceProps) {
  const assignableCategories = categories.filter((item) => item.id !== "combos");
  const availableProducts = menuProducts.filter((item) => item.kind !== "combo").sort(compareMenuProductByCategory);
  const combos = menuProducts.filter((item) => item.kind === "combo").sort(compareMenuProductByCategory);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [renameSelected, setRenameSelected] = useState(false);
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ProductCategory>(assignableCategories[0]?.id || "hamburguesa");
  const [itemMode, setItemMode] = useState<"product" | "category">("product");
  const [itemCategory, setItemCategory] = useState<ProductCategory>(assignableCategories[0]?.id || "bebida");
  const [allowedMenuProductIds, setAllowedMenuProductIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState("1");
  const [comboItems, setComboItems] = useState<MenuComboItem[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selectedCombo = combos.find((item) => item.id === selectedId) || null;
  const parsedPrice = Math.max(0, Math.trunc(toNumber(price)));
  const categoryProducts = availableProducts.filter((item) => item.category === itemCategory).sort(compareMenuProductByCategory);
  const groupedProducts = groupMenuProductsByCategory(availableProducts, assignableCategories);

  function clearForm() {
    setSelectedId("");
    setName("");
    setRenameSelected(false);
    setPrice("");
    setDescription("");
    setCategory(assignableCategories[0]?.id || "hamburguesa");
    setComboItems([]);
    setAllowedMenuProductIds([]);
    setQuantity("1");
    setMessage("");
    setError("");
  }

  function selectCombo(combo: MenuProduct) {
    setSelectedId(combo.id);
    setName(combo.name);
    setRenameSelected(false);
    setPrice(String(combo.price));
    setDescription(combo.description || "");
    setCategory(combo.category === "combos" || !combo.category ? "hamburguesa" : combo.category);
    setComboItems(combo.comboItems || []);
    setMessage("");
    setError("");
  }

  function addComboItem() {
    const parsedQuantity = Math.trunc(toNumber(quantity));
    const selectedAllowedIds = allowedMenuProductIds.filter((id) => categoryProducts.some((item) => item.id === id));
    if (parsedQuantity <= 0 || selectedAllowedIds.length === 0) {
      setError("Selecciona una categoria e ingresa una cantidad valida.");
      return;
    }
    setComboItems((current) => {
      const existing = current.find((item) => item.type === "category" && item.category === itemCategory);
      const nextItem: MenuComboItem = { type: "category", category: itemCategory, categoryName: formatCategoryLabel(itemCategory, categories), allowedMenuProductIds: selectedAllowedIds, quantity: parsedQuantity };
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

  function addProductComboItem(menuProduct: MenuProduct) {
    setComboItems((current) => {
      const existing = current.find((item) => item.type === "product" && item.menuProductId === menuProduct.id);
      if (existing) {
        return current.map((item) => (item === existing ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [
        ...current,
        { type: "product", menuProductId: menuProduct.id, menuProductName: menuProduct.name, quantity: 1 },
      ];
    });
    setError("");
  }

  function changeComboItemQuantity(target: MenuComboItem, amount: number) {
    setComboItems((current) =>
      current
        .map((item) => (item === target ? { ...item, quantity: Math.max(0, item.quantity + amount) } : item))
        .filter((item) => item.quantity > 0),
    );
  }

  function getComboProductQuantity(menuProductIdToFind: string) {
    return comboItems.find((item) => item.type === "product" && item.menuProductId === menuProductIdToFind)?.quantity || 0;
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
      const shouldCreateFromTemplate = selectedCombo && normalizeForSearch(selectedCombo.name) !== normalizeForSearch(name) && !renameSelected;
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
          <div className={styles.nameRow}>
            <label className={styles.field}><span>Nombre del combo</span><input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej: Hamburguesa doble + papas + bebida" /></label>
            <label className={styles.inlineToggle}><input type="checkbox" checked={renameSelected} onChange={(event) => setRenameSelected(event.target.checked)} disabled={!selectedCombo} />Modificar</label>
          </div>
          <label className={styles.field}><span>Precio de venta</span><input className={styles.input} type="number" min={1} value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" /></label>
          <label className={styles.field}><span>Categoria del combo</span><select className={styles.input} value={category} onChange={(event) => setCategory(event.target.value)}>{assignableCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className={styles.field}><span>Descripcion</span><textarea className={styles.textarea} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Detalle visible para caja" /></label>
          <section className={styles.recipeEditor}>
            <h3 className={styles.sectionTitle}>Productos incluidos</h3>
            <p className={styles.meta}>Al vender el combo se descuenta la receta de cada producto incluido.</p>
            <div className={styles.comboModeRow}>
              <select className={styles.input} value={itemMode} onChange={(event) => setItemMode(event.target.value as "product" | "category")}>
                <option value="product">Producto fijo</option>
                <option value="category">Categoria a eleccion</option>
              </select>
            </div>
            {itemMode === "product" ? (
              <div className={styles.groupedPicker}>
                {groupedProducts.map((group) => (
                  <section key={group.category.id || "none"} className={styles.pickGroup}>
                    <h4>{group.category.name}</h4>
                    <div className={styles.chipPickerGrid}>
                      {group.products.map((item) => {
                        const selectedQuantity = getComboProductQuantity(item.id);
                        const selectedItem = comboItems.find((entry) => entry.type === "product" && entry.menuProductId === item.id);
                        return (
                          <div key={item.id} className={`${styles.productPickChip} ${selectedQuantity > 0 ? styles.productPickChipActive : ""}`.trim()}>
                            <button type="button" onClick={() => addProductComboItem(item)}>{item.name} <strong>{selectedQuantity}</strong></button>
                            <button type="button" onClick={() => selectedItem && changeComboItemQuantity(selectedItem, -1)} disabled={!selectedItem}>-</button>
                            <button type="button" onClick={() => addProductComboItem(item)}>+</button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className={styles.allowedProducts}>
                <select className={styles.input} value={itemCategory} onChange={(event) => { setItemCategory(event.target.value); setAllowedMenuProductIds([]); }}>{assignableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
                <input className={styles.input} type="number" min={1} step={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Cantidad" />
                <button type="button" className={styles.secondaryBtn} onClick={addComboItem}>Agregar categoria</button>
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
            )}
            {comboItems.length === 0 ? <p className={styles.empty}>Todavia no agregaste productos al combo.</p> : <div className={styles.selectedChipList}>{[...comboItems].sort(compareComboItemByCategory).map((item) => {
              const itemProducts = item.type === "category" ? availableProducts.filter((product) => product.category === item.category).sort(compareMenuProductByCategory) : [];
              return <div key={item.type === "category" ? `category:${item.category}` : item.menuProductId} className={styles.selectedChip}><span>{item.quantity}x {item.type === "category" ? `${item.categoryName} a eleccion` : item.menuProductName}</span><button type="button" onClick={() => changeComboItemQuantity(item, -1)}>-</button><button type="button" onClick={() => changeComboItemQuantity(item, 1)}>+</button><button type="button" onClick={() => setComboItems((current) => current.filter((entry) => entry !== item))}>X</button>{item.type === "category" ? <div className={styles.inlineChecks}>{itemProducts.map((product) => <label key={product.id} className={styles.inlineCheck}><input type="checkbox" checked={(item.allowedMenuProductIds || []).includes(product.id)} onChange={() => toggleComboItemAllowedProduct(item, product.id)} /><span>{product.name}</span></label>)}</div> : null}</div>;
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

type CategoryWorkspaceProps = {
  categories: MenuCategory[];
  menuProducts: MenuProduct[];
  onSaved: () => Promise<void>;
};

function CategoryWorkspace({ categories, menuProducts, onSaved }: CategoryWorkspaceProps) {
  const assignableProducts = menuProducts.sort(compareMenuProductByCategory);
  const [selectedId, setSelectedId] = useState(categories[0]?.id || "");
  const [expandedProductId, setExpandedProductId] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selectedCategory = categories.find((item) => item.id === selectedId) || null;
  const assignedProducts = assignableProducts.filter((item) => item.category === selectedId);
  const unassignedProducts = assignableProducts.filter((item) => item.category !== selectedId);
  const groupedAssignedProducts = groupMenuProductsByCategory(assignedProducts, categories).filter((group) => group.category.id !== "");
  const groupedAvailableProducts = groupMenuProductsByCategory(unassignedProducts, categories);

  function clearForm() {
    setSelectedId("");
    setExpandedProductId("");
    setName("");
    setMessage("");
    setError("");
  }

  function selectCategory(category: MenuCategory) {
    setSelectedId(category.id);
    setExpandedProductId("");
    setName(category.name);
    setMessage("");
    setError("");
  }

  async function saveCategory(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return setError("Ingresa el nombre de la categoria.");
    try {
      const saved = selectedCategory
        ? await updateMenuCategoryApi(selectedCategory.id, { name: trimmedName })
        : await createMenuCategoryApi({ name: trimmedName });
      if (!saved) return setError("No se pudo guardar la categoria.");
      await onSaved();
      setSelectedId(saved.id);
      setName(saved.name);
      setMessage(selectedCategory ? "Categoria actualizada." : "Categoria creada.");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la categoria.");
    }
  }

  async function removeSelectedCategory() {
    if (!selectedCategory) return;
    try {
      const removed = await deleteMenuCategoryApi(selectedCategory.id);
      if (!removed) return setError("No se pudo eliminar la categoria.");
      clearForm();
      await onSaved();
      setMessage("Categoria eliminada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la categoria.");
    }
  }

  async function moveMenuProduct(item: MenuProduct, category: ProductCategory) {
    try {
      const updated = await updateMenuProductApi(item.id, { ...item, category });
      if (!updated) return setError("No se pudo actualizar el producto.");
      await onSaved();
      setExpandedProductId("");
      setMessage("Asignacion actualizada.");
      setError("");
    } catch {
      setError("No se pudo actualizar la asignacion.");
    }
  }

  function renderProductChips(items: MenuProduct[], mode: "assigned" | "available") {
    return (
      <div className={styles.assignmentChips}>
        {items.map((item) => (
          <div key={item.id} className={styles.assignmentChipWrap}>
            <button type="button" className={styles.assignmentChip} onClick={() => setExpandedProductId((current) => (current === item.id ? "" : item.id))}>
              {item.name}
            </button>
            {expandedProductId === item.id ? (
              <div className={styles.assignmentInlineEditor}>
                <select className={styles.input} value={item.category || ""} onChange={(event) => void moveMenuProduct(item, event.target.value)}>
                  <option value="">Sin categoria</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
                {mode === "assigned" ? <button type="button" className={styles.removeBtn} onClick={() => void moveMenuProduct(item, "")}>-</button> : null}
                {mode === "available" ? <button type="button" className={styles.secondaryBtn} disabled={!selectedId} onClick={() => void moveMenuProduct(item, selectedId)}>Asignar</button> : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.categoryLayout}>
      <section className={styles.formCard}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>{selectedCategory ? "Editar categoria" : "Crear categoria"}</h2>
          <div className={styles.headerActions}>
            <button type="button" className={styles.secondaryBtn} onClick={clearForm}>Nueva</button>
            <button type="button" className={styles.dangerBtn} onClick={() => void removeSelectedCategory()} disabled={!selectedCategory || assignedProducts.length > 0}>Eliminar</button>
          </div>
        </div>
        <form className={styles.form} onSubmit={(event) => void saveCategory(event)}>
          <label className={styles.field}>
            <span>Nombre</span>
            <input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej: Promos" />
          </label>
          {assignedProducts.length > 0 ? <p className={styles.meta}>Desvincula los productos antes de eliminar.</p> : null}
          {error ? <div className={styles.errorBox}>{error}</div> : null}
          {message ? <div className={styles.successBox}>{message}</div> : null}
          <div className={styles.actions}>
            <button type="submit" className={styles.primaryBtn}>{selectedCategory ? "Guardar categoria" : "Crear categoria"}</button>
          </div>
        </form>
        <div className={styles.categoryChipList}>
          {categories.map((category) => (
            <button type="button" key={category.id} className={`${styles.pickChip} ${selectedId === category.id ? styles.pickChipActive : ""}`.trim()} onClick={() => selectCategory(category)}>
              {category.name} <strong>{menuProducts.filter((item) => item.category === category.id).length}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.listCard}>
        <h2 className={styles.cardTitle}>Productos</h2>
        <div className={styles.assignmentColumn}>
          <h3 className={styles.sectionTitle}>Asignados</h3>
          {groupedAssignedProducts.length === 0 ? <p className={styles.empty}>No hay productos ni combos en esta categoria.</p> : groupedAssignedProducts.map((group) => (
            <section key={group.category.id} className={styles.pickGroup}>
              <h4>{group.category.name}</h4>
              {renderProductChips(group.products, "assigned")}
            </section>
          ))}

          <h3 className={styles.sectionTitle}>Disponibles</h3>
          {groupedAvailableProducts.length === 0 ? <p className={styles.empty}>Todos estan asignados a esta categoria.</p> : groupedAvailableProducts.map((group) => (
            <section key={group.category.id || "none"} className={styles.pickGroup}>
              <h4>{group.category.name}</h4>
              {renderProductChips(group.products, "available")}
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function MenuProductsScreen() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuProducts, setMenuProducts] = useState<MenuProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | ProductCategory>("all");
  const [activeTab, setActiveTab] = useState<MenuWorkspaceTab>("products");

  const [name, setName] = useState("");
  const [renameSelectedMenuProduct, setRenameSelectedMenuProduct] = useState(false);
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState<ProductCategory>("hamburguesa");
  const [description, setDescription] = useState("");
  const [recipeItems, setRecipeItems] = useState<MenuRecipeItem[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const reload = useCallback(async (nextSelectedId?: string) => {
    setLoading(true);
    setError("");
    try {
      const [ingredientList, menuList, categoryList] = await Promise.all([
        fetchIngredientsApi(),
        fetchMenuProductsApi(),
        fetchMenuCategoriesApi(),
      ]);
      setIngredients(ingredientList);
      setMenuProducts(menuList);
      setCategories(categoryList);
      if (typeof nextSelectedId === "string") setSelectedId(nextSelectedId);
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
      setSelectedId("");
      setName("");
      setRenameSelectedMenuProduct(false);
      setPrice("");
      setCategory("hamburguesa");
      setDescription("");
      setRecipeItems([]);
      setMessage("");
      setError("");
      void reload();
    };
    window.addEventListener(DATA_STORE_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DATA_STORE_CHANGED_EVENT, handler);
  }, [reload]);

  const selectedMenuProduct = useMemo(
    () => menuProducts.find((item) => item.id === selectedId) || null,
    [menuProducts, selectedId],
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
      categories.reduce(
        (acc, item) => {
          acc[item.id] = menuProducts.filter((product) => product.kind !== "combo" && product.category === item.id).length;
          return acc;
        },
        {} as Record<ProductCategory, number>,
      ),
    [categories, menuProducts],
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
    setRenameSelectedMenuProduct(false);
    setPrice("");
    setCategory(categories[0]?.id || "hamburguesa");
    setDescription("");
    setRecipeItems([]);
    setMessage("");
    setError("");
  }

  function selectMenuProduct(item: MenuProduct) {
    setSelectedId(item.id);
    setName(item.name);
    setRenameSelectedMenuProduct(false);
    setPrice(String(item.price || ""));
    setCategory(item.category || "hamburguesa");
    setDescription(item.description || "");
    setRecipeItems(item.recipeItems);
    setMessage("");
    setError("");
  }

  function addRecipeItem(ingredient: Ingredient, amount = 1) {
    setError("");
    setMessage("");
    const quantity = amount;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Ingresa una cantidad valida para la receta.");
      return;
    }

    const nextItem: MenuRecipeItem = {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      quantity,
      stockMode: ingredient.stockMode,
    };

    setRecipeItems((current) => {
      const existingIndex = current.findIndex((item) => item.ingredientId === ingredient.id);
      if (existingIndex < 0) return [...current, nextItem];
      return current.map((item, index) => (index === existingIndex ? { ...item, quantity: item.quantity + quantity } : item));
    });
  }

  function incrementRecipeItemQuantity(item: MenuRecipeItem) {
    setRecipeItems((current) =>
      current.map((entry) => (entry.ingredientId === item.ingredientId ? { ...entry, quantity: entry.quantity + 1 } : entry)),
    );
  }

  function decrementRecipeItemQuantity(item: MenuRecipeItem) {
    setRecipeItems((current) =>
      current
        .map((entry) => (entry.ingredientId === item.ingredientId ? { ...entry, quantity: Math.max(0, entry.quantity - 1) } : entry))
        .filter((entry) => entry.quantity > 0),
    );
  }

  function getRecipeItemQuantity(ingredientIdToFind: string) {
    return recipeItems.find((item) => item.ingredientId === ingredientIdToFind)?.quantity || 0;
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
        category,
        description: description.trim() || undefined,
        recipeItems,
      };
      const shouldCreateFromTemplate = selectedMenuProduct && normalizeForSearch(selectedMenuProduct.name) !== normalizeForSearch(trimmedName) && !renameSelectedMenuProduct;
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
          <button type="button" role="tab" aria-selected={activeTab === "categories"} className={`${styles.tabBtn} ${activeTab === "categories" ? styles.tabBtnActive : ""}`.trim()} onClick={() => setActiveTab("categories")}>Categorias</button>
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
              <div className={styles.nameRow}>
                <label className={styles.field}>
                  <span>Nombre</span>
                  <input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej: Hamburguesa doble" />
                </label>
                <label className={styles.inlineToggle}><input type="checkbox" checked={renameSelectedMenuProduct} onChange={(event) => setRenameSelectedMenuProduct(event.target.checked)} disabled={!selectedMenuProduct} />Modificar</label>
              </div>

              <label className={styles.field}>
                <span>Precio de venta</span>
                <input className={styles.input} type="number" min={1} value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" />
              </label>

              <label className={styles.field}>
                <span>Categoria</span>
                <select className={styles.input} value={category} onChange={(event) => setCategory(event.target.value)}>
                  {categories.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
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
                <div className={styles.chipPickerGrid}>
                  {[...ingredients].sort(compareIngredientByGroup).map((item) => {
                    const selectedQuantity = getRecipeItemQuantity(item.id);
                    return (
                      <button type="button" key={item.id} className={`${styles.pickChip} ${selectedQuantity > 0 ? styles.pickChipActive : ""}`.trim()} onClick={() => addRecipeItem(item)}>
                        {item.name} <strong>{selectedQuantity}</strong>
                      </button>
                    );
                  })}
                </div>

                {recipeItems.length === 0 ? (
                  <p className={styles.empty}>Todavia no agregaste ingredientes.</p>
                ) : (
                  <div className={styles.recipeConfirmList} aria-label="Ingredientes seleccionados">
                    {[...recipeItems].sort(compareRecipeItemByGroup).map((item) => (
                      <div key={item.ingredientId} className={styles.recipeConfirmItem}>
                        <span>{item.ingredientName}</span>
                        <strong>{formatIngredientQuantity(item.quantity, item.stockMode)}</strong>
                        <button type="button" onClick={() => decrementRecipeItemQuantity(item)}>-</button>
                        <button type="button" onClick={() => incrementRecipeItemQuantity(item)}>+</button>
                        <button type="button" onClick={() => removeRecipeItem(item.ingredientId)}>X</button>
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
              {categories.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={`${styles.categoryFilterBtn} ${categoryFilter === option.id ? styles.categoryFilterBtnActive : ""}`.trim()}
                  onClick={() => setCategoryFilter(option.id)}
                >
                  {option.name} <span>{categoryCounts[option.id] || 0}</span>
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
                      <p className={styles.menuCompactMeta}>
                        {formatCategoryLabel(item.category || "hamburguesa", categories)} - {item.recipeItems.length} ingredientes - {servings === null ? "-" : servings} porciones
                      </p>
                      {item.description ? <p className={styles.description}>{item.description}</p> : null}
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
        ) : activeTab === "combos" ? (
          <ComboWorkspace categories={categories} menuProducts={menuProducts} onSaved={async () => reload()} />
        ) : (
          <CategoryWorkspace categories={categories} menuProducts={menuProducts} onSaved={async () => reload()} />
        )}
      </div>
    </div>
  );
}
