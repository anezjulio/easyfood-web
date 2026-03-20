import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../provider/useAuth";
import { onCashStatusChanged } from "../../feature/cash/service/cash.api";
import { syncCashState } from "../../feature/cash/service/cash.operation";
import { markCashSessionClosed } from "../../feature/cash/service/cash.session";
import styles from "./SessionStatusBar.module.css";

export default function SessionStatusBar({ showSalesShortcut = true }: { showSalesShortcut?: boolean }) {
  const nav = useNavigate();
  const auth = useAuth();
  const [isCashOpen, setIsCashOpen] = useState(false);
  const username = auth.user?.username ?? "";
  const isCashOpenForSession = isCashOpen;

  useEffect(() => {
    if (!username) {
      return;
    }

    let alive = true;

    async function loadCashState(operator: string) {
      const { isOpen } = await syncCashState(operator);
      if (!alive) return;
      setIsCashOpen(isOpen);
    }

    void loadCashState(username);

    const off = onCashStatusChanged((operator) => {
      if (operator !== username) return;
      void loadCashState(operator);
    });

    return () => {
      alive = false;
      off();
    };
  }, [username]);

  function handleLogout() {
    if (auth.user?.username) {
      markCashSessionClosed(auth.user.username);
    }
    setIsCashOpen(false);
    auth.logout();
    nav("/login", { replace: true });
  }

  return (
    <div className={styles.sessionBar}>
      <button type="button" onClick={() => nav("/help")} className={styles.helpBtn} aria-label="Abrir ayuda del sistema">
        <span className={styles.helpIcon} aria-hidden="true">
          ?
        </span>
        <span>Ayuda</span>
      </button>
      <div className={styles.userLabel}>
        Usuario: <span className={styles.userName}>{auth.user?.username || "-"}</span>
      </div>
      <div className={`${styles.cashState} ${isCashOpenForSession ? styles.cashOpen : styles.cashClosed}`}>
        {isCashOpenForSession ? "Caja abierta" : "Caja cerrada"}
      </div>
      {showSalesShortcut && isCashOpenForSession ? (
        <button type="button" onClick={() => nav("/sales")} className={styles.salesBtn}>
          Ventas
        </button>
      ) : null}
      <button type="button" onClick={() => nav("/cash")} className={styles.cashActionBtn}>
        {isCashOpenForSession ? "Cerrar caja" : "Abrir caja"}
      </button>
      <button type="button" onClick={handleLogout} className={styles.logoutBtn}>
        Cerrar sesion
      </button>
    </div>
  );
}

