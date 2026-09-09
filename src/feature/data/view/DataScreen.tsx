import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import { formatDateTimeAR } from "../../../shared/format/locale";
import {
  createDataStoreApi,
  downloadDataStoreBackupApi,
  fetchDataStoresApi,
  importDataStoreApi,
  resetDatabaseApi,
  switchDataStoreApi,
} from "../service/data.api";
import styles from "./DataScreen.module.css";

type PendingAction =
  | { type: "create" }
  | { type: "import" }
  | { type: "switch"; storeId: string; storeName: string }
  | { type: "download"; storeId: string; storeName: string }
  | { type: "reset" };

export default function DataScreen() {
  const auth = useAuth();
  const isAdmin = auth.user?.role === "admin";
  const [adminPassword, setAdminPassword] = useState("");
  const [newStoreName, setNewStoreName] = useState("");
  const [importStoreName, setImportStoreName] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
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
  const [busyAction, setBusyAction] = useState<
    "" | "create" | "import" | "reset" | `switch:${string}` | `download:${string}`
  >("");
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
    const trimmedName = newStoreName.trim();
    if (!trimmedName) {
      setError("Ingresa un nombre para la nueva base.");
      return;
    }
    setPendingAction({ type: "create" });
  }

  async function handleImportStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || busyAction) return;
    resetFeedback();
    if (!importFile) {
      setError("Selecciona un archivo db.js o mock JSON.");
      return;
    }
    if (!importStoreName.trim()) {
      setError("Ingresa un nombre para la base importada.");
      return;
    }
    setPendingAction({ type: "import" });
  }

  async function confirmCreateStore() {
    if (!validateAdminPassword()) return false;
    const trimmedName = newStoreName.trim();

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
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la nueva base.");
      return false;
    } finally {
      setBusyAction("");
    }
  }

  async function confirmImportStore() {
    if (!validateAdminPassword()) return false;
    if (!importFile) {
      setError("Selecciona un archivo db.js o mock JSON.");
      return false;
    }
    const trimmedName = importStoreName.trim();
    if (!trimmedName) {
      setError("Ingresa un nombre para la base importada.");
      return false;
    }

    setBusyAction("import");
    try {
      const result = await importDataStoreApi({
        requestedBy: auth.user?.username || "",
        adminPassword,
        name: trimmedName,
        content: await importFile.text(),
      });
      setMessage(result.message);
      setImportStoreName("");
      setImportFile(null);
      await loadStores();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar la base.");
      return false;
    } finally {
      setBusyAction("");
    }
  }

  async function handleSwitchStore(storeId: string, storeName: string) {
    if (!isAdmin || busyAction) return;
    resetFeedback();
    if (storeId === activeStoreId) return;
    setPendingAction({ type: "switch", storeId, storeName });
  }

  async function confirmSwitchStore(storeId: string) {
    if (!validateAdminPassword()) return false;
    setBusyAction(`switch:${storeId}`);
    try {
      const result = await switchDataStoreApi({
        requestedBy: auth.user?.username || "",
        adminPassword,
        storeId,
      });
      setMessage(result.message);
      await loadStores();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la base activa.");
      return false;
    } finally {
      setBusyAction("");
    }
  }

  async function handleDownloadStoreBackup(storeId: string, storeName: string) {
    if (!isAdmin || busyAction) return;
    resetFeedback();
    setPendingAction({ type: "download", storeId, storeName });
  }

  async function confirmDownloadStoreBackup(storeId: string, storeName: string) {
    if (!validateAdminPassword()) return false;
    setBusyAction(`download:${storeId}`);
    try {
      const result = await downloadDataStoreBackupApi({
        requestedBy: auth.user?.username || "",
        adminPassword,
        storeId,
      });
      downloadBlob(result.blob, result.filename);
      setMessage(`Backup descargado: ${storeName}.`);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo descargar el backup de la base.");
      return false;
    } finally {
      setBusyAction("");
    }
  }

  async function handleResetDatabase() {
    if (!isAdmin || busyAction) return;
    resetFeedback();
    setPendingAction({ type: "reset" });
  }

  async function confirmResetDatabase() {
    if (!validateAdminPassword()) return false;
    setBusyAction("reset");
    try {
      const result = await resetDatabaseApi({
        requestedBy: auth.user?.username || "",
        adminPassword,
      });
      setMessage(`${result.message} (${formatDateTimeAR(result.clearedAt)})`);
      await loadStores();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo limpiar la base de datos.");
      return false;
    } finally {
      setBusyAction("");
    }
  }

  function closeConfirmDialog() {
    if (busyAction) return;
    setPendingAction(null);
    setAdminPassword("");
  }

  async function confirmPendingAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingAction) return;
    resetFeedback();
    if (!validateAdminPassword()) return;
    let completed = false;
    if (pendingAction.type === "create") completed = await confirmCreateStore();
    if (pendingAction.type === "import") completed = await confirmImportStore();
    if (pendingAction.type === "switch") completed = await confirmSwitchStore(pendingAction.storeId);
    if (pendingAction.type === "download") {
      completed = await confirmDownloadStoreBackup(pendingAction.storeId, pendingAction.storeName);
    }
    if (pendingAction.type === "reset") completed = await confirmResetDatabase();
    if (!completed) return;
    setPendingAction(null);
    setAdminPassword("");
  }

  function getPendingActionText() {
    if (!pendingAction) return "";
    if (pendingAction.type === "create") return `Crear base "${newStoreName.trim()}".`;
    if (pendingAction.type === "import") return `Importar y activar base "${importStoreName.trim()}".`;
    if (pendingAction.type === "switch") return `Cambiar base activa a "${pendingAction.storeName}".`;
    if (pendingAction.type === "download") return `Descargar backup de "${pendingAction.storeName}".`;
    return `Limpiar base activa (${activeStore?.name || activeStoreId || "sin base"}).`;
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
              <h2 className={styles.title}>Importar base</h2>
              <p className={styles.hint}>
                Carga un archivo <code>db.js</code> o JSON mock. Se creara como base nueva y quedara activa.
              </p>
              <form className={styles.form} onSubmit={handleImportStore}>
                <label className={styles.field}>
                  Nombre base
                  <input
                    className={styles.input}
                    value={importStoreName}
                    onChange={(event) => setImportStoreName(event.target.value)}
                    placeholder="Ej: backup-local"
                  />
                </label>
                <label className={styles.field}>
                  Archivo
                  <input
                    className={styles.input}
                    type="file"
                    accept=".js,.json,application/json,text/javascript,text/plain"
                    onChange={(event) => setImportFile(event.target.files?.[0] || null)}
                  />
                </label>
                <button type="submit" className={styles.primaryButton} disabled={busyAction !== ""}>
                  {busyAction === "import" ? "Importando..." : "Importar base"}
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
                      <div className={styles.storeActions}>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          disabled={busyAction !== "" || isActive}
                          onClick={() => void handleSwitchStore(store.id, store.name)}
                        >
                          {isActive ? "Base activa" : switching ? "Cambiando..." : "Usar esta base"}
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          disabled={busyAction !== ""}
                          onClick={() => void handleDownloadStoreBackup(store.id, store.name)}
                        >
                          {busyAction === `download:${store.id}` ? "Descargando..." : "Descargar backup .js"}
                        </button>
                      </div>
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

        {pendingAction ? (
          <div className={styles.modalOverlay} onClick={closeConfirmDialog} role="presentation">
            <form className={styles.modalCard} role="dialog" aria-modal="true" onSubmit={confirmPendingAction} onClick={(event) => event.stopPropagation()}>
              <h2 className={styles.title}>Confirmar accion</h2>
              <p className={styles.hint}>{getPendingActionText()}</p>
              <label className={styles.field}>
                Clave admin
                <input
                  className={styles.input}
                  type="password"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  autoComplete="current-password"
                  autoFocus
                />
              </label>
              <div className={styles.modalActions}>
                <button type="button" className={styles.secondaryButton} disabled={busyAction !== ""} onClick={closeConfirmDialog}>
                  Cancelar
                </button>
                <button type="submit" className={pendingAction.type === "reset" ? styles.dangerButton : styles.primaryButton} disabled={busyAction !== ""}>
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
