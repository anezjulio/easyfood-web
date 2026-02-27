import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import { formatDateTimeAR } from "../../../shared/format/locale";
import { createDataStoreApi, fetchDataStoresApi, resetDatabaseApi, switchDataStoreApi } from "../service/data.api";
import styles from "./DataScreen.module.css";

export default function DataScreen() {
  const auth = useAuth();
  const isAdmin = auth.user?.role === "admin";
  const [adminPassword, setAdminPassword] = useState("");
  const [newStoreName, setNewStoreName] = useState("");
  const [activeStoreId, setActiveStoreId] = useState("");
  const [stores, setStores] = useState<
    Array<{
      id: string;
      name: string;
      dbPath: string;
      imagesDir: string;
      receiptsDir: string;
      createdAt: string;
    }>
  >([]);
  const [loadingStores, setLoadingStores] = useState(false);
  const [busyAction, setBusyAction] = useState<"" | "create" | "reset" | `switch:${string}`>("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeStore = useMemo(
    () => stores.find((item) => item.id === activeStoreId) || null,
    [stores, activeStoreId],
  );

  const loadStores = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingStores(true);
    try {
      const data = await fetchDataStoresApi();
      setActiveStoreId(data.activeStoreId);
      setStores(data.stores);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el listado de bases.");
    } finally {
      setLoadingStores(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  function resetFeedback() {
    setMessage("");
    setError("");
  }

  function validateAdminPassword(): boolean {
    if (!adminPassword.trim()) {
      setError("Ingresa la clave del usuario admin.");
      return false;
    }
    return true;
  }

  async function handleCreateStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || busyAction) return;
    resetFeedback();

    if (!validateAdminPassword()) return;
    const trimmedName = newStoreName.trim();
    if (!trimmedName) {
      setError("Ingresa un nombre para la nueva base.");
      return;
    }
    const confirmed = window.confirm(
      "Se creara una nueva base con su db.js y directorios de imagenes/recibos. Deseas continuar?",
    );
    if (!confirmed) return;

    setBusyAction("create");
    try {
      const result = await createDataStoreApi({
        requestedBy: auth.user?.username || "",
        adminPassword,
        name: trimmedName,
      });
      setMessage(result.message);
      setNewStoreName("");
      await loadStores();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la nueva base.");
    } finally {
      setBusyAction("");
    }
  }

  async function handleSwitchStore(storeId: string, storeName: string) {
    if (!isAdmin || busyAction) return;
    resetFeedback();
    if (!validateAdminPassword()) return;
    if (storeId === activeStoreId) return;

    const confirmed = window.confirm(`Cambiar base activa a "${storeName}"?`);
    if (!confirmed) return;

    setBusyAction(`switch:${storeId}`);
    try {
      const result = await switchDataStoreApi({
        requestedBy: auth.user?.username || "",
        adminPassword,
        storeId,
      });
      setMessage(result.message);
      await loadStores();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la base activa.");
    } finally {
      setBusyAction("");
    }
  }

  async function handleResetDatabase() {
    if (!isAdmin || busyAction) return;
    resetFeedback();
    if (!validateAdminPassword()) return;

    const confirmed = window.confirm(
      `Esta accion limpiara la base activa (${activeStore?.name || activeStoreId || "sin base"}). Deseas continuar?`,
    );
    if (!confirmed) return;

    setBusyAction("reset");
    try {
      const result = await resetDatabaseApi({
        requestedBy: auth.user?.username || "",
        adminPassword,
      });
      setMessage(`${result.message} (${formatDateTimeAR(result.clearedAt)})`);
      await loadStores();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo limpiar la base de datos.");
    } finally {
      setBusyAction("");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Data" }]} asTitle />
            <p className={styles.subtitle}>Gestion de multiples bases de datos y medios.</p>
          </div>
          <SessionStatusBar />
        </header>

        {!isAdmin ? (
          <p className={styles.guardBox}>No tienes permisos para administrar data.</p>
        ) : (
          <>
            <section className={styles.panel}>
              <h2 className={styles.title}>Acceso admin</h2>
              <p className={styles.hint}>La clave admin se usa para crear, cambiar y limpiar bases.</p>
              <label className={styles.field}>
                Clave admin
                <input
                  className={styles.input}
                  type="password"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </label>
            </section>

            <section className={styles.panel}>
              <h2 className={styles.title}>Crear nueva base</h2>
              <p className={styles.hint}>
                Se generara un nuevo archivo <code>db.js</code> y carpetas propias para imagenes y recibos.
              </p>
              <form className={styles.form} onSubmit={handleCreateStore}>
                <label className={styles.field}>
                  Nombre base
                  <input
                    className={styles.input}
                    value={newStoreName}
                    onChange={(event) => setNewStoreName(event.target.value)}
                    placeholder="Ej: sucursal-centro"
                  />
                </label>
                <button type="submit" className={styles.primaryButton} disabled={busyAction !== ""}>
                  {busyAction === "create" ? "Creando..." : "Crear base"}
                </button>
              </form>
            </section>

            <section className={styles.panel}>
              <h2 className={styles.title}>Bases disponibles</h2>
              <p className={styles.hint}>
                Base activa: <strong>{activeStore ? `${activeStore.name} (${activeStore.id})` : "-"}</strong>
              </p>
              {loadingStores ? <p className={styles.hint}>Cargando bases...</p> : null}
              {!loadingStores && stores.length === 0 ? <p className={styles.hint}>No hay bases configuradas.</p> : null}
              <div className={styles.storeList}>
                {stores.map((store) => {
                  const isActive = store.id === activeStoreId;
                  const switching = busyAction === `switch:${store.id}`;
                  return (
                    <article key={store.id} className={`${styles.storeCard} ${isActive ? styles.storeCardActive : ""}`}>
                      <p className={styles.storeTitle}>
                        {store.name} ({store.id})
                      </p>
                      <p className={styles.storeMeta}>db: {store.dbPath}</p>
                      <p className={styles.storeMeta}>imagenes: {store.imagesDir}</p>
                      <p className={styles.storeMeta}>recibos: {store.receiptsDir}</p>
                      <p className={styles.storeMeta}>creada: {formatDateTimeAR(store.createdAt)}</p>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={busyAction !== "" || isActive}
                        onClick={() => void handleSwitchStore(store.id, store.name)}
                      >
                        {isActive ? "Base activa" : switching ? "Cambiando..." : "Usar esta base"}
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className={styles.panel}>
              <h2 className={styles.title}>Limpiar base activa</h2>
              <p className={styles.warning}>
                Accion destructiva: se eliminaran productos, stock, ventas, facturas, gastos, pedidos, jornadas y
                notificaciones de la base activa.
              </p>
              <button
                type="button"
                className={styles.dangerButton}
                disabled={busyAction !== ""}
                onClick={() => void handleResetDatabase()}
              >
                {busyAction === "reset" ? "Limpiando..." : "Limpiar base activa"}
              </button>
            </section>
          </>
        )}

        {message ? <p className={styles.success}>{message}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    </div>
  );
}
