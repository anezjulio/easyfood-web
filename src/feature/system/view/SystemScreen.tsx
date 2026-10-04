import { useEffect, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { buildDefaultSystemSettings, type SystemSettings } from "../model/system.types";
import { fetchSystemSettingsApi, updateSystemSettingsApi } from "../service/system.api";
import styles from "./SystemScreen.module.css";

export default function SystemScreen() {
  const [settings, setSettings] = useState<SystemSettings>(buildDefaultSystemSettings());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchSystemSettingsApi()
      .then((nextSettings) => {
        if (active) setSettings(nextSettings);
      })
      .catch(() => {
        if (active) setError("No se pudo cargar la configuracion del sistema.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function toggleOutOfStockSales() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const nextSettings = await updateSystemSettingsApi({
        allowOutOfStockSales: !settings.allowOutOfStockSales,
      });
      setSettings(nextSettings);
      setMessage("Configuracion actualizada.");
    } catch {
      setError("No se pudo guardar la configuracion.");
    } finally {
      setSaving(false);
    }
  }

  const strictStockEnabled = !settings.allowOutOfStockSales;

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Sistema" }]} asTitle />
            <p className={styles.subtitle}>Configuraciones operativas especiales.</p>
          </div>
          <SessionStatusBar />
        </div>

        <section className={styles.panel}>
          <div className={styles.settingRow}>
            <div>
              <h2 className={styles.title}>Validacion de stock en ventas</h2>
              <p className={styles.description}>Controla si una venta puede cobrarse aunque no alcance el stock de ingredientes.</p>
            </div>
            <button
              type="button"
              className={`${styles.switchControl} ${strictStockEnabled ? styles.switchOn : styles.switchOff}`}
              onClick={() => void toggleOutOfStockSales()}
              disabled={loading || saving}
              aria-pressed={strictStockEnabled}
            >
              <span className={styles.switchTrack}>
                <span className={styles.switchThumb} />
              </span>
              <span>{strictStockEnabled ? "Manejo de stock encendido" : "Manejo de stock apagado"}</span>
            </button>
          </div>

          <p className={styles.status}>
            {strictStockEnabled
              ? "El sistema bloquea el cobro si los ingredientes no alcanzan."
              : "El sistema permite cobrar y descuenta hasta cero aunque falte stock."}
          </p>
        </section>

        {message ? <p className={styles.success}>{message}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    </main>
  );
}
