import { useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import { formatDateTimeAR } from "../../../shared/format/locale";
import { resetDatabaseApi } from "../service/data.api";
import styles from "./DataScreen.module.css";

export default function DataScreen() {
  const auth = useAuth();
  const isAdmin = auth.user?.role === "admin";
  const [adminPassword, setAdminPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setMessage("");
    setError("");

    if (!isAdmin) {
      setError("Solo administradores pueden limpiar la base de datos.");
      return;
    }

    if (!adminPassword.trim()) {
      setError("Ingresa la clave del usuario admin.");
      return;
    }

    const confirmed = window.confirm(
      "Esta accion limpiara la base de datos operativa. Se conservaran usuarios y configuraciones. Deseas continuar?",
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const result = await resetDatabaseApi({
        requestedBy: auth.user?.username || "",
        adminPassword,
      });
      setAdminPassword("");
      setMessage(`${result.message} (${formatDateTimeAR(result.clearedAt)})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo limpiar la base de datos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Data" }]} asTitle />
            <p className={styles.subtitle}>Limpieza controlada de base de datos operativa.</p>
          </div>
          <SessionStatusBar />
        </header>

        {!isAdmin ? (
          <p className={styles.guardBox}>No tienes permisos para administrar data.</p>
        ) : (
          <section className={styles.panel}>
            <h2 className={styles.title}>Limpiar base de datos</h2>
            <p className={styles.warning}>
              Accion destructiva: se eliminaran productos, stock, ventas, facturas, gastos, pedidos, jornadas y
              notificaciones.
            </p>
            <p className={styles.hint}>Para confirmar debes ingresar la clave del usuario admin.</p>

            <form className={styles.form} onSubmit={handleSubmit}>
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

              <button type="submit" className={styles.dangerButton} disabled={loading}>
                {loading ? "Limpiando..." : "Limpiar base de datos"}
              </button>
            </form>
          </section>
        )}

        {message ? <p className={styles.success}>{message}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    </div>
  );
}

