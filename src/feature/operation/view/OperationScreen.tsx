import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import { formatDateTimeAR as formatDateTime } from "../../../shared/format/locale";
import { notificationTypeLabel } from "../../notification/model/notification.metadata";
import type { AppNotification, NotificationType } from "../../notification/model/notification.types";
import { fetchNotificationsApi } from "../../notification/service/notification.api";
import styles from "./OperationScreen.module.css";

const CRITICAL_ALERT_TYPES = new Set([
  "license-required",
  "license-expiring",
  "product-expiring",
  "supply-approved",
  "supply-pending-receive",
]);
const WARNING_ALERT_TYPES = new Set([
  "product-low-stock",
  "expense-created",
  "manual-action",
  "manual-due",
  "supply-requested",
]);

export default function OperationScreen() {
  const nav = useNavigate();
  const auth = useAuth();
  const isAdmin = auth.user?.role === "admin";
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState("");
  const [selectedAlertType, setSelectedAlertType] = useState<"all" | NotificationType>("all");

  useEffect(() => {
    let ignore = false;

    async function loadAlerts() {
      setAlertsLoading(true);
      setAlertsError("");

      try {
        const list = await fetchNotificationsApi();
        if (ignore) return;
        setNotifications(list);
      } catch {
        if (ignore) return;
        setAlertsError("No se pudieron cargar las alertas del sistema.");
      } finally {
        if (!ignore) {
          setAlertsLoading(false);
        }
      }
    }

    void loadAlerts();

    return () => {
      ignore = true;
    };
  }, []);

  const activeAlerts = useMemo(() => {
    const now = Date.now();

    return notifications
      .filter((item) => item.status === "active" && shouldShowInAlertsMenu(item))
      .sort((a, b) => {
        const priorityDiff = getAlertPriority(a, now) - getAlertPriority(b, now);
        if (priorityDiff !== 0) return priorityDiff;

        const aDue = getTime(a.dueAt);
        const bDue = getTime(b.dueAt);

        if (Number.isFinite(aDue) && Number.isFinite(bDue) && aDue !== bDue) {
          return aDue - bDue;
        }

        if (Number.isFinite(aDue) !== Number.isFinite(bDue)) {
          return Number.isFinite(aDue) ? -1 : 1;
        }

        return getTime(b.createdAt) - getTime(a.createdAt);
      });
  }, [notifications]);

  const alertTypeOptions = useMemo(
    () =>
      [...new Set(activeAlerts.map((item) => item.type))].sort((a, b) =>
        notificationTypeLabel[a].localeCompare(notificationTypeLabel[b]),
      ),
    [activeAlerts],
  );

  const activeSelectedAlertType =
    selectedAlertType === "all" || alertTypeOptions.includes(selectedAlertType) ? selectedAlertType : "all";

  const filteredAlerts = useMemo(() => {
    if (activeSelectedAlertType === "all") return activeAlerts;
    return activeAlerts.filter((item) => item.type === activeSelectedAlertType);
  }, [activeAlerts, activeSelectedAlertType]);

  const alertCountLabel =
    activeSelectedAlertType === "all" ? String(activeAlerts.length) : `${filteredAlerts.length}/${activeAlerts.length}`;

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu" }]} asTitle />
          </div>

          <SessionStatusBar />
        </header>

        <section className={styles.alertsSection}>
          <div className={styles.groupHeading}>
            <div className={styles.groupTitleRow}>
              <button type="button" className={styles.groupTitleLink} onClick={() => nav("/notifications")}>
                Alertas
              </button>
              <span className={styles.countBadge}>{alertCountLabel}</span>
              {!alertsLoading && !alertsError ? (
                <div className={styles.alertFilters}>
                  <button
                    type="button"
                    className={`${styles.alertFilterBtn} ${activeSelectedAlertType === "all" ? styles.alertFilterBtnActive : ""}`.trim()}
                    onClick={() => setSelectedAlertType("all")}
                  >
                    Todos
                  </button>
                  {alertTypeOptions.map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={`${styles.alertFilterBtn} ${activeSelectedAlertType === type ? styles.alertFilterBtnActive : ""}`.trim()}
                      onClick={() => setSelectedAlertType(type)}
                    >
                      {notificationTypeLabel[type]}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {alertsLoading ? (
            <AlertStatusPanel
              title="Cargando alertas"
              description="Estamos consultando vencimientos, mercancia, stock y otras alertas operativas."
              tone="neutral"
            />
          ) : alertsError ? (
            <AlertStatusPanel title="Alertas no disponibles" description={alertsError} tone="critical" />
          ) : (
            <section className={styles.alertListPanel}>
              {filteredAlerts.length === 0 ? (
                <div className={styles.alertEmptyState}>
                  <strong>Sin resultados</strong>
                  <span>No hay alertas activas para el filtro seleccionado.</span>
                </div>
              ) : (
                <div className={styles.alertListCompact}>
                  {filteredAlerts.map((item) => (
                    <AlertRailItem key={item.id} item={item} />
                  ))}
                </div>
              )}
            </section>
          )}
        </section>

        <section className={styles.groupSection}>
          <h2 className={styles.groupTitle}>Operaciones</h2>
          <div className={styles.grid}>
            <BigBtn title="Ventas" subtitle="Cobros y tickets" onClick={() => nav("/sales")} variant="sales" />
            <BigBtn title="Caja" subtitle="Apertura y cierre de turno" onClick={() => nav("/cash")} />
            <BigBtn title="Solicitudes" subtitle="Gestion de solicitudes" onClick={() => nav("/requests")} />
            <BigBtn
              title="Sugerencias y reclamos"
              subtitle="Libro de sugerencias y reclamos"
              onClick={() => nav("/feedback")}
            />
            <BigBtn
              title="Confirmar Gasto"
              subtitle="Validar gastos asignados"
              onClick={() => nav("/expenses", { state: { tab: "confirm" } })}
            />
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
              <BigBtn title="Finanzas" subtitle="Margenes, pagos e impuestos" onClick={() => nav("/finances")} />
              <BigBtn title="Transacciones" subtitle="Entradas y salidas" onClick={() => nav("/transactions")} />
              <BigBtn title="Notificaciones" subtitle="Avisos del sistema" onClick={() => nav("/notifications")} />
              <BigBtn title="Jornadas" subtitle="Historial de jornadas" onClick={() => nav("/workdays")} />
              <BigBtn title="Gastos" subtitle="Registro y asignacion" onClick={() => nav("/expenses", { state: { tab: "create" } })} />
              <BigBtn title="Pedido Mercancia" subtitle="Carga de pedidos esperados" onClick={() => nav("/supplies/orders")} />
              <BigBtn title="Productos" subtitle="Alta y edicion de productos" onClick={() => nav("/products/new")} />
              <BigBtn
                title="Aprobar Solicitudes"
                subtitle="Flujo de aprobacion"
                onClick={() => nav("/requests/approvals")}
              />
              <BigBtn title="Usuarios" subtitle="Gestion de usuarios" onClick={() => nav("/users")} />
              <BigBtn title="Data" subtitle="Limpieza de base de datos" onClick={() => nav("/data")} />
              <BigBtn
                title="Permisos/Licencias"
                subtitle="Control de accesos"
                onClick={() => nav("/licenses")}
              />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function getTime(value?: string) {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
}

function getAlertPriority(item: AppNotification, now: number) {
  const dueAt = getTime(item.dueAt);
  const isOverdue = Number.isFinite(dueAt) && dueAt <= now;
  const isDueSoon = Number.isFinite(dueAt) && dueAt > now && dueAt - now <= 1000 * 60 * 60 * 48;

  if (isOverdue) return 0;
  if (CRITICAL_ALERT_TYPES.has(item.type)) return 1;
  if (item.requiresAction) return 2;
  if (WARNING_ALERT_TYPES.has(item.type)) return 3;
  if (isDueSoon) return 4;
  if (item.isFixed) return 6;
  return 5;
}

function getAlertTone(item: AppNotification): "critical" | "warning" | "neutral" {
  const now = Date.now();
  const dueAt = getTime(item.dueAt);

  if (Number.isFinite(dueAt) && dueAt <= now) return "critical";
  if (CRITICAL_ALERT_TYPES.has(item.type)) return "critical";
  if (item.requiresAction || WARNING_ALERT_TYPES.has(item.type)) return "warning";

  return "neutral";
}

function shouldShowInAlertsMenu(item: AppNotification) {
  return getAlertTone(item) !== "neutral";
}

function getAlertDateLabel(item: AppNotification) {
  const dueAt = getTime(item.dueAt);

  if (Number.isFinite(dueAt) && item.dueAt) {
    return `${dueAt <= Date.now() ? "Vencio" : "Vence"} ${formatDateTime(item.dueAt)}`;
  }

  return `Creada ${formatDateTime(item.createdAt)}`;
}

function getAlertToneClass(item: AppNotification) {
  const tone = getAlertTone(item);

  if (tone === "critical") return styles.alertToneCritical;
  if (tone === "warning") return styles.alertToneWarning;
  return styles.alertToneNeutral;
}

function AlertStatusPanel({
  title,
  description,
  tone,
}: {
  title: string;
  description: string;
  tone: "neutral" | "critical";
}) {
  return (
    <article className={`${styles.alertStatusPanel} ${tone === "critical" ? styles.alertToneCritical : styles.alertToneNeutral}`.trim()}>
      <h3 className={styles.alertStatusTitle}>{title}</h3>
      <p className={styles.alertStatusDescription}>{description}</p>
    </article>
  );
}

function AlertRailItem({ item }: { item: AppNotification }) {
  return (
    <article className={`${styles.alertRailItem} ${getAlertToneClass(item)}`.trim()}>
      <span className={styles.alertRailBar} aria-hidden="true" />
      <div className={styles.alertRailBody}>
        <div className={styles.alertRailLinePrimary}>
          <div className={styles.alertRailTitle}>{item.title}</div>
          <div className={styles.alertRailDate}>{getAlertDateLabel(item)}</div>
        </div>
        <div className={styles.alertRailLineSecondary}>
          <span className={styles.alertRailType}>{notificationTypeLabel[item.type]}</span>
          <p className={styles.alertRailDescription}>{item.description}</p>
        </div>
      </div>
    </article>
  );
}

function BigBtn({
  title,
  subtitle,
  onClick,
  variant = "default",
}: {
  title: string;
  subtitle?: string;
  onClick: () => void;
  variant?: "default" | "sales";
}) {
  const className = `${styles.bigBtn} ${variant === "sales" ? styles.bigBtnSales : ""}`.trim();

  return (
    <button type="button" onClick={onClick} className={className}>
      <div className={styles.bigBtnTitle}>{title}</div>
      {subtitle ? <div className={styles.bigBtnSubtitle}>{subtitle}</div> : null}
    </button>
  );
}
