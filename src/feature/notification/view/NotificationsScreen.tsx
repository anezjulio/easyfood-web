import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import { formatDateTimeAR as formatDateTime } from "../../../shared/format/locale";
import { normalizeForSearch } from "../../../shared/search/search";
import type { Product, ProductCategory } from "../../product/model/product.types";
import { fetchProducts } from "../../product/service/product.api";
import type {
  AppNotification,
  CreateNotificationDraft,
  NotificationSetting,
  NotificationStatus,
  StockThresholdSettings,
  NotificationType,
} from "../model/notification.types";
import {
  fetchStockThresholdSettingsApi,
  generateNotificationExamplesApi,
  removeProductStockThresholdApi,
  upsertProductStockThresholdApi,
  updateCategoryStockThresholdApi,
  createNotificationApi,
  fetchNotificationsApi,
  fetchNotificationSettingsApi,
  updateNotificationApi,
  updateNotificationSettingApi,
} from "../service/notification.api";
import styles from "./NotificationsScreen.module.css";

type NotificationTab = "list" | "action" | "due-fixed" | "settings" | "stock-levels" | "create";

const categoryOptions: ProductCategory[] = [
  "bebida",
  "vivere",
  "helado",
  "chocolate",
  "tabaqueria",
  "golosina",
  "perecedero",
];

const notificationTypeLabel: Record<NotificationType, string> = {
  "license-required": "Permiso requerido",
  "license-expiring": "Permiso por vencer",
  "product-expiring": "Producto por vencer",
  "product-low-stock": "Stock bajo por producto",
  "expense-created": "Gasto generado",
  "sale-created": "Venta generada",
  "supply-requested": "Mercancia solicitada",
  "supply-approved": "Solicitud de mercancia aprobada",
  "supply-received": "Mercancia recibida",
  "supply-pending-receive": "Pedido proveedor pendiente de recepcion",
  "cash-opened": "Caja abierta",
  "cash-closed": "Caja cerrada",
  cash: "Caja",
  "user-created": "Usuario creado",
  "user-updated": "Usuario modificado",
  "user-deleted": "Usuario eliminado",
  "price-changed": "Precio modificado",
  "product-created": "Producto creado",
  "stock-created": "Ingreso de stock",
  "operation-request-merchandise": "Solicitud operador: mercancia",
  "operation-request-permissions": "Solicitud operador: permisos",
  "operation-request-reviewed": "Solicitud operador revisada",
  "manual-fixed": "Manual fija",
  "manual-action": "Manual con accion",
  "manual-due": "Manual con vencimiento",
};

const allTypes = Object.keys(notificationTypeLabel) as NotificationType[];

function getTime(value?: string) {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
}

function buildCategoryThresholdDrafts(settings: StockThresholdSettings | null) {
  const result = {} as Record<ProductCategory, string>;
  for (const category of categoryOptions) {
    const value = settings?.categoryThresholds?.[category] ?? 10;
    result[category] = String(value);
  }
  return result;
}

export default function NotificationsScreen() {
  const auth = useAuth();
  const [tab, setTab] = useState<NotificationTab>("list");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [settings, setSettings] = useState<NotificationSetting[]>([]);
  const [stockThresholdSettings, setStockThresholdSettings] = useState<StockThresholdSettings | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | NotificationType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | NotificationStatus>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortBy, setSortBy] = useState<"createdAt" | "dueAt" | "type">("createdAt");

  const [selectedSettingType, setSelectedSettingType] = useState<NotificationType>("license-expiring");
  const [leadDays, setLeadDays] = useState("0");
  const [durationDays, setDurationDays] = useState("7");
  const [categoryThresholdDrafts, setCategoryThresholdDrafts] = useState<Record<ProductCategory, string>>(
    buildCategoryThresholdDrafts(null),
  );
  const [selectedProductIdForThreshold, setSelectedProductIdForThreshold] = useState("");
  const [selectedProductMinUnits, setSelectedProductMinUnits] = useState("10");

  const [createType, setCreateType] = useState<NotificationType>("manual-action");
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createDueAt, setCreateDueAt] = useState("");
  const [createCategory, setCreateCategory] = useState("");
  const [createFixed, setCreateFixed] = useState(false);
  const [createRequiresAction, setCreateRequiresAction] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [notificationsList, settingsList, stockThresholdList, productList] = await Promise.all([
        fetchNotificationsApi(),
        fetchNotificationSettingsApi(),
        fetchStockThresholdSettingsApi(),
        fetchProducts(),
      ]);
      setNotifications(notificationsList);
      setSettings(settingsList);
      setStockThresholdSettings(stockThresholdList);
      setCategoryThresholdDrafts(buildCategoryThresholdDrafts(stockThresholdList));
      setProducts(productList);
      setSelectedProductIdForThreshold((current) => current || productList[0]?.id || "");
    } catch {
      setError("No se pudieron cargar notificaciones.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const selected = settings.find((item) => item.type === selectedSettingType);
    if (!selected) return;
    setLeadDays(String(selected.leadDays));
    setDurationDays(String(selected.durationDays));
  }, [selectedSettingType, settings]);

  useEffect(() => {
    if (createType === "manual-fixed") {
      setCreateFixed(true);
      setCreateRequiresAction(false);
      return;
    }
    if (createType === "manual-action") {
      setCreateFixed(false);
      setCreateRequiresAction(true);
      return;
    }
    if (createType === "manual-due") {
      setCreateFixed(false);
      setCreateRequiresAction(false);
      return;
    }
  }, [createType]);

  useEffect(() => {
    if (!selectedProductIdForThreshold) {
      setSelectedProductMinUnits("10");
      return;
    }
    const override = stockThresholdSettings?.productThresholds.find((item) => item.productId === selectedProductIdForThreshold);
    setSelectedProductMinUnits(String(override?.minUnits ?? 10));
  }, [selectedProductIdForThreshold, stockThresholdSettings]);

  const filteredNotifications = useMemo(() => {
    const query = normalizeForSearch(search);
    const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const toMs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;

    let list = notifications.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      const createdMs = new Date(item.createdAt).getTime();
      if (!Number.isFinite(createdMs) || createdMs < fromMs || createdMs > toMs) return false;
      if (!query) return true;
      const raw = `${item.title} ${item.description} ${notificationTypeLabel[item.type]} ${item.entityType || ""} ${item.entityId || ""}`;
      return normalizeForSearch(raw).includes(query);
    });

    list = [...list].sort((a, b) => {
      if (sortBy === "type") return notificationTypeLabel[a.type].localeCompare(notificationTypeLabel[b.type]);
      if (sortBy === "dueAt") return (getTime(b.dueAt) || 0) - (getTime(a.dueAt) || 0);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return list;
  }, [fromDate, notifications, search, sortBy, statusFilter, toDate, typeFilter]);

  const actionNotifications = useMemo(
    () =>
      notifications
        .filter((item) => item.requiresAction && item.status === "active")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [notifications],
  );

  const dueNotifications = useMemo(
    () =>
      notifications
        .filter((item) => item.status === "active" && !!item.dueAt)
        .sort((a, b) => new Date(a.dueAt || 0).getTime() - new Date(b.dueAt || 0).getTime()),
    [notifications],
  );

  const fixedNotifications = useMemo(
    () =>
      notifications
        .filter((item) => item.status === "active" && item.isFixed)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [notifications],
  );

  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  );

  const productThresholdRows = useMemo(() => {
    const mapById = new Map(products.map((item) => [item.id, item]));
    const rows: Array<{
      productId: string;
      minUnits: number;
      productName: string;
      category: ProductCategory;
      currentStock: number;
    }> = [];
    for (const item of stockThresholdSettings?.productThresholds || []) {
      const product = mapById.get(item.productId);
      if (!product) continue;
      rows.push({
        productId: item.productId,
        minUnits: item.minUnits,
        productName: product.name,
        category: product.category || "vivere",
        currentStock: Math.max(0, Math.trunc(Number(product.existencia || 0))),
      });
    }
    return rows.sort((a, b) => a.productName.localeCompare(b.productName));
  }, [products, stockThresholdSettings]);

  async function saveSetting(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    const nextLeadDays = Math.max(0, Math.trunc(Number(leadDays)));
    const nextDurationDays = Math.max(0, Math.trunc(Number(durationDays)));
    if (!Number.isFinite(nextLeadDays) || !Number.isFinite(nextDurationDays)) {
      setError("Ingresa valores numericos validos.");
      return;
    }
    try {
      const updated = await updateNotificationSettingApi(selectedSettingType, {
        leadDays: nextLeadDays,
        durationDays: nextDurationDays,
      });
      setSettings((current) => current.map((item) => (item.type === updated.type ? updated : item)));
      setMessage("Configuracion actualizada.");
    } catch {
      setError("No se pudo guardar la configuracion.");
    }
  }

  async function saveCategoryThreshold(category: ProductCategory) {
    setError("");
    setMessage("");
    const raw = categoryThresholdDrafts[category] || "10";
    const minUnits = Math.max(10, Math.trunc(Number(raw)));
    if (!Number.isFinite(minUnits)) {
      setError("Ingresa un valor numerico valido para el minimo por categoria.");
      return;
    }
    try {
      const updated = await updateCategoryStockThresholdApi(category, minUnits);
      setStockThresholdSettings(updated);
      setCategoryThresholdDrafts(buildCategoryThresholdDrafts(updated));
      setMessage(`Minimo por categoria actualizado: ${category}.`);
    } catch {
      setError("No se pudo actualizar el minimo por categoria.");
    }
  }

  async function saveProductThreshold(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!selectedProductIdForThreshold) {
      setError("Selecciona un producto.");
      return;
    }
    const minUnits = Math.max(10, Math.trunc(Number(selectedProductMinUnits)));
    if (!Number.isFinite(minUnits)) {
      setError("Ingresa un minimo valido para producto.");
      return;
    }
    try {
      const updated = await upsertProductStockThresholdApi(selectedProductIdForThreshold, minUnits);
      setStockThresholdSettings(updated);
      setMessage("Minimo por producto guardado.");
    } catch {
      setError("No se pudo guardar el minimo por producto.");
    }
  }

  async function removeProductThreshold(productId: string) {
    setError("");
    setMessage("");
    try {
      const updated = await removeProductStockThresholdApi(productId);
      setStockThresholdSettings(updated);
      if (selectedProductIdForThreshold === productId) {
        setSelectedProductMinUnits("10");
      }
      setMessage("Minimo especifico eliminado.");
    } catch {
      setError("No se pudo eliminar el minimo especifico.");
    }
  }

  async function generateExamples() {
    setError("");
    setMessage("");
    try {
      const result = await generateNotificationExamplesApi();
      await reload();
      setMessage(`Casos de prueba generados: ${result.createdCases}.`);
    } catch {
      setError("No se pudieron generar casos de prueba.");
    }
  }

  async function updateNotificationStatus(id: string, status: NotificationStatus) {
    setError("");
    setMessage("");
    try {
      const updated = await updateNotificationApi(id, { status });
      setNotifications((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage(status === "received" ? "Notificacion marcada como recibida." : status === "disabled" ? "Notificacion deshabilitada." : "Notificacion reactivada.");
    } catch {
      setError("No se pudo actualizar la notificacion.");
    }
  }

  async function createManualNotification(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    const title = createTitle.trim();
    const description = createDescription.trim();
    if (!title) {
      setError("Ingresa un titulo.");
      return;
    }
    if (!description) {
      setError("Ingresa una descripcion.");
      return;
    }
    const draft: CreateNotificationDraft = {
      type: createType,
      title,
      description,
      dueAt: createDueAt || undefined,
      category: (createCategory || undefined) as ProductCategory | undefined,
      isFixed: createFixed,
      requiresAction: createRequiresAction,
    };
    if (createType === "manual-due" && !draft.dueAt) {
      setError("Ingresa una fecha de vencimiento para notificacion manual con vencimiento.");
      return;
    }

    try {
      const created = await createNotificationApi(draft);
      setNotifications((current) => [created, ...current]);
      setCreateTitle("");
      setCreateDescription("");
      setCreateDueAt("");
      setCreateCategory("");
      setMessage("Notificacion creada.");
      setTab("list");
    } catch {
      setError("No se pudo crear la notificacion.");
    }
  }

  if (auth.user?.role !== "admin") {
    return (
      <div className={styles.page}>
        <div className={styles.content}>
          <header className={styles.header}>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Notificaciones" }]} asTitle />
            <SessionStatusBar />
          </header>
          <p className={styles.empty}>No tienes permisos para ver notificaciones.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Notificaciones" }]} asTitle />
            <p className={styles.subtitle}>Centro de avisos, vencimientos, acciones pendientes y configuraciones.</p>
          </div>
          <SessionStatusBar />
        </header>

        <section className={styles.tabs}>
          <button type="button" className={`${styles.tabBtn} ${tab === "list" ? styles.tabBtnActive : ""}`} onClick={() => setTab("list")}>
            Listado
          </button>
          <button type="button" className={`${styles.tabBtn} ${tab === "action" ? styles.tabBtnActive : ""}`} onClick={() => setTab("action")}>
            Requieren accion
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${tab === "due-fixed" ? styles.tabBtnActive : ""}`}
            onClick={() => setTab("due-fixed")}
          >
            Vencimientos y fijas
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${tab === "settings" ? styles.tabBtnActive : ""}`}
            onClick={() => setTab("settings")}
          >
            Duraciones
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${tab === "stock-levels" ? styles.tabBtnActive : ""}`}
            onClick={() => setTab("stock-levels")}
          >
            Stock minimo
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${tab === "create" ? styles.tabBtnActive : ""}`}
            onClick={() => setTab("create")}
          >
            Crear
          </button>
        </section>

        {message ? <p className={styles.success}>{message}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        <section className={styles.panel}>
          {loading ? (
            <p className={styles.empty}>Cargando...</p>
          ) : tab === "list" ? (
            <>
              <div className={styles.filters}>
                <input
                  className={styles.input}
                  placeholder="Buscar por titulo, descripcion, tipo o referencia"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <select className={styles.select} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "all" | NotificationType)}>
                  <option value="all">Todos los tipos</option>
                  {allTypes.map((item) => (
                    <option key={item} value={item}>
                      {notificationTypeLabel[item]}
                    </option>
                  ))}
                </select>
                <select className={styles.select} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | NotificationStatus)}>
                  <option value="all">Todos los estados</option>
                  <option value="active">Activas</option>
                  <option value="received">Recibidas</option>
                  <option value="disabled">Deshabilitadas</option>
                </select>
                <input className={styles.input} type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
                <input className={styles.input} type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
                <select className={styles.select} value={sortBy} onChange={(event) => setSortBy(event.target.value as "createdAt" | "dueAt" | "type")}>
                  <option value="createdAt">Orden: fecha creacion</option>
                  <option value="dueAt">Orden: fecha vencimiento</option>
                  <option value="type">Orden: tipo</option>
                </select>
              </div>
              <NotificationList items={filteredNotifications} onUpdateStatus={updateNotificationStatus} />
            </>
          ) : tab === "action" ? (
            <>
              <h2 className={styles.sectionTitle}>Notificaciones que requieren accion</h2>
              <NotificationList items={actionNotifications} onUpdateStatus={updateNotificationStatus} />
            </>
          ) : tab === "due-fixed" ? (
            <div className={styles.gridTwo}>
              <section className={styles.subPanel}>
                <h2 className={styles.sectionTitle}>Con vencimiento</h2>
                <NotificationList items={dueNotifications} onUpdateStatus={updateNotificationStatus} />
              </section>
              <section className={styles.subPanel}>
                <h2 className={styles.sectionTitle}>Fijas</h2>
                <NotificationList items={fixedNotifications} onUpdateStatus={updateNotificationStatus} />
              </section>
            </div>
          ) : tab === "settings" ? (
            <div className={styles.gridTwo}>
              <section className={styles.subPanel}>
                <h2 className={styles.sectionTitle}>Tipos configurables</h2>
                <div className={styles.list}>
                  {settings.map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      className={`${styles.settingBtn} ${selectedSettingType === item.type ? styles.settingBtnActive : ""}`}
                      onClick={() => setSelectedSettingType(item.type)}
                    >
                      <strong>{notificationTypeLabel[item.type]}</strong>
                      <p className={styles.meta}>Anticipo: {item.leadDays} dias | Duracion: {item.durationDays} dias</p>
                    </button>
                  ))}
                </div>
              </section>
              <section className={styles.subPanel}>
                <h2 className={styles.sectionTitle}>Editar configuracion</h2>
                <form className={styles.form} onSubmit={saveSetting}>
                  <label className={styles.field}>
                    <span>Tipo</span>
                    <select
                      className={styles.select}
                      value={selectedSettingType}
                      onChange={(event) => setSelectedSettingType(event.target.value as NotificationType)}
                    >
                      {allTypes.map((item) => (
                        <option key={item} value={item}>
                          {notificationTypeLabel[item]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Dias de anticipo (para vencimientos)</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={0}
                      value={leadDays}
                      onChange={(event) => setLeadDays(event.target.value)}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Dias de duracion</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={0}
                      value={durationDays}
                      onChange={(event) => setDurationDays(event.target.value)}
                    />
                  </label>
                  <button type="submit" className={styles.primaryBtn}>
                    Guardar configuracion
                  </button>
                </form>
              </section>
            </div>
          ) : tab === "stock-levels" ? (
            <div className={styles.gridTwo}>
              <section className={styles.subPanel}>
                <h2 className={styles.sectionTitle}>Minimos por categoria</h2>
                <p className={styles.meta}>Minimo base configurable: 10 unidades.</p>
                <div className={styles.list}>
                  {categoryOptions.map((category) => (
                    <article key={category} className={styles.settingRow}>
                      <strong>{category}</strong>
                      <div className={styles.rowActions}>
                        <input
                          className={styles.input}
                          type="number"
                          min={10}
                          value={categoryThresholdDrafts[category] || "10"}
                          onChange={(event) =>
                            setCategoryThresholdDrafts((current) => ({ ...current, [category]: event.target.value }))
                          }
                        />
                        <button type="button" className={styles.secondaryBtn} onClick={() => void saveCategoryThreshold(category)}>
                          Guardar
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className={styles.subPanel}>
                <h2 className={styles.sectionTitle}>Minimos por producto (override)</h2>
                <p className={styles.meta}>
                  Ejemplo: categoria bebida con 10, pero Coca-Cola con 30 unidades.
                </p>
                <form className={styles.form} onSubmit={saveProductThreshold}>
                  <label className={styles.field}>
                    <span>Producto</span>
                    <select
                      className={styles.select}
                      value={selectedProductIdForThreshold}
                      onChange={(event) => setSelectedProductIdForThreshold(event.target.value)}
                    >
                      <option value="">Selecciona producto</option>
                      {sortedProducts.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.category || "vivere"}) - stock {Math.max(0, Math.trunc(Number(item.existencia || 0)))}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Minimo unidades</span>
                    <input
                      className={styles.input}
                      type="number"
                      min={10}
                      value={selectedProductMinUnits}
                      onChange={(event) => setSelectedProductMinUnits(event.target.value)}
                    />
                  </label>
                  <button type="submit" className={styles.primaryBtn}>
                    Guardar minimo por producto
                  </button>
                </form>

                <h3 className={styles.sectionTitle}>Overrides activos</h3>
                {productThresholdRows.length === 0 ? (
                  <p className={styles.empty}>No hay minimos especificos por producto.</p>
                ) : (
                  <div className={styles.list}>
                    {productThresholdRows.map((item) => (
                      <article key={item.productId} className={styles.settingRow}>
                        <div>
                          <strong>{item.productName}</strong>
                          <p className={styles.meta}>
                            Categoria: {item.category} | Minimo: {item.minUnits} | Stock actual: {item.currentStock}
                          </p>
                        </div>
                        <button type="button" className={styles.secondaryBtn} onClick={() => void removeProductThreshold(item.productId)}>
                          Quitar override
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <form className={styles.form} onSubmit={createManualNotification}>
              <h2 className={styles.sectionTitle}>Crear notificacion manual</h2>
              <label className={styles.field}>
                <span>Tipo</span>
                <select className={styles.select} value={createType} onChange={(event) => setCreateType(event.target.value as NotificationType)}>
                  <option value="manual-action">Manual con accion</option>
                  <option value="manual-due">Manual con vencimiento</option>
                  <option value="manual-fixed">Manual fija</option>
                  {allTypes
                    .filter((item) => !item.startsWith("manual-"))
                    .map((item) => (
                      <option key={item} value={item}>
                        {notificationTypeLabel[item]}
                      </option>
                    ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Titulo</span>
                <input className={styles.input} value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Descripcion</span>
                <textarea
                  className={styles.textarea}
                  rows={4}
                  value={createDescription}
                  onChange={(event) => setCreateDescription(event.target.value)}
                />
              </label>
              <div className={styles.gridTwo}>
                <label className={styles.field}>
                  <span>Fecha de vencimiento (opcional)</span>
                  <input className={styles.input} type="datetime-local" value={createDueAt} onChange={(event) => setCreateDueAt(event.target.value)} />
                </label>
                <label className={styles.field}>
                  <span>Categoria (opcional)</span>
                  <select className={styles.select} value={createCategory} onChange={(event) => setCreateCategory(event.target.value)}>
                    <option value="">Sin categoria</option>
                    {categoryOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={styles.gridTwo}>
                <label className={styles.inlineCheck}>
                  <input type="checkbox" checked={createFixed} onChange={(event) => setCreateFixed(event.target.checked)} />
                  <span>Notificacion fija</span>
                </label>
                <label className={styles.inlineCheck}>
                  <input
                    type="checkbox"
                    checked={createRequiresAction}
                    onChange={(event) => setCreateRequiresAction(event.target.checked)}
                  />
                  <span>Requiere accion</span>
                </label>
              </div>
              <button type="submit" className={styles.primaryBtn}>
                Crear notificacion
              </button>
              <button type="button" className={styles.secondaryBtn} onClick={() => void generateExamples()}>
                Generar casos de prueba y ejemplos
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

function NotificationList({
  items,
  onUpdateStatus,
}: {
  items: AppNotification[];
  onUpdateStatus: (id: string, status: NotificationStatus) => Promise<void>;
}) {
  if (items.length === 0) {
    return <p className={styles.empty}>No hay notificaciones para mostrar.</p>;
  }

  return (
    <div className={styles.list}>
      {items.map((item) => (
        <article key={item.id} className={styles.item}>
          <div className={styles.itemTop}>
            <strong>{item.title}</strong>
            <div className={styles.badges}>
              <span className={styles.badge}>{notificationTypeLabel[item.type]}</span>
              {item.isFixed ? <span className={`${styles.badge} ${styles.badgeBlue}`}>Fija</span> : null}
              {item.requiresAction ? <span className={`${styles.badge} ${styles.badgeAmber}`}>Accion</span> : null}
              {item.status !== "active" ? <span className={`${styles.badge} ${styles.badgeSlate}`}>{item.status}</span> : null}
            </div>
          </div>
          <p className={styles.description}>{item.description}</p>
          <p className={styles.meta}>
            Creada: {formatDateTime(item.createdAt)} | Vence: {formatDateTime(item.dueAt)} | Ref: {item.entityType || "-"} {item.entityId || "-"}
          </p>
          <div className={styles.actions}>
            {item.status !== "received" ? (
              <button type="button" className={styles.secondaryBtn} onClick={() => void onUpdateStatus(item.id, "received")}>
                Marcar recibida
              </button>
            ) : null}
            {item.status !== "disabled" ? (
              <button type="button" className={styles.secondaryBtn} onClick={() => void onUpdateStatus(item.id, "disabled")}>
                Deshabilitar
              </button>
            ) : (
              <button type="button" className={styles.secondaryBtn} onClick={() => void onUpdateStatus(item.id, "active")}>
                Reactivar
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

