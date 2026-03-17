import { Children, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import { formatDateTimeAR as formatDateTime, formatMoneyARS } from "../../../shared/format/locale";
import { notificationTypeLabel } from "../../notification/model/notification.metadata";
import type { AppNotification } from "../../notification/model/notification.types";
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
const ISO_DATE_TIME_REGEX = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;
const MONEY_IN_PARENS_REGEX = /\((\d+(?:[.,]\d+)?)\)/g;
const MONEY_AFTER_WORD_REGEX = /\b(por|con)\s+(\d+(?:[.,]\d+)?)(?=[\s.,)|]|$)/gi;

export default function OperationScreen() {
  const nav = useNavigate();
  const auth = useAuth();
  const isAdmin = auth.user?.role === "admin";
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState("");

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
        if (ignore) return;
        setAlertsLoading(false);
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
          <div className={styles.groupHeading}>
            <div className={styles.groupTitleRow}>
              <h2 className={styles.groupTitle}>Alertas</h2>
              {activeAlerts.length > 1 ? <span className={styles.countBadge}>{activeAlerts.length}</span> : null}
            </div>

            <button type="button" className={styles.linkBtn} onClick={() => nav("/notifications")}>
              Ver todas
            </button>
          </div>

          <AlertCarousel>
            {alertsLoading ? (
              <InfoCard
                title="Cargando alertas"
                subtitle="Sistema"
                description="Estamos consultando vencimientos, mercancia, stock y otras alertas operativas."
                tone="neutral"
              />
            ) : alertsError ? (
              <InfoCard title="Alertas no disponibles" subtitle="Sistema" description={alertsError} tone="critical" />
            ) : activeAlerts.length > 0 ? (
              activeAlerts.map((item) => <SystemAlertCard key={item.id} item={item} />)
            ) : (
              <InfoCard
                title="Todo en orden"
                subtitle="Sistema"
                description="No hay alertas activas de stock, vencimientos, gastos programados o mercancia por recibir."
                tone="neutral"
              />
            )}
          </AlertCarousel>
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

function AlertCarousel({ children }: { children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({
    pointerId: -1,
    startX: 0,
    scrollLeft: 0,
    maxScrollLeft: 0,
    scrollFactor: 1,
  });
  const slides = Children.toArray(children);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(slides.length > 1);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    updateCarouselState();

    function handleResize() {
      updateCarouselState();
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [slides.length]);

  function updateCarouselState() {
    const track = trackRef.current;
    if (!track) return;

    const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);
    setCanScrollPrev(track.scrollLeft > 8);
    setCanScrollNext(track.scrollLeft < maxScrollLeft - 8);
  }

  function getScrollStep() {
    const track = trackRef.current;
    if (!track) return 0;

    const firstSlide = track.firstElementChild as HTMLElement | null;
    if (!firstSlide) return track.clientWidth;

    const stylesComputed = window.getComputedStyle(track);
    const gap = Number.parseFloat(stylesComputed.columnGap || stylesComputed.gap || "0") || 0;
    return firstSlide.offsetWidth + gap;
  }

  function scrollByDirection(direction: -1 | 1) {
    const track = trackRef.current;
    if (!track) return;

    track.scrollBy({
      left: getScrollStep() * direction,
      behavior: "smooth",
    });
  }

  function getScrollbarDragMetrics(track: HTMLDivElement) {
    const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);
    const thumbWidth = track.scrollWidth > 0 ? (track.clientWidth * track.clientWidth) / track.scrollWidth : track.clientWidth;
    const maxThumbTravel = Math.max(1, track.clientWidth - thumbWidth);
    const scrollFactor = maxScrollLeft > 0 ? maxScrollLeft / maxThumbTravel : 1;

    return {
      maxScrollLeft,
      scrollFactor,
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const track = trackRef.current;
    if (!track) return;

    event.preventDefault();
    const { maxScrollLeft, scrollFactor } = getScrollbarDragMetrics(track);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: track.scrollLeft,
      maxScrollLeft,
      scrollFactor,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const track = trackRef.current;
    if (!track || dragRef.current.pointerId !== event.pointerId) return;

    event.preventDefault();
    const delta = event.clientX - dragRef.current.startX;
    const nextScrollLeft = dragRef.current.scrollLeft + delta * dragRef.current.scrollFactor;
    track.scrollLeft = Math.min(dragRef.current.maxScrollLeft, Math.max(0, nextScrollLeft));
  }

  function handlePointerRelease(event: React.PointerEvent<HTMLDivElement>) {
    const track = trackRef.current;
    if (!track || dragRef.current.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragRef.current.pointerId = -1;
    setIsDragging(false);
    updateCarouselState();
  }

  function handleControlPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
  }

  return (
      <div className={styles.alertCarousel}>
      <div
        className={`${styles.alertCarouselViewport} ${isDragging ? styles.alertCarouselViewportDragging : ""}`.trim()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerRelease}
        onPointerCancel={handlePointerRelease}
      >
        {slides.length > 1 ? (
          <>
            <button
              type="button"
              className={`${styles.carouselBtn} ${styles.carouselBtnPrev}`.trim()}
              onClick={() => scrollByDirection(-1)}
              onPointerDown={handleControlPointerDown}
              disabled={!canScrollPrev}
              aria-label="Ver alertas anteriores"
            >
              <span aria-hidden="true">&lt;</span>
            </button>
            <button
              type="button"
              className={`${styles.carouselBtn} ${styles.carouselBtnNext}`.trim()}
              onClick={() => scrollByDirection(1)}
              onPointerDown={handleControlPointerDown}
              disabled={!canScrollNext}
              aria-label="Ver mas alertas"
            >
              <span aria-hidden="true">&gt;</span>
            </button>
          </>
        ) : null}

        <div
          ref={trackRef}
          className={`${styles.alertCarouselTrack} ${slides.length > 1 ? styles.alertCarouselTrackWithControls : ""} ${isDragging ? styles.alertCarouselTrackDragging : ""}`.trim()}
          onScroll={updateCarouselState}
          onDragStart={(event) => event.preventDefault()}
        >
          {slides.map((slide, index) => (
            <div key={index} className={styles.alertSlide}>
              {slide}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getAlertMeta(item: AppNotification) {
  const dueAt = getTime(item.dueAt);

  if (Number.isFinite(dueAt)) {
    return `${dueAt <= Date.now() ? "Vencio" : "Vence"} ${formatDateTime(item.dueAt)}`;
  }

  return `Creada ${formatDateTime(item.createdAt)}`;
}

function parseNumber(raw: string) {
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function formatEmbeddedDateTimes(text: string) {
  return text.replace(ISO_DATE_TIME_REGEX, (value) => formatDateTime(value));
}

function formatEmbeddedMoney(text: string) {
  const withParenthesizedMoney = text.replace(MONEY_IN_PARENS_REGEX, (_match, amount) => {
    const parsed = parseNumber(amount);
    return parsed === null ? `(${amount})` : `(${formatMoneyARS(parsed)})`;
  });

  return withParenthesizedMoney.replace(MONEY_AFTER_WORD_REGEX, (_match, keyword, amount) => {
    const parsed = parseNumber(amount);
    return parsed === null ? `${keyword} ${amount}` : `${keyword} ${formatMoneyARS(parsed)}`;
  });
}

function formatAlertDescription(item: AppNotification) {
  if (item.type === "product-low-stock") {
    const currentUnits = item.description.match(/Stock actual\s+(\d+)/i)?.[1];
    const minUnits = item.description.match(/Minimo configurado\s+(\d+)/i)?.[1];

    if (currentUnits && minUnits) {
      return `Stock actual: ${currentUnits} u. Minimo configurado: ${minUnits} u. Reponer producto.`;
    }
  }

  if (item.type === "expense-created") {
    const amount = item.description.match(/\((\d+(?:[.,]\d+)?)\)/)?.[1];
    const parsedAmount = amount ? parseNumber(amount) : null;
    const baseDescription = item.description.replace(/\s*\((\d+(?:[.,]\d+)?)\)\.?/, "").replace(/\.+$/, "").trim();

    if (parsedAmount !== null && baseDescription) {
      return `${baseDescription}. Monto: ${formatMoneyARS(parsedAmount)}.`;
    }
  }

  return formatEmbeddedMoney(formatEmbeddedDateTimes(item.description));
}

function SystemAlertCard({ item }: { item: AppNotification }) {
  const tone = getAlertTone(item);
  const toneClass =
    tone === "critical" ? styles.alertCardCritical : tone === "warning" ? styles.alertCardWarning : styles.alertCardNeutral;
  const footerToneClass = tone === "critical" ? styles.alertPillCritical : tone === "warning" ? styles.alertPillWarning : "";

  return (
    <article className={`${styles.alertCard} ${toneClass}`.trim()}>
      <div className={styles.alertCardTitle}>{item.title}</div>
      <div className={styles.alertCardSubtitle}>{notificationTypeLabel[item.type]}</div>
      <p className={styles.alertCardDescription}>{formatAlertDescription(item)}</p>

      <div className={styles.alertCardFooter}>
        <span className={`${styles.alertPill} ${footerToneClass}`.trim()}>{getAlertMeta(item)}</span>
        {item.requiresAction ? <span className={`${styles.alertPill} ${footerToneClass}`.trim()}>Accion requerida</span> : null}
        {item.requiresAction && item.actionLabel ? <span className={styles.alertPill}>{item.actionLabel}</span> : null}
      </div>
    </article>
  );
}

function InfoCard({
  title,
  subtitle,
  description,
  tone,
}: {
  title: string;
  subtitle: string;
  description: string;
  tone: "neutral" | "critical";
}) {
  const className = `${styles.alertCard} ${tone === "critical" ? styles.alertCardCritical : styles.alertCardNeutral}`.trim();

  return (
    <article className={className}>
      <div className={styles.alertCardTitle}>{title}</div>
      <div className={styles.alertCardSubtitle}>{subtitle}</div>
      <p className={styles.alertCardDescription}>{description}</p>
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
