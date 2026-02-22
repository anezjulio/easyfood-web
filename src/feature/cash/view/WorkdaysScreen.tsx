import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import { useAuth } from "../../../app/provider/useAuth";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { formatDateTimeAR as formatDateTime, formatMoneyARS } from "../../../shared/format/locale";
import { normalizeForSearch } from "../../../shared/search/search";
import type { Workday } from "../model/cash.types";
import { fetchWorkdaysApi } from "../service/cash.api";
import type { Order } from "../../sale/model/sale.types";
import { fetchOrdersApi } from "../../sale/service/sale.api";
import styles from "./WorkdaysScreen.module.css";

type WorkdaySortKey = "id" | "operator" | "startedAt" | "endedAt" | "orders";
type WorkdaysNavigationState = {
  from?: string;
  workdayId?: string;
  orderId?: string;
};

function formatWorkdayClose(item: Workday) {
  if (item.endedAt) return formatDateTime(item.endedAt);
  const status = item.status || (item.endedAt ? "closed" : "open");
  return status === "pending-close" ? "Pendiente admin" : "-";
}

function formatDuration(startIso: string, endIso?: string) {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "-";
  const totalMinutes = Math.floor((end - start) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export default function WorkdaysScreen() {
  const auth = useAuth();
  const location = useLocation();
  const [workdays, setWorkdays] = useState<Workday[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedWorkdayId, setSelectedWorkdayId] = useState<string | null>(null);
  const [idFilter, setIdFilter] = useState("");
  const [operatorFilter, setOperatorFilter] = useState("");
  const [startedFilter, setStartedFilter] = useState("");
  const [endedFilter, setEndedFilter] = useState("");
  const [sortKey, setSortKey] = useState<WorkdaySortKey>("startedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [hasUserSorted, setHasUserSorted] = useState(false);
  const [expandedOrderIds, setExpandedOrderIds] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [workdayList, orderList] = await Promise.all([fetchWorkdaysApi(), fetchOrdersApi()]);
      setWorkdays(workdayList);
      setOrders(orderList);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const idQuery = normalizeForSearch(idFilter);
    const operatorQuery = normalizeForSearch(operatorFilter);
    let list = workdays;
    if (idQuery) list = list.filter((item) => normalizeForSearch(item.id).includes(idQuery));
    if (operatorQuery) list = list.filter((item) => normalizeForSearch(item.operator).includes(operatorQuery));
    if (startedFilter) list = list.filter((item) => item.startedAt.slice(0, 10) === startedFilter);
    if (endedFilter) list = list.filter((item) => (item.endedAt || "").slice(0, 10) === endedFilter);

    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "id") return a.id.localeCompare(b.id) * dir;
      if (sortKey === "operator") return a.operator.localeCompare(b.operator) * dir;
      if (sortKey === "endedAt") return (new Date(a.endedAt || 0).getTime() - new Date(b.endedAt || 0).getTime()) * dir;
      if (sortKey === "orders") return (a.orderIds.length - b.orderIds.length) * dir;
      return (new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()) * dir;
    });
  }, [workdays, idFilter, operatorFilter, startedFilter, endedFilter, sortKey, sortDir]);

  const selected = useMemo(
    () => workdays.find((item) => item.id === selectedWorkdayId) || null,
    [workdays, selectedWorkdayId],
  );

  const selectedOrders = useMemo(() => {
    if (!selected) return [];
    const setIds = new Set(selected.orderIds);
    return orders.filter((item) => setIds.has(item.id));
  }, [orders, selected]);

  useEffect(() => {
    if (loading) return;
    const navState = (location.state as WorkdaysNavigationState | null) || null;
    if (navState?.from !== "balance-cash" || !navState.workdayId) return;
    const targetWorkday = workdays.find((item) => item.id === navState.workdayId);
    if (!targetWorkday) return;
    const timerId = window.setTimeout(() => {
      setSelectedWorkdayId(targetWorkday.id);
      if (navState.orderId && targetWorkday.orderIds.includes(navState.orderId)) {
        setExpandedOrderIds([navState.orderId]);
        return;
      }
      setExpandedOrderIds([]);
    }, 0);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [loading, location.key, location.state, workdays]);

  const selectedTotal = useMemo(
    () => selectedOrders.reduce((acc, item) => acc + item.total, 0),
    [selectedOrders],
  );

  function handleSortChange(nextKey: WorkdaySortKey) {
    setHasUserSorted(true);
    if (sortKey === nextKey) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir("asc");
  }

  function clearSort() {
    setSortKey("startedAt");
    setSortDir("desc");
    setHasUserSorted(false);
  }

  function toggleOrderDetails(orderId: string) {
    setExpandedOrderIds((current) =>
      current.includes(orderId) ? current.filter((id) => id !== orderId) : [...current, orderId],
    );
  }

  if (auth.user?.role !== "admin") {
    return (
      <div className={styles.page}>
        <div className={styles.content}>
          <header className={styles.header}>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Jornadas" }]} asTitle />
            <SessionStatusBar />
          </header>
          <p className={styles.empty}>No tienes permisos para ver jornadas.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Jornadas" }]} asTitle />
            <p className={styles.subtitle}>Listado historico de jornadas cerradas y abiertas.</p>
          </div>
          <SessionStatusBar />
        </header>

        <div className={styles.layout}>
          <section className={styles.tableCard}>
            <div className={styles.tableHead}>
              <SortCell label="Jornada" active={hasUserSorted && sortKey === "id"} onSort={() => handleSortChange("id")} onClear={clearSort} />
              <SortCell label="Operador" active={hasUserSorted && sortKey === "operator"} onSort={() => handleSortChange("operator")} onClear={clearSort} />
              <SortCell label="Inicio" active={hasUserSorted && sortKey === "startedAt"} onSort={() => handleSortChange("startedAt")} onClear={clearSort} />
              <SortCell label="Cierre" active={hasUserSorted && sortKey === "endedAt"} onSort={() => handleSortChange("endedAt")} onClear={clearSort} />
              <SortCell label="Ventas" active={hasUserSorted && sortKey === "orders"} onSort={() => handleSortChange("orders")} onClear={clearSort} />
            </div>

            <div className={styles.tableFilters}>
              <Filter value={idFilter} onChange={setIdFilter} />
              <Filter value={operatorFilter} onChange={setOperatorFilter} />
              <DateFilter value={startedFilter} onChange={setStartedFilter} />
              <DateFilter value={endedFilter} onChange={setEndedFilter} />
              <div />
            </div>

            {loading ? (
              <p className={styles.empty}>Cargando...</p>
            ) : filtered.length === 0 ? (
              <p className={styles.empty}>No hay jornadas.</p>
            ) : (
              filtered.map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  className={`${styles.tableRow} ${selectedWorkdayId === item.id ? styles.rowActive : ""} ${index % 2 === 0 ? styles.rowEven : ""}`}
                  onClick={() => {
                    setSelectedWorkdayId(item.id);
                    setExpandedOrderIds([]);
                  }}
                >
                  <div>{item.id}</div>
                  <div>{item.operator}</div>
                  <div>{formatDateTime(item.startedAt)}</div>
                  <div>{formatWorkdayClose(item)}</div>
                  <div className={styles.cellRight}>{item.orderIds.length}</div>
                </button>
              ))
            )}
          </section>

          <section className={styles.detailCard}>
            <h2 className={styles.detailTitle}>Detalle de jornada</h2>
            {!selected ? (
              <p className={styles.empty}>Selecciona una jornada.</p>
            ) : (
              <div className={styles.detailBody}>
                <p><strong>ID:</strong> {selected.id}</p>
                <p><strong>Operador:</strong> {selected.operator}</p>
                <p><strong>Inicio:</strong> {formatDateTime(selected.startedAt)}</p>
                <p><strong>Cierre:</strong> {formatWorkdayClose(selected)}</p>
                <p><strong>Duracion:</strong> {formatDuration(selected.startedAt, selected.endedAt)}</p>
                <p><strong>Cantidad de ventas:</strong> {selectedOrders.length}</p>
                <p><strong>Total jornada:</strong> <span className={styles.totalHighlight}>{formatMoneyARS(selectedTotal)}</span></p>

                <div className={styles.orderList}>
                  {selectedOrders.map((order, index) => {
                    const expanded = expandedOrderIds.includes(order.id);
                    return (
                      <div key={order.id}>
                        <button
                          type="button"
                          className={`${styles.orderRow} ${index % 2 === 0 ? styles.orderRowEven : ""} ${expanded ? styles.orderRowActive : ""}`}
                          onClick={() => toggleOrderDetails(order.id)}
                          aria-expanded={expanded}
                        >
                          <div>
                            <span className={styles.orderToggleIcon}>{expanded ? "\u25B2" : "\u25BC"}</span> {order.id}
                          </div>
                          <div className={styles.cellRight}>{formatMoneyARS(order.total)}</div>
                          <div className={styles.cellRight}>{formatDateTime(order.createdAt)}</div>
                        </button>

                        {expanded ? (
                          <div className={styles.orderDetailWrap}>
                            <div className={styles.orderDetailHead}>
                              <div>ID producto</div>
                              <div>Nombre</div>
                              <div className={styles.cellRight}>Cantidad</div>
                              <div className={styles.cellRight}>Precio</div>
                              <div className={styles.cellRight}>Subtotal</div>
                            </div>
                            {order.items.map((item) => (
                              <div key={`${order.id}-${item.productId}`} className={styles.orderDetailRow}>
                                <div>{item.productId}</div>
                                <div>{item.productName}</div>
                                <div className={styles.cellRight}>{item.quantity}</div>
                                <div className={styles.cellRight}>{formatMoneyARS(item.unitPrice)}</div>
                                <div className={styles.cellRight}>{formatMoneyARS(item.quantity * item.unitPrice)}</div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function SortCell({
  label,
  active,
  onSort,
  onClear,
}: {
  label: string;
  active: boolean;
  onSort: () => void;
  onClear: () => void;
}) {
  return (
    <div className={styles.sortCell}>
      <button type="button" className={`${styles.sortBtn} ${active ? styles.sortBtnActive : ""}`} onClick={onSort}>
        {label}
      </button>
      {active ? (
        <button type="button" className={styles.clearBtn} onClick={onClear} aria-label={`Quitar orden por ${label}`}>
          x
        </button>
      ) : null}
    </div>
  );
}

function Filter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className={styles.filterWrap}>
      <input className={styles.filterInput} value={value} onChange={(e) => onChange(e.target.value)} />
      {value ? (
        <button type="button" className={styles.clearBtn} onClick={() => onChange("")} aria-label="Limpiar filtro">
          x
        </button>
      ) : null}
    </div>
  );
}

function DateFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className={styles.filterWrap}>
      <input type="date" className={styles.filterInputDate} value={value} onChange={(e) => onChange(e.target.value)} />
      {value ? (
        <button type="button" className={styles.clearBtn} onClick={() => onChange("")} aria-label="Limpiar filtro fecha">
          x
        </button>
      ) : null}
    </div>
  );
}

