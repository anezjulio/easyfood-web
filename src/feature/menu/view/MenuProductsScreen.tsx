import { getCategoryOrder } from "../../../shared/category/category-order";
import type React from "react";
import { isRecipeIngredientRequired } from "../../../shared/recipe/ingredient-rules";
import { useCallback, useEffect, useMemo, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { formatMoneyARS } from "../../../shared/format/locale";
import { normalizeForSearch } from "../../../shared/search/search";
import { DATA_STORE_CHANGED_EVENT } from "../../data/service/data.api";
import { formatIngredientQuantity, type Ingredient, type IngredientCategory } from "../../ingredient/model/ingredient.types";
import type { ProductCategory } from "../../product/model/product.types";
import { fetchIngredientCategoriesApi, fetchIngredientsApi } from "../../ingredient/service/ingredient.api";
import type { MenuCategory } from "../model/menu-category.types";
import type { MenuComboItem, MenuProduct, MenuRecipeItem } from "../model/menu.types";
import { createMenuCategoryApi, deleteMenuCategoryApi, fetchMenuCategoriesApi, updateMenuCategoryApi } from "../service/menu-category.api";
import { createMenuProductApi, deleteMenuProductApi, fetchMenuProductsApi, updateMenuProductApi } from "../service/menu.api";
import styles from "./MenuProductsScreen.module.css";

function toNumber(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
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

function getIngredientRecipeStep(ingredient: Ingredient): number {
  return ingredient.stockMode === "weight" ? Math.max(1, Number(ingredient.portionSizeGrams) || 1) : 1;
}

function compareMenuProductByCategory(a: MenuProduct, b: MenuProduct) {
  return (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name);
}

function menuProductHasCategory(product: MenuProduct, categoryId: string) {
  return product.category === categoryId || !!product.categoryIds?.includes(categoryId);
}

function assignMenuProductCategory(item: MenuProduct, category: ProductCategory) {
  const secondaryCategories = (item.categoryIds || []).filter((id) => id !== item.category && id !== category);
  return updateMenuProductApi(item.id, { ...item, category, categoryIds: [category, ...secondaryCategories] });
}

function groupMenuProductsByCategory(products: MenuProduct[], categories: MenuCategory[]) {
  const rows = categories.map((category) => ({
    category,
    products: products.filter((item) => menuProductHasCategory(item, category.id)).sort(compareMenuProductByCategory),
  }));
  const uncategorized = products.filter((item) => !categories.some((category) => menuProductHasCategory(item, category.id)));
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
  onSaved: (saved?: MenuProduct) => Promise<void>;
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
  const categoryProducts = availableProducts.filter((item) => menuProductHasCategory(item, itemCategory)).sort(compareMenuProductByCategory);
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
      selectCombo(saved);
      await onSaved(saved);
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
    <div className={`${styles.layout} ${styles.productsLayout} ${styles.comboLayout}`}>
      <section className={styles.formCard}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>{selectedCombo ? "Editar combo" : "Crear combo"}</h2>
          <div className={styles.headerActions}>
            <button type="button" className={styles.secondaryBtn} onClick={clearForm}>Nuevo</button>
            <button type="button" className={styles.dangerBtn} onClick={() => void removeSelected()} disabled={!selectedCombo}>Eliminar</button>
          </div>
        </div>
        <form className={styles.form} onSubmit={(event) => void submit(event)}>
          <div className={styles.productFields}>
            <label className={styles.field}><span>1- Nombre</span><input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej: Hamburguesa doble + papas + bebida" /></label>
          <label className={styles.field}><span>2- Precio venta</span><input className={styles.input} type="number" min={1} value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" /></label>
          <label className={styles.field}><span>3- Categoria</span><select className={styles.input} value={category} onChange={(event) => setCategory(event.target.value)}>{assignableCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div className={styles.nameRow}>
          <label className={styles.field}><span>4- Descripcion</span><textarea className={styles.textarea} rows={1} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Detalle visible para caja" /></label>
          <label className={styles.inlineToggle}><input type="checkbox" checked={renameSelected} onChange={(event) => setRenameSelected(event.target.checked)} disabled={!selectedCombo} />Modificar</label>
          </div>
          </div>
          <section className={styles.recipeEditor}>
            <h3 className={styles.sectionTitle}>5- Seleccion de productos</h3>
            <div className={styles.comboModeButtons} role="group" aria-label="Tipo de producto del combo">
              <button type="button" className={`${styles.tabBtn} ${itemMode === "product" ? styles.tabBtnActive : ""}`} aria-pressed={itemMode === "product"} onClick={() => setItemMode("product")}>Producto fijo</button>
              <button type="button" className={`${styles.tabBtn} ${itemMode === "category" ? styles.tabBtnActive : ""}`} aria-pressed={itemMode === "category"} onClick={() => setItemMode("category")}>Categoria a eleccion</button>
            </div>
            {itemMode === "product" ? (
              <div className={styles.groupedPicker}>
                {groupedProducts.map((group) => (
                  <section key={group.category.id || "none"} className={styles.pickGroup}>
                    <h4>{group.category.name} ({group.products.length})</h4>
                    <div className={`${styles.chipPickerGrid} ${styles.ingredientScrollList}`} tabIndex={group.products.length > 7 ? 0 : undefined} aria-label={`Productos de ${group.category.name}`}>
                      {group.products.map((item) => {
                        const selectedQuantity = getComboProductQuantity(item.id);
                        return (
                          <div key={item.id} className={`${styles.productPickChip} ${selectedQuantity > 0 ? styles.productPickChipActive : ""}`.trim()}>
                            <button type="button" onClick={() => addProductComboItem(item)}>{item.name} <strong>{selectedQuantity}</strong></button>
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
          </section>
          <section className={styles.recipeEditor} aria-labelledby="combo-included-products-title">
            <h3 id="combo-included-products-title" className={styles.sectionTitle}>6- Productos incluidos</h3>
            {comboItems.length === 0 ? <p className={styles.empty}>Todavia no agregaste productos al combo.</p> : <div className={styles.recipeConfirmList} role="list" aria-label="Productos seleccionados">{comboItems.map((item) => {
              const itemProducts = item.type === "category" ? availableProducts.filter((product) => item.category ? menuProductHasCategory(product, item.category) : false).sort(compareMenuProductByCategory) : [];
              const itemName = item.type === "category" ? item.categoryName + " a eleccion" : item.menuProductName;
              return (
                <div key={item.type === "category" ? "category:" + item.category : item.menuProductId} role="listitem" className={styles.recipeConfirmItem + " " + styles.comboConfirmItem}>
                  <div className={styles.recipeIngredientLabel}><span>{itemName}</span><span className={styles.recipeLeader} aria-hidden="true" /></div>
                  <output className={styles.recipeQuantity} aria-label={"Cantidad de " + itemName}>{item.quantity} u.</output>
                  <button type="button" className={styles.recipeSubtractButton} aria-label={"Restar " + itemName} onClick={() => changeComboItemQuantity(item, -1)}>{"\u2212"}</button>
                  <button type="button" className={styles.comboAddButton} aria-label={"Agregar " + itemName} onClick={() => changeComboItemQuantity(item, 1)}>+</button>
                  <button type="button" className={styles.recipeRemoveButton} aria-label={"Quitar " + itemName} onClick={() => setComboItems((current) => current.filter((entry) => entry !== item))}>X</button>
                  {item.type === "category" ? <div className={styles.comboAllowedChecks}>{itemProducts.map((product) => <label key={product.id} className={styles.inlineCheck}><input type="checkbox" checked={(item.allowedMenuProductIds || []).includes(product.id)} onChange={() => toggleComboItemAllowedProduct(item, product.id)} /><span>{product.name}</span></label>)}</div> : null}
                </div>
              );
            })}</div>}
          </section>
          <div className={styles.previewGrid}><div><span>Precio</span><strong>{parsedPrice > 0 ? formatMoneyARS(parsedPrice) : "-"}</strong></div><div><span>Incluye</span><strong>{comboItems.length} productos</strong></div></div>
          {error ? <div className={styles.errorBox}>{error}</div> : null}
          {message ? <div className={styles.successBox}>{message}</div> : null}
          <div className={styles.productFormActions}><button type="submit" className={styles.primaryBtn}>{selectedCombo ? "Guardar combo" : "7- Crear combo"}</button></div>
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
  const assignableProducts = [...menuProducts].sort(compareMenuProductByCategory);
  const [selectedId, setSelectedId] = useState("");
  const [expandedProductId, setExpandedProductId] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [order, setOrder] = useState("1000");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selectedCategory = categories.find((item) => item.id === selectedId) || null;
  const assignedProducts = assignableProducts.filter((item) => menuProductHasCategory(item, selectedId));
  const groupedAssignedProducts = groupMenuProductsByCategory(assignedProducts, categories).filter((group) => group.category.id !== "");
  const groupedAvailableProducts = groupMenuProductsByCategory(assignableProducts, categories);

  function clearForm() {
    setSelectedId("");
    setExpandedProductId("");
    setSelectedProductIds([]);
    setName("");
    setOrder("1000");
    setMessage("");
    setError("");
  }

  function selectCategory(category: MenuCategory) {
    setSelectedId(category.id);
    setExpandedProductId("");
    setSelectedProductIds([]);
    setName(category.name);
    setOrder(String(getCategoryOrder(category)));
    setMessage("");
    setError("");
  }

  function toggleSelectedProduct(productId: string) {
    setSelectedProductIds((current) =>
      current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId],
    );
  }

  async function saveCategoryChanges() {
    const trimmedName = name.trim();
    if (!trimmedName) return setError("Ingresa el nombre de la categoria.");
    const parsedOrder = Number(order);
    if (!order.trim() || !Number.isInteger(parsedOrder) || parsedOrder < 0) return setError("Ingresa un orden entero mayor o igual a cero.");
    try {
      const saved = selectedCategory
        ? await updateMenuCategoryApi(selectedCategory.id, { name: trimmedName, order: parsedOrder })
        : await createMenuCategoryApi({ name: trimmedName, order: parsedOrder });
      if (!saved) return setError("No se pudo guardar la categoria.");
      for (const item of assignableProducts) {
        if (!selectedProductIds.includes(item.id)) continue;
        const updated = await assignMenuProductCategory(item, saved.id);
        if (!updated) throw new Error("No se pudo actualizar la categoria de " + item.name + ".");
      }
      await onSaved();
      setSelectedId(saved.id);
      setSelectedProductIds([]);
      setName(saved.name);
      setOrder(String(getCategoryOrder(saved)));
      setMessage(
        selectedProductIds.length > 0
          ? `${selectedProductIds.length} productos movidos a ${saved.name}.`
          : selectedCategory ? "Categoria actualizada." : "Categoria creada.",
      );
      setError("");
    } catch (err) {
      await onSaved();
      setError(err instanceof Error ? err.message : "No se pudo guardar la categoria.");
    }
  }

  async function saveCategory(event: React.FormEvent) {
    event.preventDefault();
    await saveCategoryChanges();
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
      const updated = await assignMenuProductCategory(item, category);
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
            <label className={`${styles.assignmentSelectChip} ${selectedProductIds.includes(item.id) ? styles.assignmentSelectChipActive : ""}`.trim()}>
              <input type="checkbox" checked={selectedProductIds.includes(item.id)} onChange={() => toggleSelectedProduct(item.id)} />
              <span>{item.name}</span>
            </label>
            <button type="button" className={styles.assignmentEditBtn} onClick={() => setExpandedProductId((current) => (current === item.id ? "" : item.id))}>
              Cambiar
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
            <span>1- Nombre</span>
            <input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej: Promos" />
          </label>
          <label className={styles.field}>
            <span>2- Orden de categoria</span>
            <input className={styles.input} type="number" min={0} step={1} value={order} onChange={(event) => setOrder(event.target.value)} />
          </label>
          <p className={styles.hint}>Los numeros menores aparecen primero en ventas.</p>
          {assignedProducts.length > 0 ? <p className={styles.meta}>Desvincula los productos antes de eliminar.</p> : null}
          {error ? <div className={styles.errorBox}>{error}</div> : null}
          {message ? <div className={styles.successBox}>{message}</div> : null}
          <div className={styles.productFormActions}>
            <button type="submit" className={styles.primaryBtn}>{selectedCategory ? "Guardar categoria" : "3- Crear categoria"}</button>
          </div>
        </form>
        <div className={styles.associatedProductsBox}>
          <h3 className={styles.sectionTitle}>Productos asociados</h3>
          {groupedAssignedProducts.length === 0 ? <p className={styles.empty}>No hay productos ni combos en esta categoria.</p> : groupedAssignedProducts.map((group) => (
            <section key={group.category.id} className={styles.pickGroup}>
              <h4>{group.category.name}</h4>
              {renderProductChips(group.products, "assigned")}
            </section>
          ))}
        </div>
        <div className={styles.categoryChipList}>
          {categories.map((category) => (
            <button type="button" key={category.id} className={`${styles.pickChip} ${selectedId === category.id ? styles.pickChipActive : ""}`.trim()} onClick={() => selectCategory(category)}>
              {category.name} <strong>{menuProducts.filter((item) => menuProductHasCategory(item, category.id)).length}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.listCard}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Productos por categoria</h2>
          <button type="button" className={styles.secondaryBtn} disabled={!name.trim() || selectedProductIds.length === 0} onClick={() => void saveCategoryChanges()}>
            Aceptar seleccion ({selectedProductIds.length})
          </button>
        </div>
        <div className={styles.assignmentColumn}>
          {groupedAvailableProducts.length === 0 ? <p className={styles.empty}>No hay productos creados.</p> : groupedAvailableProducts.map((group) => (
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
  const [ingredientCategories, setIngredientCategories] = useState<IngredientCategory[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuProducts, setMenuProducts] = useState<MenuProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingMenuProduct, setSavingMenuProduct] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | ProductCategory>("all");
  const [activeTab, setActiveTab] = useState<MenuWorkspaceTab>("products");
  const [collapsedIngredientGroups, setCollapsedIngredientGroups] = useState<Record<string, boolean>>({});

  const [name, setName] = useState("");
  const [renameSelectedMenuProduct, setRenameSelectedMenuProduct] = useState(false);
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState<ProductCategory>("hamburguesa");
  const [description, setDescription] = useState("");
  const [recipeItems, setRecipeItems] = useState<MenuRecipeItem[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ingredientList, menuList, categoryList, ingredientCategoryList] = await Promise.all([
        fetchIngredientsApi(),
        fetchMenuProductsApi(),
        fetchMenuCategoriesApi(),
        fetchIngredientCategoriesApi(),
      ]);
      setIngredients(ingredientList);
      setIngredientCategories(ingredientCategoryList);
      setMenuProducts(menuList);
      setCategories(categoryList);
    } catch {
      setError("No se pudieron cargar ingredientes o productos del menu.");
    } finally {
      setLoading(false);
    }
  }, []);

  async function refreshSavedMenuProduct(saved?: MenuProduct) {
    if (saved) {
      setMenuProducts((current) => current.some((item) => item.id === saved.id)
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [...current, saved]);
    }
    await reload();
  }

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

  const ingredientGroups = useMemo(() => {
    const groups = ingredientCategories.map((item) => ({
      id: item.id,
      name: item.name,
      ingredients: ingredients.filter((ingredient) => ingredient.categoryId === item.id).sort(compareIngredientByGroup),
    }));
    groups.push({ id: "", name: "Sin categoria", ingredients: ingredients.filter((item) => !ingredientCategories.some((category) => category.id === item.categoryId)).sort(compareIngredientByGroup) });
    const order = ["panificados", "carnes", "lacteos", "vegetales", "salsas", "sin categoria", "bebidas"];
    const rank = (name: string) => {
      const index = order.indexOf(normalizeForSearch(name));
      return index < 0 ? 5.5 : index;
    };
    return groups.filter((group) => group.ingredients.length > 0).sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, "es"));
  }, [ingredientCategories, ingredients]);

  const filteredMenuProducts = useMemo(() => {
    const query = normalizeForSearch(search);
    return menuProducts
      .filter((item) => {
        if (item.kind === "combo") return false;
        if (categoryFilter !== "all" && !menuProductHasCategory(item, categoryFilter)) return false;
        if (!query) return true;
        return normalizeForSearch(item.name).includes(query);
      })
      .sort(compareMenuProductByCategory);
  }, [categoryFilter, menuProducts, search]);

  const categoryCounts = useMemo(
    () =>
      categories.reduce(
        (acc, item) => {
          acc[item.id] = menuProducts.filter((product) => product.kind !== "combo" && menuProductHasCategory(product, item.id)).length;
          return acc;
        },
        {} as Record<ProductCategory, number>,
      ),
    [categories, menuProducts],
  );

  const isEditing = !!selectedMenuProduct;
  const parsedPrice = Math.max(0, Math.trunc(toNumber(price)));

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

  function addRecipeItem(ingredient: Ingredient, amount = getIngredientRecipeStep(ingredient)) {
    setError("");
    setMessage("");
    const quantity = amount;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError(ingredient.stockMode === "weight" ? "Configura los gramos de porcion del ingrediente." : "Ingresa una cantidad valida para la receta.");
      return;
    }

    const nextItem: MenuRecipeItem = {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      quantity,
      stockMode: ingredient.stockMode,
      required: true,
    };

    setRecipeItems((current) => {
      const existingIndex = current.findIndex((item) => item.ingredientId === ingredient.id);
      if (existingIndex < 0) return [...current, nextItem];
      return current.map((item, index) => (index === existingIndex ? { ...item, quantity: item.quantity + quantity } : item));
    });
  }

  function getRecipeItemQuantity(ingredientIdToFind: string) {
    return recipeItems.find((item) => item.ingredientId === ingredientIdToFind)?.quantity || 0;
  }

  function subtractRecipeItem(ingredientId: string) {
    const ingredient = ingredients.find((item) => item.id === ingredientId);
    const step = ingredient ? getIngredientRecipeStep(ingredient) : 1;
    setRecipeItems((current) => current
      .map((item) => item.ingredientId === ingredientId ? { ...item, quantity: Math.max(0, item.quantity - step) } : item)
      .filter((item) => item.quantity > 0));
  }

  function removeRecipeItem(ingredientIdToRemove: string) {
    setRecipeItems((current) => current.filter((item) => item.ingredientId !== ingredientIdToRemove));
  }

  async function submitMenuProduct(event: React.FormEvent) {
    event.preventDefault();
    if (savingMenuProduct) return;
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

    setSavingMenuProduct(true);
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
      selectMenuProduct(saved);
      if (!normalizeForSearch(saved.name).includes(normalizeForSearch(search))) setSearch("");
      if (categoryFilter !== "all" && !menuProductHasCategory(saved, categoryFilter)) setCategoryFilter("all");
      await refreshSavedMenuProduct(saved);
      setMessage(selectedMenuProduct && !shouldCreateFromTemplate ? "Producto de menu actualizado." : "Producto de menu creado.");
    } catch {
      setError("No se pudo guardar el producto de menu.");
    } finally {
      setSavingMenuProduct(false);
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
          <button type="button" role="tab" aria-selected={activeTab === "products"} className={`${styles.tabBtn} ${activeTab === "products" ? styles.tabBtnActive : ""}`.trim()} onClick={() => setActiveTab("products")}>Productos</button>
          <button type="button" role="tab" aria-selected={activeTab === "combos"} className={`${styles.tabBtn} ${activeTab === "combos" ? styles.tabBtnActive : ""}`.trim()} onClick={() => setActiveTab("combos")}>Combos</button>
          <button type="button" role="tab" aria-selected={activeTab === "categories"} className={`${styles.tabBtn} ${activeTab === "categories" ? styles.tabBtnActive : ""}`.trim()} onClick={() => setActiveTab("categories")}>Categorias</button>
        </div>

        {activeTab === "products" ? (
        <div className={`${styles.layout} ${styles.productsLayout}`}>
          <section className={styles.formCard}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>{isEditing ? "Editar producto de menu" : "Crear producto"}</h2>
              <div className={styles.headerActions}>
                <button type="button" className={styles.secondaryBtn} onClick={clearForm}>Nuevo</button>
                <button type="button" className={styles.dangerBtn} onClick={() => void removeSelectedMenuProduct()} disabled={!selectedMenuProduct}>
                  Eliminar
                </button>
              </div>
            </div>

            <form className={styles.form} onSubmit={submitMenuProduct}>
              <div className={styles.productFields}>
                <label className={styles.field}>
                  <span>1- Nombre</span>
                  <input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej: Hamburguesa doble" />
                </label>

              <label className={styles.field}>
                <span>2- Precio venta</span>
                <input className={styles.input} type="number" min={1} value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" />
              </label>

              <label className={styles.field}>
                <span>3- Categoria</span>
                <select className={styles.input} value={category} onChange={(event) => setCategory(event.target.value)}>
                  {categories.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className={styles.nameRow}>
              <label className={styles.field}>
                <span>4- Descripcion</span>
                <textarea className={styles.textarea} rows={1} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Detalle visible para cocina o caja" />
              </label>
              <label className={styles.inlineToggle}><input type="checkbox" checked={renameSelectedMenuProduct} onChange={(event) => setRenameSelectedMenuProduct(event.target.checked)} disabled={!selectedMenuProduct} />Modificar</label>
              </div>
              </div>

              <section className={styles.recipeEditor}>
                <h3 className={styles.sectionTitle}>5- Seleccion de ingredientes</h3>
                <div className={styles.ingredientCategoryGrid}>
                {ingredientGroups.map((group) => {
                  const collapsed = collapsedIngredientGroups[group.id] ?? normalizeForSearch(group.name) === "bebidas";
                  const listId = `menu-ingredients-${group.id || "uncategorized"}`;
                  return (
                  <section key={group.id} className={styles.ingredientGroup} aria-label={group.name}>
                    <h4 className={styles.ingredientGroupTitle}>
                      <button type="button" className={styles.ingredientGroupToggle} aria-expanded={!collapsed} aria-controls={listId} onClick={() => setCollapsedIngredientGroups((current) => ({ ...current, [group.id]: !collapsed }))}>
                        <span>{group.name} ({group.ingredients.length})</span>
                        <span aria-hidden="true">{collapsed ? "▸" : "▾"}</span>
                      </button>
                    </h4>
                    <div id={listId} className={styles.ingredientGroupBody} hidden={collapsed}>
                    <div className={`${styles.chipPickerGrid} ${styles.ingredientScrollList}`} tabIndex={group.ingredients.length > 7 ? 0 : undefined} aria-label={`Ingredientes de ${group.name}`}>
                  {group.ingredients.map((item) => {
                    const selectedQuantity = getRecipeItemQuantity(item.id);
                    return (
                      <div key={item.id} className={`${styles.pickChip} ${selectedQuantity > 0 ? styles.pickChipActive : ""}`.trim()}>
                        <button type="button" className={styles.ingredientAddButton} onClick={() => addRecipeItem(item)}>
                          <span>{item.name}</span> <strong>{selectedQuantity}</strong>
                        </button>
                      </div>
                    );
                  })}
                    </div>
                    </div>
                  </section>
                  );
                })}
                </div>
              </section>

              <section className={styles.recipeEditor} aria-labelledby="selected-ingredients-title">
                <h3 id="selected-ingredients-title" className={styles.sectionTitle}>6- Ingredientes seleccionados</h3>
                {recipeItems.length === 0 ? (
                  <p className={styles.empty}>Todavia no agregaste ingredientes.</p>
                ) : (
                  <div className={styles.recipeConfirmList} role="list" aria-label="Ingredientes seleccionados">
                    {recipeItems.map((item) => (
                      <div key={item.ingredientId} className={styles.recipeConfirmItem} role="listitem">
                        <div className={styles.recipeIngredientLabel}>
                          <span>{item.ingredientName}</span>
                          <span className={styles.recipeLeader} aria-hidden="true" />
                        </div>
                        <output className={styles.recipeQuantity} aria-label={`Cantidad de ${item.ingredientName} en receta`}>{formatIngredientQuantity(item.quantity, item.stockMode)}</output>
                        <button type="button" className={styles.recipeSubtractButton} aria-label={`Restar ${item.ingredientName}`} onClick={() => subtractRecipeItem(item.ingredientId)}>−</button>
                        <div className={styles.requirementButtons} role="group" aria-label={`Tipo de ingrediente: ${item.ingredientName}`}>
                          {[true, false].map((required) => (
                            <button key={String(required)} type="button" aria-pressed={isRecipeIngredientRequired(item, recipeItems.length) === required} disabled={recipeItems.length === 1} onClick={() => setRecipeItems((current) => current.map((entry) => entry.ingredientId === item.ingredientId ? { ...entry, required } : entry))}>
                              {required ? "Obligatorio" : "Opcional"}
                            </button>
                          ))}
                        </div>
                        <button type="button" className={styles.recipeRemoveButton} aria-label={`Quitar ${item.ingredientName}`} onClick={() => removeRecipeItem(item.ingredientId)}>X</button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {error ? <div className={styles.errorBox}>{error}</div> : null}
              {message ? <div className={styles.successBox}>{message}</div> : null}
              <div className={styles.productFormActions}>
                <button type="submit" className={styles.primaryBtn} disabled={savingMenuProduct}>{isEditing ? "7- Guardar receta" : "7- Crear producto"}</button>
              </div>
            </form>
          </section>

          <section className={styles.listCard}>
            <div className={styles.menuListHeader}>
              <h2 className={styles.cardTitle}>Menu actual</h2>
              <select className={styles.input} aria-label="Categoria del menu actual" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="all">Todas ({menuProducts.filter((item) => item.kind !== "combo").length})</option>
              {categories.map((option) => (
                <option key={option.id} value={option.id}>{option.name} ({categoryCounts[option.id] || 0})</option>
              ))}
              </select>
              <input className={styles.searchInput} aria-label="Buscar producto por nombre" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto" />
            </div>

            {loading && menuProducts.length === 0 ? (
              <p className={styles.empty}>Cargando menu...</p>
            ) : filteredMenuProducts.length === 0 ? (
              <p className={styles.empty}>No hay productos de menu para mostrar.</p>
            ) : (
              <div className={styles.menuList}>
                {groupMenuProductsByCategory(filteredMenuProducts, categories).map((group) => (
                  <section key={group.category.id} className={styles.menuCategoryGroup} aria-label={group.category.name}>
                    <h3 className={styles.sectionTitle}>{group.category.name}</h3>
                    <div className={styles.menuProductGrid}>
                {group.products.map((item) => {
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`${styles.menuCard} ${styles.compactMenuCard} ${selectedId === item.id ? styles.menuCardActive : ""}`.trim()}
                      onClick={() => selectMenuProduct(item)}
                    >
                      <div className={styles.compactMenuHeader}>
                        <strong>{item.name}</strong>
                        <strong className={styles.compactMenuPrice}>{formatMoneyARS(item.price)}</strong>
                      </div>
                      {item.description ? <p className={styles.description}>{item.description}</p> : null}
                      <p className={styles.ingredientSummary}>
                        {[...item.recipeItems].sort(compareRecipeItemByGroup).map((recipe) => `${recipe.ingredientName} x ${recipe.stockMode === "unit" ? recipe.quantity : formatIngredientQuantity(recipe.quantity, recipe.stockMode)}`).join(", ")}
                      </p>
                    </button>
                  );
                })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </section>
        </div>
        ) : activeTab === "combos" ? (
          <ComboWorkspace categories={categories} menuProducts={menuProducts} onSaved={refreshSavedMenuProduct} />
        ) : (
          <CategoryWorkspace categories={categories} menuProducts={menuProducts} onSaved={async () => reload()} />
        )}
      </div>
    </div>
  );
}
