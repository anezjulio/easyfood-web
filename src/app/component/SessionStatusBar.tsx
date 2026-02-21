import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../provider/AuthProvider";
import { fetchCurrentWorkdayApi, onCashStatusChanged } from "../../feature/cash/service/cash.api";
import styles from "./SessionStatusBar.module.css";

export default function SessionStatusBar({ showSalesShortcut = true }: { showSalesShortcut?: boolean }) {
  const nav = useNavigate();
  const auth = useAuth();
  const [isCashOpen, setIsCashOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    async function loadCashState() {
      if (!auth.user?.username) {
        setIsCashOpen(false);
        return;
      }
      try {
        const current = await fetchCurrentWorkdayApi(auth.user.username);
        if (!alive) return;
        const currentStatus = current?.status || (current?.endedAt ? "closed" : "open");
        setIsCashOpen(currentStatus === "open");
      } catch {
        if (!alive) return;
        setIsCashOpen(false);
      }
    }

    void loadCashState();

    const off = onCashStatusChanged(() => {
      void loadCashState();
    });
    const pollId = window.setInterval(() => {
      void loadCashState();
    }, 4000);
    const handleFocus = () => {
      void loadCashState();
    };
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      void loadCashState();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      alive = false;
      off();
      window.clearInterval(pollId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [auth.user?.username]);

  function handleLogout() {
    auth.logout();
    nav("/login", { replace: true });
  }

  return (
    <div className={styles.sessionBar}>
      <div className={styles.userLabel}>
        Usuario: <span className={styles.userName}>{auth.user?.username || "-"}</span>
      </div>
      <div className={`${styles.cashState} ${isCashOpen ? styles.cashOpen : styles.cashClosed}`}>
        {isCashOpen ? "Caja abierta" : "Caja cerrada"}
      </div>
      {showSalesShortcut && isCashOpen ? (
        <button type="button" onClick={() => nav("/sales")} className={styles.salesBtn}>
          Ventas
        </button>
      ) : null}
      <button type="button" onClick={handleLogout} className={styles.logoutBtn}>
        Cerrar sesion
      </button>
    </div>
  );
}
