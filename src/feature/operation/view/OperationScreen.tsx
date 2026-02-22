import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../app/provider/useAuth";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import styles from "./OperationScreen.module.css";

export default function OperationScreen() {
  const nav = useNavigate();
  const auth = useAuth();
  const isAdmin = auth.user?.role === "admin";

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu" }]} asTitle />
            <p className={styles.subtitle}>Selecciona una opcion</p>
          </div>

          <SessionStatusBar />
        </header>

        <section className={styles.groupSection}>
          <h2 className={styles.groupTitle}>Operaciones</h2>
          <div className={styles.grid}>
            <BigBtn title="Ventas" subtitle="Cobros y tickets" onClick={() => nav("/sales")} />
            <BigBtn title="Caja" subtitle="Apertura y cierre de turno" onClick={() => nav("/cash")} />
            <BigBtn title="Solicitudes" subtitle="Gestion de solicitudes" onClick={() => nav("/requests")} />
            <BigBtn title="Gastos" subtitle="Registro de egresos" onClick={() => nav("/expenses")} />
          </div>
        </section>

        <section className={styles.groupSection}>
          <h2 className={styles.groupTitle}>Productos</h2>
          <div className={styles.grid}>
            <BigBtn title="Cargar Mercancia" subtitle="Nuevo producto o carga de stock" onClick={() => nav("/stock")} />
            <BigBtn title="Recibir Mercancia" subtitle="Recepcion de pedidos" onClick={() => nav("/supplies/receiving")} />
          </div>
        </section>

        {isAdmin ? (
          <section className={styles.groupSection}>
            <h2 className={styles.groupTitle}>Administrativo</h2>
            <div className={styles.grid}>
              <BigBtn title="Balance" subtitle="Cierres y totales" onClick={() => nav("/balance")} />
              <BigBtn
                title="Aprobar Solicitudes"
                subtitle="Flujo de aprobacion"
                onClick={() => nav("/requests/approvals")}
              />
              <BigBtn title="Usuarios" subtitle="Gestion de usuarios" onClick={() => nav("/users")} />
              <BigBtn
                title="Permisos/Licencias"
                subtitle="Control de accesos"
                onClick={() => nav("/licenses")}
              />
              <BigBtn title="Notificaciones" subtitle="Avisos del sistema" onClick={() => nav("/notifications")} />
              <BigBtn title="Productos" subtitle="Alta y edicion de productos" onClick={() => nav("/products/new")} />
              <BigBtn title="Finanzas" subtitle="Margenes, pagos e impuestos" onClick={() => nav("/finances")} />
              <BigBtn title="Pedido Mercancia" subtitle="Carga de pedidos esperados" onClick={() => nav("/supplies/orders")} />
              <BigBtn title="Jornadas" subtitle="Historial de jornadas" onClick={() => nav("/workdays")} />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function BigBtn({ title, subtitle, onClick }: { title: string; subtitle: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={styles.bigBtn}>
      <div className={styles.bigBtnTitle}>{title}</div>
      <div className={styles.bigBtnSubtitle}>{subtitle}</div>
    </button>
  );
}

