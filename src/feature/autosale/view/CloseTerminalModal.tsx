import styles from "./AutoSaleScreen.module.css";

export default function CloseTerminalModal({
  password,
  error,
  isSubmitting,
  onPasswordChange,
  onCancel,
  onSubmit,
}: {
  password: string;
  error: string;
  isSubmitting: boolean;
  onPasswordChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className={styles.modalOverlay} onClick={onCancel} role="presentation">
      <section
        className={styles.modalCard}
        role="dialog"
        aria-modal="true"
        aria-label="Cerrar terminal"
        onClick={(event) => event.stopPropagation()}
      >
        <span className={styles.kicker}>Seguridad</span>
        <h2 className={styles.modalTitle}>Cerrar terminal</h2>
        <p className={styles.modalText}>
          Solo un perfil administrador u operador que conozca la contrasena puede volver al menu principal.
        </p>

        <form className={styles.modalForm} onSubmit={onSubmit}>
          <label className={styles.modalField}>
            <span>Contrasena</span>
            <input
              className={styles.modalInput}
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              autoComplete="current-password"
            />
          </label>

          {error ? <p className={styles.modalError}>{error}</p> : null}

          <div className={styles.modalActions}>
            <button type="button" className={styles.secondaryBtn} onClick={onCancel} disabled={isSubmitting}>
              Cancelar
            </button>
            <button type="submit" className={styles.primaryBtn} disabled={isSubmitting}>
              {isSubmitting ? "Validando..." : "Volver al menu"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
