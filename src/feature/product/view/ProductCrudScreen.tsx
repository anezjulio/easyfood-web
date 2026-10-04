import type React from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import ProductTable from "../component/ProductTable";
import { useProductCrudViewModel } from "../viewmodel/useProductCrudViewModel";
import { resolveImageUrl } from "../../../shared/image/image.service";
import type { ProductStockMode, ProductType } from "../model/product.types";
import styles from "./ProductCrudScreen.module.css";

export default function ProductCrudScreen() {
  const vm = useProductCrudViewModel();
  const imageUrl = resolveImageUrl(vm.imageUrl?.trim() || "");
  const leftActionLabel = "Nuevo";
  const submitLabel = vm.isEditing ? "Modificar" : "Confirmar";
  const productFormId = "product-crud-form";
  const typeOptions: Array<{ value: ProductType; label: string }> = [
    { value: "ingrediente", label: "Ingrediente" },
    { value: "empaque", label: "Empaque" },
    { value: "bebida", label: "Bebida" },
    { value: "receta", label: "Receta" },
    { value: "combo", label: "Combo" },
  ];
  const stockModeOptions: Array<{ value: ProductStockMode; label: string }> = [
    { value: "unit", label: "Unidad" },
    { value: "weight", label: "Peso" },
  ];
  function preventEnterFromSubmittingBarcode(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
    }
  }
  const marginSourceLabel = vm.isEditing
    ? vm.selectedProductHasMarginOverride
      ? "producto"
      : "categoria"
    : vm.newProductUseMarginOverride
      ? "producto nuevo"
      : "categoria";

  async function handleImageFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    await vm.uploadImage(file);
    event.target.value = "";
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs
              items={[{ label: "Menu", to: "/operation" }, { label: "Productos", to: "/products/new" }, { label: "Crear producto" }]}
              asTitle
            />
            <p className={styles.subtitle}>Formulario para crear, editar y gestionar productos.</p>
          </div>
          <SessionStatusBar />
        </header>

        <div className={styles.layout}>
          <div className={styles.formColumn}>
            <div className={styles.topActions}>
              <button type="button" className={`${styles.topActionBtn} ${styles.topActionBtnDanger}`.trim()} onClick={vm.deleteOrRequest}>
                Eliminar
              </button>
              <button type="submit" form={productFormId} className={`${styles.topActionBtn} ${styles.topActionBtnActive}`.trim()}>
                {submitLabel}
              </button>
              <button type="button" className={styles.topActionBtn} onClick={vm.clearForm}>
                {leftActionLabel}
              </button>
            </div>

            <section className={styles.formCard}>
            <h2 className={styles.formTitle}>{vm.isEditing ? "Editar producto" : "Crear producto"}</h2>

            <form id={productFormId} onSubmit={vm.submitForm} className={styles.form}>
              <div className={styles.editorGrid}>
                <aside className={styles.photoPanel}>
                  <div className={styles.photoControl}>
                    {imageUrl ? (
                      <img className={styles.photoImg} src={imageUrl} alt={vm.name || "Producto"} />
                    ) : (
                      <div className={styles.photoFallback}>
                        <div className={styles.photoLetter}>{(vm.name || "P").slice(0, 1).toUpperCase()}</div>
                        <div className={styles.photoHint}>Sin imagen</div>
                      </div>
                    )}

                    <label className={styles.uploadBtn} aria-disabled={vm.isUploadingImage}>
                      {vm.isUploadingImage ? "Subiendo..." : "Cargar archivo"}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileChange}
                        className={styles.hiddenFileInput}
                        disabled={vm.isUploadingImage}
                      />
                    </label>
                  </div>
                </aside>

                <div className={styles.fieldGrid}>
                  <label className={styles.field}>
                    <span>Nombre</span>
                    <input
                      value={vm.name}
                      onChange={(e) => vm.setName(e.target.value)}
                      className={styles.input}
                      placeholder="Ej: Gaseosa lima 500ml"
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Marca</span>
                    <input
                      value={vm.brand}
                      onChange={(e) => vm.setBrand(e.target.value)}
                      className={styles.input}
                      placeholder="Ej: Coca-Cola"
                    />
                  </label>

                  <label className={styles.field}>
                    <span>Codigo de barra</span>
                    <div className={styles.inputStack}>
                      <input
                        value={vm.barcode}
                        onChange={(e) => vm.setBarcode(e.target.value)}
                        onKeyDown={preventEnterFromSubmittingBarcode}
                        autoComplete="off"
                        spellCheck={false}
                        disabled={!vm.isEditing && vm.autoGenerateBarcodeOnSubmit}
                        className={styles.input}
                        placeholder="Ej: 7791234567890"
                      />
                      {!vm.isEditing ? (
                        <label className={styles.toggleLabel}>
                          <input
                            type="checkbox"
                            checked={vm.autoGenerateBarcodeOnSubmit}
                            onChange={(e) => vm.setAutoGenerateBarcodeOnSubmit(e.target.checked)}
                          />
                          Generar automaticamente al confirmar
                        </label>
                      ) : null}
                    </div>
                  </label>

                  <label className={styles.field}>
                    <span>Tipo de producto</span>
                    <select
                      value={vm.productType}
                      onChange={(e) => vm.setProductType(e.target.value as ProductType)}
                      className={`${styles.input} ${styles.selectInput}`}
                    >
                      {typeOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span>Manejo de stock</span>
                    <select
                      value={vm.stockMode}
                      onChange={(e) => vm.setStockMode(e.target.value as ProductStockMode)}
                      disabled={vm.productType !== "ingrediente"}
                      className={`${styles.input} ${styles.selectInput}`}
                    >
                      {stockModeOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span>Descripcion</span>
                    <textarea
                      value={vm.description}
                      onChange={(e) => vm.setDescription(e.target.value)}
                      className={styles.textarea}
                      rows={3}
                      placeholder="Detalle visible del producto"
                    />
                  </label>

                  <div className={styles.field}>
                    <span>Categorias</span>
                    <div className={styles.checkGrid}>
                      {vm.categories.map((option) => (
                        <label key={option.id} className={styles.toggleLabel}>
                          <input
                            type="checkbox"
                            checked={vm.categoryIds.includes(option.id)}
                            onChange={() => vm.toggleCategoryId(option.id)}
                          />
                          {option.name}
                        </label>
                      ))}
                    </div>
                  </div>

                  {vm.productType === "receta" ? (
                    <div className={styles.recipeNotice}>
                      Gestiona ingredientes y porciones desde Ingredientes, y la receta vendible desde Creacion de Menu.
                    </div>
                  ) : null}

                  <label className={styles.field}>
                    <span>Precio de coste</span>
                    <input
                      type="number"
                      min={vm.productType === "ingrediente" || vm.productType === "empaque" ? 0 : 1}
                      value={vm.costPrice}
                      onChange={(e) => vm.setCostPrice(e.target.value)}
                      className={styles.input}
                      placeholder="0"
                    />
                  </label>

                  {vm.isAdmin ? (
                    <>
                      <label className={styles.field}>
                        <span>% categoria</span>
                        <div className={styles.inputWithAction}>
                          <input
                            type="number"
                            min={0}
                            value={vm.categoryMarginDraft}
                            onChange={(e) => vm.setCategoryMarginDraft(e.target.value)}
                            className={styles.input}
                            placeholder="0"
                          />
                          <button type="button" className={styles.inlineBtn} onClick={() => void vm.saveCategoryMargin()}>
                            Guardar
                          </button>
                        </div>
                      </label>

                      {vm.isEditing ? (
                        <label className={styles.field}>
                          <span>% producto</span>
                          <div className={styles.inputWithAction}>
                            <input
                              type="number"
                              min={0}
                              value={vm.productMarginDraft}
                              onChange={(e) => vm.setProductMarginDraft(e.target.value)}
                              className={styles.input}
                              placeholder="0"
                            />
                            <button type="button" className={styles.inlineBtn} onClick={() => void vm.saveProductMarginOverride()}>
                              Guardar
                            </button>
                            {vm.selectedProductHasMarginOverride ? (
                              <button type="button" className={styles.inlineBtn} onClick={() => void vm.removeProductMarginOverride()}>
                                Quitar
                              </button>
                            ) : null}
                          </div>
                        </label>
                      ) : (
                        <label className={styles.field}>
                          <span>% producto</span>
                          <div className={styles.inputWithAction}>
                            <label className={styles.toggleLabel}>
                              <input
                                type="checkbox"
                                checked={vm.newProductUseMarginOverride}
                                onChange={(e) => vm.setNewProductUseMarginOverride(e.target.checked)}
                              />
                              Margen propio
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={vm.newProductMarginDraft}
                              onChange={(e) => vm.setNewProductMarginDraft(e.target.value)}
                              className={styles.input}
                              placeholder="0"
                              disabled={!vm.newProductUseMarginOverride}
                            />
                          </div>
                        </label>
                      )}

                      <label className={styles.field}>
                        <span>Precio de venta</span>
                        <div className={styles.valueBox}>
                          {vm.salePricePreview > 0 ? vm.formatMoneyARS(vm.salePricePreview) : "-"}
                          {" "}
                          ({vm.effectiveMarginPercent}% - {marginSourceLabel})
                        </div>
                      </label>
                    </>
                  ) : null}
                </div>
              </div>

              {vm.error ? <div className={styles.errorBox}>{vm.error}</div> : null}
              {vm.message ? <div className={styles.successBox}>{vm.message}</div> : null}

              <p className={styles.roleHint}>
                {vm.isAdmin
                  ? "Perfil administrador: puedes crear, editar y eliminar productos."
                  : "Perfil operador: puedes crear/editar; la eliminacion se envia como solicitud al administrador."}
              </p>
            </form>
            </section>
          </div>

          <section className={styles.listCard}>
            <ProductTable
              products={vm.products}
              loading={vm.loading}
              formatMoney={vm.formatMoneyARS}
              formatDate={vm.formatDateAR}
              selectedProductId={vm.selectedProductId}
              onSelectProduct={vm.selectProduct}
              sortKey={vm.sortKey}
              sortDir={vm.sortDir}
              showSortFeedback={vm.hasUserSorted}
              onSortChange={vm.handleSortChange}
              onSortClear={vm.handleClearSort}
              filters={vm.filters}
              onFilterChange={vm.handleFilterChange}
              showExistence
              existenceLabel="Stock"
              topMargin={0}
              maxHeight="100%"
            />
          </section>
        </div>
      </div>
    </div>
  );
}
