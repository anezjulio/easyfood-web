import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import { formatDateTimeAR as formatDateTime, formatMoneyARS } from "../../../shared/format/locale";
import type { Workday } from "../../cash/model/cash.types";
import { fetchWorkdaysApi } from "../../cash/service/cash.api";
import type { Expense } from "../../expense/model/expense.types";
import { fetchExpensesApi } from "../../expense/service/expense.api";
import type { Order } from "../../sale/model/sale.types";
import { fetchOrdersApi } from "../../sale/service/sale.api";
import type { SupplyOrder } from "../../supply/model/supply.types";
import { fetchSupplyOrdersApi } from "../../supply/service/supply.api";
import type { FinancialAccount } from "../../transaction/model/transaction.types";
import { fetchFinancialAccountsApi } from "../../transaction/service/transaction.api";
import styles from "./ReportsScreen.module.css";

type WorkdayTab = "daily" | "weekly" | "monthly";
type BalanceTab = "workdays" | "expenses" | "supplies" | "sales" | "cash" | "accounts";

type OperatorGroup = {
  operator: string;
  workdays: Workday[];
  totalSales: number;
  totalMinutes: number;
  hasOpen: boolean;
};

type WorkdayChartPoint = {
  id: string;
  label: string;
  helper: string;
  total: number;
};

type WorkdayChartModel = {
  title: string;
  subtitle: string;
  points: WorkdayChartPoint[];
};

function formatDateOnly(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short" }).format(d);
}

function formatTimeOnly(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-AR", { timeStyle: "short", hour12: false }).format(d);
}

function getWorkdayMinutes(startIso: string, endIso?: string) {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 60000);
}

function formatDuration(startIso: string, endIso?: string) {
  const mins = getWorkdayMinutes(startIso, endIso);
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

function formatMinutes(totalMinutes: number) {
  const safe = Math.max(0, Math.floor(totalMinutes));
  return `${Math.floor(safe / 60)}h ${String(safe % 60).padStart(2, "0")}m`;
}

function startOfWeekMonday(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() + diff);
  return result;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function safeMoney(value: number | undefined) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value || 0));
}

function normalizeText(value: string) {
  return String(value || "").trim().toLowerCase();
}

function paidOrderTotal(order?: Order | null) {
  if (!order || order.status !== "pagada") return 0;
  return safeMoney(order.total);
}

function orderStatusLabel(status: Order["status"]) {
  if (status === "pagada") return "Pagada";
  if (status === "cancelada") return "Cancelada";
  return "Por pagar";
}

function isWorkdayOpen(workday: Workday) {
  const status = workday.status || (workday.endedAt ? "closed" : "open");
  return status === "open";
}

function buildOperatorGroups(workdayList: Workday[], ordersById: Map<string, Order>) {
  const groups = new Map<string, OperatorGroup>();

  for (const wd of workdayList) {
    const dayOrders = wd.orderIds.map((id) => ordersById.get(id)).filter((item): item is Order => !!item);
    const totalSales = dayOrders.reduce((acc, item) => acc + paidOrderTotal(item), 0);
    const minutes = getWorkdayMinutes(wd.startedAt, wd.endedAt);
    const current = groups.get(wd.operator) || {
      operator: wd.operator,
      workdays: [],
      totalSales: 0,
      totalMinutes: 0,
      hasOpen: false,
    };
    current.workdays.push(wd);
    current.totalSales += totalSales;
    current.totalMinutes += minutes;
    if (isWorkdayOpen(wd)) current.hasOpen = true;
    groups.set(wd.operator, current);
  }

  return [...groups.values()].sort((a, b) => a.operator.localeCompare(b.operator));
}

function computeWorkdaySummary(workdayList: Workday[], ordersById: Map<string, Order>) {
  let totalMinutes = 0;
  let totalSales = 0;

  for (const wd of workdayList) {
    totalMinutes += getWorkdayMinutes(wd.startedAt, wd.endedAt);
    const dayOrders = wd.orderIds.map((id) => ordersById.get(id)).filter((item): item is Order => !!item);
    totalSales += dayOrders.reduce((acc, item) => acc + paidOrderTotal(item), 0);
  }

  return {
    workdays: workdayList.length,
    totalMinutes,
    totalSales,
  };
}

function countUniqueOperators(workdayList: Workday[]) {
  return new Set(workdayList.map((item) => normalizeText(item.operator)).filter((item) => item.length > 0)).size;
}

function WorkdayTotalsChart({ model }: { model: WorkdayChartModel }) {
  const maxTotal = model.points.reduce((max, point) => Math.max(max, point.total), 0);

  return (
    <section className={styles.chartBlock} aria-label={model.title}>
      <header className={styles.chartHeader}>
        <h3 className={styles.chartTitle}>{model.title}</h3>
        <p className={styles.chartSubtitle}>{model.subtitle}</p>
      </header>

      {model.points.length === 0 ? (
        <p className={styles.chartEmpty}>Sin datos para graficar en este periodo.</p>
      ) : (
        <div className={styles.chartScroller}>
          <div className={styles.chartGrid}>
            {model.points.map((point) => {
              const ratio = maxTotal > 0 ? point.total / maxTotal : 0;
              const fillHeight = `${Math.max(8, Math.round(ratio * 100))}%`;
              return (
                <article key={point.id} className={styles.chartItem} title={`${point.label} - ${formatMoneyARS(point.total)}`}>
                  <p className={styles.chartValue}>{formatMoneyARS(point.total)}</p>
                  <div className={styles.chartTrack}>
                    <div className={styles.chartFill} style={{ height: fillHeight }} />
                  </div>
                  <p className={styles.chartLabel}>{point.label}</p>
                  <p className={styles.chartHelper}>{point.helper}</p>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

export default function ReportsScreen() {
  const auth = useAuth();
  const nav = useNavigate();
  const [balanceTab, setBalanceTab] = useState<BalanceTab>("workdays");
  const [workdayTab, setWorkdayTab] = useState<WorkdayTab>("daily");
  const [workdays, setWorkdays] = useState<Workday[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [supplyOrders, setSupplyOrders] = useState<SupplyOrder[]>([]);
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedWorkdays, setExpandedWorkdays] = useState<string[]>([]);
  const [expandedWeekly, setExpandedWeekly] = useState<string[]>([]);
  const [expandedMonthly, setExpandedMonthly] = useState<string[]>([]);
  const [selectedCashWorkdayId, setSelectedCashWorkdayId] = useState("");
  const [cashSearch, setCashSearch] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [wd, od, ex, so, accounts] = await Promise.all([
          fetchWorkdaysApi(),
          fetchOrdersApi(),
          fetchExpensesApi(),
          fetchSupplyOrdersApi(),
          fetchFinancialAccountsApi(),
        ]);
        if (!alive) return;
        setWorkdays(wd);
        setOrders(od);
        setExpenses(ex);
        setSupplyOrders(so);
        setFinancialAccounts(accounts);
      } catch {
        if (!alive) return;
        setError("No se pudieron cargar los datos de balance.");
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const sortedWorkdays = useMemo(
    () => [...workdays].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()),
    [workdays],
  );
  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [orders],
  );
  const sortedExpenses = useMemo(
    () =>
      [...expenses]
        .filter((item) => item.status === "confirmed")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [expenses],
  );
  const sortedSupplyOrders = useMemo(() => {
    const pending = supplyOrders
      .filter((item) => item.status === "pending")
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const received = supplyOrders
      .filter((item) => item.status !== "pending")
      .sort((a, b) => new Date(b.receivedAt || b.createdAt).getTime() - new Date(a.receivedAt || a.createdAt).getTime());
    return [...pending, ...received];
  }, [supplyOrders]);

  const ordersById = useMemo(() => {
    const map = new Map<string, Order>();
    for (const o of orders) map.set(o.id, o);
    return map;
  }, [orders]);

  const weeklyWorkdays = useMemo(() => {
    const from = startOfWeekMonday(new Date());
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
    const fromMs = from.getTime();
    const toMs = to.getTime();
    return sortedWorkdays.filter((wd) => {
      const started = new Date(wd.startedAt).getTime();
      return Number.isFinite(started) && started >= fromMs && started <= toMs;
    });
  }, [sortedWorkdays]);

  const monthlyWorkdays = useMemo(() => {
    const now = new Date();
    const fromMs = startOfMonth(now).getTime();
    const toMs = endOfMonth(now).getTime();
    return sortedWorkdays.filter((wd) => {
      const started = new Date(wd.startedAt).getTime();
      return Number.isFinite(started) && started >= fromMs && started <= toMs;
    });
  }, [sortedWorkdays]);

  const weeklyGroups = useMemo(() => buildOperatorGroups(weeklyWorkdays, ordersById), [ordersById, weeklyWorkdays]);
  const monthlyGroups = useMemo(() => buildOperatorGroups(monthlyWorkdays, ordersById), [monthlyWorkdays, ordersById]);
  const dailyWorkdayRows = useMemo(
    () =>
      sortedWorkdays.map((workday) => {
        const dayOrders = workday.orderIds.map((id) => ordersById.get(id)).filter((item): item is Order => !!item);
        const dayTotal = dayOrders.reduce((acc, item) => acc + paidOrderTotal(item), 0);
        return {
          workday,
          dayOrders,
          dayTotal,
        };
      }),
    [ordersById, sortedWorkdays],
  );

  const dailySummary = useMemo(() => computeWorkdaySummary(sortedWorkdays, ordersById), [ordersById, sortedWorkdays]);
  const weeklySummary = useMemo(() => computeWorkdaySummary(weeklyWorkdays, ordersById), [ordersById, weeklyWorkdays]);
  const monthlySummary = useMemo(() => computeWorkdaySummary(monthlyWorkdays, ordersById), [monthlyWorkdays, ordersById]);

  const activeWorkdaySummary = useMemo(() => {
    if (workdayTab === "daily") return dailySummary;
    if (workdayTab === "weekly") return weeklySummary;
    return monthlySummary;
  }, [dailySummary, monthlySummary, weeklySummary, workdayTab]);
  const dailyUsersCount = useMemo(() => countUniqueOperators(sortedWorkdays), [sortedWorkdays]);
  const weeklyUsersCount = useMemo(() => countUniqueOperators(weeklyWorkdays), [weeklyWorkdays]);
  const monthlyUsersCount = useMemo(() => countUniqueOperators(monthlyWorkdays), [monthlyWorkdays]);

  const dailyChartPoints = useMemo<WorkdayChartPoint[]>(
    () =>
      dailyWorkdayRows.map(({ workday, dayTotal }) => ({
        id: workday.id,
        label: formatDateOnly(workday.startedAt),
        helper: workday.operator,
        total: dayTotal,
      })),
    [dailyWorkdayRows],
  );
  const weeklyChartPoints = useMemo<WorkdayChartPoint[]>(
    () =>
      weeklyGroups.map((group) => ({
        id: group.operator,
        label: group.operator,
        helper: `${group.workdays.length} jornadas`,
        total: group.totalSales,
      })),
    [weeklyGroups],
  );
  const monthlyChartPoints = useMemo<WorkdayChartPoint[]>(
    () =>
      monthlyGroups.map((group) => ({
        id: group.operator,
        label: group.operator,
        helper: `${group.workdays.length} jornadas`,
        total: group.totalSales,
      })),
    [monthlyGroups],
  );

  const activeWorkdayChart = useMemo<WorkdayChartModel>(() => {
    if (workdayTab === "daily") {
      return {
        title: "Grafico diario de jornadas",
        subtitle: `${dailySummary.workdays} jornadas, ${dailyUsersCount} usuarios y ${formatMoneyARS(dailySummary.totalSales)} generados.`,
        points: dailyChartPoints,
      };
    }
    if (workdayTab === "weekly") {
      return {
        title: "Grafico semanal por usuario",
        subtitle: `${weeklySummary.workdays} jornadas, ${weeklyUsersCount} usuarios y ${formatMoneyARS(weeklySummary.totalSales)} generados.`,
        points: weeklyChartPoints,
      };
    }
    return {
      title: "Grafico mensual por usuario",
      subtitle: `${monthlySummary.workdays} jornadas, ${monthlyUsersCount} usuarios y ${formatMoneyARS(monthlySummary.totalSales)} generados.`,
      points: monthlyChartPoints,
    };
  }, [
    dailyChartPoints,
    dailySummary.totalSales,
    dailySummary.workdays,
    dailyUsersCount,
    monthlyChartPoints,
    monthlySummary.totalSales,
    monthlySummary.workdays,
    monthlyUsersCount,
    weeklyChartPoints,
    weeklySummary.totalSales,
    weeklySummary.workdays,
    weeklyUsersCount,
    workdayTab,
  ]);

  const expensesTotal = useMemo(() => sortedExpenses.reduce((acc, item) => acc + safeMoney(item.amount), 0), [sortedExpenses]);
  const recurrentExpensesTotal = useMemo(
    () => sortedExpenses.filter((item) => item.expenseType === "recurrent").reduce((acc, item) => acc + safeMoney(item.amount), 0),
    [sortedExpenses],
  );
  const unexpectedExpensesTotal = useMemo(
    () => sortedExpenses.filter((item) => item.expenseType === "unexpected").reduce((acc, item) => acc + safeMoney(item.amount), 0),
    [sortedExpenses],
  );

  const receivedSupplyOrders = useMemo(() => supplyOrders.filter((item) => item.status === "received"), [supplyOrders]);
  const pendingSupplyOrders = useMemo(() => supplyOrders.filter((item) => item.status === "pending"), [supplyOrders]);
  const supplyExpectedTotal = useMemo(() => supplyOrders.reduce((acc, item) => acc + safeMoney(item.expectedTotal), 0), [supplyOrders]);
  const supplyActualTotal = useMemo(
    () => receivedSupplyOrders.reduce((acc, item) => acc + safeMoney(item.actualTotal), 0),
    [receivedSupplyOrders],
  );
  const supplyRemainingTotal = useMemo(
    () => receivedSupplyOrders.reduce((acc, item) => acc + safeMoney(item.remainingAmount), 0),
    [receivedSupplyOrders],
  );

  const paidSales = useMemo(() => orders.filter((item) => item.status === "pagada"), [orders]);
  const pendingSales = useMemo(() => orders.filter((item) => item.status === "por pagar"), [orders]);
  const pendingSalesTotal = useMemo(
    () => pendingSales.reduce((acc, item) => acc + safeMoney(item.total), 0),
    [pendingSales],
  );
  const salesTotal = useMemo(() => paidSales.reduce((acc, item) => acc + safeMoney(item.total), 0), [paidSales]);
  const sortedFinancialAccounts = useMemo(
    () => [...financialAccounts].sort((a, b) => a.name.localeCompare(b.name)),
    [financialAccounts],
  );

  const defaultCashWorkdayId = useMemo(() => {
    const open = sortedWorkdays.find((item) => isWorkdayOpen(item));
    return open?.id || sortedWorkdays[0]?.id || "";
  }, [sortedWorkdays]);

  useEffect(() => {
    setSelectedCashWorkdayId((current) => {
      if (current && sortedWorkdays.some((item) => item.id === current)) return current;
      return defaultCashWorkdayId;
    });
  }, [defaultCashWorkdayId, sortedWorkdays]);

  const selectedCashWorkday = useMemo(
    () => sortedWorkdays.find((item) => item.id === selectedCashWorkdayId) || null,
    [selectedCashWorkdayId, sortedWorkdays],
  );

  const selectedCashOrders = useMemo(() => {
    if (!selectedCashWorkday) return [];
    return selectedCashWorkday.orderIds.map((id) => ordersById.get(id)).filter((item): item is Order => !!item);
  }, [ordersById, selectedCashWorkday]);

  const selectedCashPaidOrders = useMemo(
    () => selectedCashOrders.filter((item) => item.status === "pagada"),
    [selectedCashOrders],
  );

  const selectedCashSalesTotal = useMemo(
    () => selectedCashPaidOrders.reduce((acc, item) => acc + safeMoney(item.total), 0),
    [selectedCashPaidOrders],
  );

  const selectedCashRange = useMemo(() => {
    if (!selectedCashWorkday) return null;
    const from = new Date(selectedCashWorkday.startedAt).getTime();
    const to = selectedCashWorkday.endedAt ? new Date(selectedCashWorkday.endedAt).getTime() : Date.now();
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
    return { from, to };
  }, [selectedCashWorkday]);

  const selectedCashOperator = normalizeText(selectedCashWorkday?.operator || "");
  const selectedCashExpenses = useMemo(() => {
    if (!selectedCashWorkday || !selectedCashRange) return [];
    return sortedExpenses.filter((item) => {
      const t = new Date(item.createdAt).getTime();
      return (
        Number.isFinite(t) &&
        t >= selectedCashRange.from &&
        t <= selectedCashRange.to &&
        normalizeText(item.createdBy) === selectedCashOperator
      );
    });
  }, [selectedCashOperator, selectedCashRange, selectedCashWorkday, sortedExpenses]);

  const selectedCashExpenseTotal = useMemo(
    () => selectedCashExpenses.reduce((acc, item) => acc + safeMoney(item.amount), 0),
    [selectedCashExpenses],
  );

  const selectedCashSupplyOrders = useMemo(() => {
    if (!selectedCashWorkday || !selectedCashRange) return [];
    return sortedSupplyOrders.filter((item) => {
      if (item.status !== "received") return false;
      const owner = normalizeText(item.receivedBy || item.createdBy || "");
      const t = new Date(item.receivedAt || item.createdAt).getTime();
      return Number.isFinite(t) && t >= selectedCashRange.from && t <= selectedCashRange.to && owner === selectedCashOperator;
    });
  }, [selectedCashOperator, selectedCashRange, selectedCashWorkday, sortedSupplyOrders]);

  const selectedCashSupplySpent = useMemo(
    () => selectedCashSupplyOrders.reduce((acc, item) => acc + safeMoney(item.actualTotal), 0),
    [selectedCashSupplyOrders],
  );

  const selectedCashSupplyRemaining = useMemo(
    () => selectedCashSupplyOrders.reduce((acc, item) => acc + safeMoney(item.remainingAmount), 0),
    [selectedCashSupplyOrders],
  );

  const selectedCashBalance = useMemo(
    () => selectedCashSalesTotal - selectedCashExpenseTotal - selectedCashSupplySpent + selectedCashSupplyRemaining,
    [selectedCashExpenseTotal, selectedCashSalesTotal, selectedCashSupplyRemaining, selectedCashSupplySpent],
  );

  const filteredCashWorkdays = useMemo(() => {
    const query = normalizeText(cashSearch);
    if (!query) return sortedWorkdays;
    return sortedWorkdays.filter((item) => {
      const raw = `${item.id} ${item.operator} ${formatDateOnly(item.startedAt)} ${formatDateTime(item.startedAt)} ${item.orderIds.join(" ")}`;
      return normalizeText(raw).includes(query);
    });
  }, [cashSearch, sortedWorkdays]);

  const cashSelectOptions = useMemo(() => {
    if (!selectedCashWorkdayId) return filteredCashWorkdays;
    if (filteredCashWorkdays.some((item) => item.id === selectedCashWorkdayId)) return filteredCashWorkdays;
    const selected = sortedWorkdays.find((item) => item.id === selectedCashWorkdayId);
    return selected ? [selected, ...filteredCashWorkdays] : filteredCashWorkdays;
  }, [filteredCashWorkdays, selectedCashWorkdayId, sortedWorkdays]);

  function toggleWorkday(id: string) {
    setExpandedWorkdays((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleWeeklyOperator(operator: string) {
    setExpandedWeekly((current) =>
      current.includes(operator) ? current.filter((item) => item !== operator) : [...current, operator],
    );
  }

  function toggleMonthlyOperator(operator: string) {
    setExpandedMonthly((current) =>
      current.includes(operator) ? current.filter((item) => item !== operator) : [...current, operator],
    );
  }

  function switchToCashWorkday(workdayId: string) {
    setBalanceTab("cash");
    setSelectedCashWorkdayId(workdayId);
    setCashSearch("");
  }

  function openWorkdaySale(workdayId: string, orderId: string) {
    nav("/workdays", {
      state: {
        from: "balance-cash",
        workdayId,
        orderId,
      },
    });
  }

  function onMiniItemActivate(event: KeyboardEvent<HTMLElement>, action: () => void) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    action();
  }

  if (auth.user?.role !== "admin") {
    return (
      <div className={styles.page}>
        <div className={styles.content}>
          <header className={styles.header}>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Balance" }]} asTitle />
            <SessionStatusBar />
          </header>
          <p className={styles.empty}>No tienes permisos para ver balance.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Balance" }]} asTitle />
            <p className={styles.subtitle}>Consolidado administrativo de jornadas, ventas, gastos y mercancia.</p>
          </div>
          <SessionStatusBar />
        </header>

        <section className={styles.balanceTabs}>
          <button
            type="button"
            className={`${styles.balanceTabBtn} ${balanceTab === "workdays" ? styles.balanceTabBtnActive : ""}`}
            onClick={() => setBalanceTab("workdays")}
          >
            Jornadas
          </button>
          <button
            type="button"
            className={`${styles.balanceTabBtn} ${balanceTab === "expenses" ? styles.balanceTabBtnActive : ""}`}
            onClick={() => setBalanceTab("expenses")}
          >
            Gastos
          </button>
          <button
            type="button"
            className={`${styles.balanceTabBtn} ${balanceTab === "supplies" ? styles.balanceTabBtnActive : ""}`}
            onClick={() => setBalanceTab("supplies")}
          >
            Mercancia
          </button>
          <button
            type="button"
            className={`${styles.balanceTabBtn} ${balanceTab === "sales" ? styles.balanceTabBtnActive : ""}`}
            onClick={() => setBalanceTab("sales")}
          >
            Ventas
          </button>
          <button
            type="button"
            className={`${styles.balanceTabBtn} ${balanceTab === "cash" ? styles.balanceTabBtnActive : ""}`}
            onClick={() => setBalanceTab("cash")}
          >
            Caja
          </button>
          <button
            type="button"
            className={`${styles.balanceTabBtn} ${balanceTab === "accounts" ? styles.balanceTabBtnActive : ""}`}
            onClick={() => setBalanceTab("accounts")}
          >
            Cuentas
          </button>
        </section>

        <section className={styles.reportPanel}>
          {balanceTab === "workdays" ? (
            <>
              <section className={styles.tabs}>
                <button
                  type="button"
                  className={`${styles.tabBtn} ${workdayTab === "daily" ? styles.tabBtnActive : ""}`}
                  onClick={() => setWorkdayTab("daily")}
                >
                  Diario
                </button>
                <button
                  type="button"
                  className={`${styles.tabBtn} ${workdayTab === "weekly" ? styles.tabBtnActive : ""}`}
                  onClick={() => setWorkdayTab("weekly")}
                >
                  Semanal
                </button>
                <button
                  type="button"
                  className={`${styles.tabBtn} ${workdayTab === "monthly" ? styles.tabBtnActive : ""}`}
                  onClick={() => setWorkdayTab("monthly")}
                >
                  Mensual
                </button>
              </section>

              <section className={styles.workdaySummaryRow}>
                <article className={styles.summaryTile}>
                  <span className={styles.summaryTileLabel}>Jornadas listadas</span>
                  <strong className={styles.summaryTileValue}>{activeWorkdaySummary.workdays}</strong>
                </article>
                <article className={styles.summaryTile}>
                  <span className={styles.summaryTileLabel}>Horas listadas</span>
                  <strong className={styles.summaryTileValue}>{formatMinutes(activeWorkdaySummary.totalMinutes)}</strong>
                </article>
                <article className={styles.summaryTile}>
                  <span className={styles.summaryTileLabel}>Totales listados</span>
                  <strong className={`${styles.summaryTileValue} ${styles.summaryTileValueGreen}`}>
                    {formatMoneyARS(activeWorkdaySummary.totalSales)}
                  </strong>
                </article>
              </section>

              <WorkdayTotalsChart model={activeWorkdayChart} />

              {workdayTab === "daily" ? (
                loading ? (
                  <p className={styles.empty}>Cargando jornadas...</p>
                ) : error ? (
                  <p className={styles.empty}>{error}</p>
                ) : dailyWorkdayRows.length === 0 ? (
                  <p className={styles.empty}>No hay jornadas registradas.</p>
                ) : (
                  dailyWorkdayRows.map(({ workday: wd, dayOrders, dayTotal }, index) => {
                    const expanded = expandedWorkdays.includes(wd.id);

                    return (
                      <article key={wd.id} className={`${styles.workdayCard} ${index % 2 === 0 ? styles.workdayCardEven : ""}`}>
                        <button
                          type="button"
                          className={styles.workdayHeader}
                          onClick={() => toggleWorkday(wd.id)}
                          aria-expanded={expanded}
                        >
                          <div className={styles.workdayHeaderMain}>
                            <span className={styles.toggleIcon}>{expanded ? "^" : "v"}</span>
                            <span className={styles.workdayId}>{wd.id}</span>
                          </div>
                          <div className={styles.workdayHeaderRight}>
                            <div className={styles.headerMetric}>
                              <span className={styles.headerMetricLabel}>Operador</span>
                              <span className={styles.operatorText}>{wd.operator}</span>
                            </div>
                            <div className={styles.headerMetric}>
                              <span className={styles.headerMetricLabel}>Total</span>
                              <span className={dayTotal === 0 ? styles.totalZeroValue : styles.totalHeaderValue}>
                                {formatMoneyARS(dayTotal)}
                              </span>
                            </div>
                            <div className={styles.headerMetric}>
                              <span className={styles.headerMetricLabel}>Fecha</span>
                              <span>{formatDateOnly(wd.startedAt)}</span>
                            </div>
                            <div className={styles.headerMetric}>
                              <span className={styles.headerMetricLabel}>Apertura</span>
                              <span>{formatTimeOnly(wd.startedAt)}</span>
                            </div>
                            <div className={styles.headerMetric}>
                              <span className={styles.headerMetricLabel}>Cierre</span>
                              <span className={isWorkdayOpen(wd) ? styles.greenValue : ""}>
                                {wd.endedAt ? formatTimeOnly(wd.endedAt) : isWorkdayOpen(wd) ? "Caja aun abierta" : "Pendiente admin"}
                              </span>
                            </div>
                            <div className={styles.headerMetric}>
                              <span className={styles.headerMetricLabel}>Horas</span>
                              <span>{formatDuration(wd.startedAt, wd.endedAt)}</span>
                            </div>
                          </div>
                        </button>

                        {expanded ? (
                          <div className={styles.workdayBody}>
                            <div className={styles.ordersList}>
                              {dayOrders.length === 0 ? (
                                <p className={styles.empty}>Sin ventas en esta jornada.</p>
                              ) : (
                                dayOrders.map((order, i) => (
                                  <button
                                    type="button"
                                    key={order.id}
                                    className={`${styles.orderRow} ${i % 2 === 0 ? styles.orderRowEven : ""}`}
                                    onClick={() => switchToCashWorkday(wd.id)}
                                    title="Abrir esta jornada en la pestaï¿½a Caja"
                                  >
                                    <div className={styles.orderIdCell}>{order.id}</div>
                                    <div className={styles.cellCenter}>{formatDateOnly(order.createdAt)}</div>
                                    <div className={styles.cellCenter}>{formatTimeOnly(order.createdAt)}</div>
                                    <div
                                      className={`${styles.cellCenter} ${
                                        order.status === "pagada"
                                          ? styles.statusPaid
                                          : order.status === "cancelada"
                                            ? styles.statusCancelled
                                            : styles.statusPending
                                      }`}
                                    >
                                      {orderStatusLabel(order.status)}
                                    </div>
                                    <div
                                      className={`${styles.cellRight} ${
                                        order.status === "pagada"
                                          ? styles.greenValue
                                          : order.status === "cancelada"
                                            ? styles.redValue
                                            : styles.pendingValue
                                      }`}
                                    >
                                      {formatMoneyARS(order.total)}
                                    </div>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })
                )
              ) : workdayTab === "weekly" ? (
                loading ? (
                  <p className={styles.empty}>Cargando jornadas semanales...</p>
                ) : error ? (
                  <p className={styles.empty}>{error}</p>
                ) : weeklyGroups.length === 0 ? (
                  <p className={styles.empty}>No hay jornadas en la semana actual.</p>
                ) : (
                  weeklyGroups.map((group, index) => {
                    const expanded = expandedWeekly.includes(group.operator);
                    return (
                      <article key={group.operator} className={`${styles.workdayCard} ${index % 2 === 0 ? styles.workdayCardEven : ""}`}>
                        <button
                          type="button"
                          className={styles.workdayHeader}
                          onClick={() => toggleWeeklyOperator(group.operator)}
                          aria-expanded={expanded}
                        >
                          <div className={styles.workdayHeaderMain}>
                            <span className={styles.toggleIcon}>{expanded ? "^" : "v"}</span>
                            <span className={styles.workdayId}>{group.operator}</span>
                          </div>
                          <div className={styles.weeklyHeaderRight}>
                            <div className={styles.headerMetric}>
                              <span className={styles.headerMetricLabel}>Jornadas</span>
                              <span>{group.workdays.length}</span>
                            </div>
                            <div className={styles.headerMetric}>
                              <span className={styles.headerMetricLabel}>Horas</span>
                              <span>{formatMinutes(group.totalMinutes)}</span>
                            </div>
                            <div className={styles.headerMetric}>
                              <span className={styles.headerMetricLabel}>Total</span>
                              <span className={group.totalSales === 0 ? styles.totalZeroValue : styles.totalHeaderValue}>
                                {formatMoneyARS(group.totalSales)}
                              </span>
                            </div>
                          </div>
                        </button>
                        {expanded ? (
                          <div className={styles.workdayBody}>
                            <div className={styles.infoGrid}>
                              <p>
                                <strong>Horas acumuladas:</strong> {formatMinutes(group.totalMinutes)}
                              </p>
                              <p>
                                <strong>Total ventas:</strong> {formatMoneyARS(group.totalSales)}
                              </p>
                              <p>
                                <strong>Caja abierta:</strong> {group.hasOpen ? "Si" : "No"}
                              </p>
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })
                )
              ) : loading ? (
                <p className={styles.empty}>Cargando jornadas mensuales...</p>
              ) : error ? (
                <p className={styles.empty}>{error}</p>
              ) : monthlyGroups.length === 0 ? (
                <p className={styles.empty}>No hay jornadas en el mes actual.</p>
              ) : (
                monthlyGroups.map((group, index) => {
                  const expanded = expandedMonthly.includes(group.operator);
                  return (
                    <article key={group.operator} className={`${styles.workdayCard} ${index % 2 === 0 ? styles.workdayCardEven : ""}`}>
                      <button
                        type="button"
                        className={styles.workdayHeader}
                        onClick={() => toggleMonthlyOperator(group.operator)}
                        aria-expanded={expanded}
                      >
                        <div className={styles.workdayHeaderMain}>
                          <span className={styles.toggleIcon}>{expanded ? "^" : "v"}</span>
                          <span className={styles.workdayId}>{group.operator}</span>
                        </div>
                        <div className={styles.weeklyHeaderRight}>
                          <div className={styles.headerMetric}>
                            <span className={styles.headerMetricLabel}>Jornadas</span>
                            <span>{group.workdays.length}</span>
                          </div>
                          <div className={styles.headerMetric}>
                            <span className={styles.headerMetricLabel}>Horas</span>
                            <span>{formatMinutes(group.totalMinutes)}</span>
                          </div>
                          <div className={styles.headerMetric}>
                            <span className={styles.headerMetricLabel}>Total</span>
                            <span className={group.totalSales === 0 ? styles.totalZeroValue : styles.totalHeaderValue}>
                              {formatMoneyARS(group.totalSales)}
                            </span>
                          </div>
                        </div>
                      </button>
                      {expanded ? (
                        <div className={styles.workdayBody}>
                          <div className={styles.infoGrid}>
                            <p>
                              <strong>Horas acumuladas:</strong> {formatMinutes(group.totalMinutes)}
                            </p>
                            <p>
                              <strong>Total ventas:</strong> {formatMoneyARS(group.totalSales)}
                            </p>
                            <p>
                              <strong>Caja abierta:</strong> {group.hasOpen ? "Si" : "No"}
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })
              )}
            </>
          ) : balanceTab === "expenses" ? (
            <>
              <div className={styles.summaryGrid}>
                <article className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Total gastos</span>
                  <strong className={`${styles.summaryValue} ${styles.summaryValueRed}`}>{formatMoneyARS(expensesTotal)}</strong>
                </article>
                <article className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Recurrentes</span>
                  <strong className={styles.summaryValue}>{formatMoneyARS(recurrentExpensesTotal)}</strong>
                </article>
                <article className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Imprevistos</span>
                  <strong className={styles.summaryValue}>{formatMoneyARS(unexpectedExpensesTotal)}</strong>
                </article>
              </div>

              <div className={styles.compactList}>
                {sortedExpenses.map((item) => (
                  <article key={item.id} className={styles.compactItem}>
                    <div className={styles.compactTop}>
                      <strong className={`${styles.compactMoney} ${styles.compactMoneyRed}`}>{formatMoneyARS(item.amount)}</strong>
                      <span className={`${styles.tag} ${item.expenseType === "recurrent" ? styles.tagBlue : styles.tagOrange}`}>
                        {item.expenseType === "recurrent" ? "Recurrente" : "Imprevisto"}
                      </span>
                    </div>
                    <p className={styles.compactMain}>{item.description}</p>
                    <p className={styles.compactMeta}>
                      {formatDateTime(item.createdAt)} - {item.createdBy}
                    </p>
                  </article>
                ))}
              </div>
            </>
          ) : balanceTab === "supplies" ? (
            <>
              <div className={styles.summaryGrid}>
                <article className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Esperado</span>
                  <strong className={styles.summaryValue}>{formatMoneyARS(supplyExpectedTotal)}</strong>
                </article>
                <article className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Recibido</span>
                  <strong className={`${styles.summaryValue} ${styles.summaryValueRed}`}>{formatMoneyARS(supplyActualTotal)}</strong>
                </article>
                <article className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Vuelto</span>
                  <strong className={`${styles.summaryValue} ${styles.summaryValueGreen}`}>{formatMoneyARS(supplyRemainingTotal)}</strong>
                </article>
                <article className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Pendientes</span>
                  <strong className={`${styles.summaryValue} ${styles.summaryValueRed}`}>{pendingSupplyOrders.length}</strong>
                </article>
              </div>

              <div className={styles.compactList}>
                {sortedSupplyOrders.map((item) => (
                  <article key={item.id} className={styles.compactItem}>
                    <div className={styles.compactTop}>
                      <strong className={styles.compactMainId}>{item.id}</strong>
                      <span className={`${styles.tag} ${item.status === "received" ? styles.tagGreen : styles.tagSlate}`}>
                        {item.status === "received" ? "Recibido" : "Pendiente"}
                      </span>
                    </div>
                    <p className={styles.compactMain}>{item.description}</p>
                    <p className={styles.amountLine}>
                      <span>Esperado: {formatMoneyARS(safeMoney(item.expectedTotal))}</span>
                      {item.status === "received" ? (
                        <span className={styles.moneyRedInline}>Recibido: {formatMoneyARS(safeMoney(item.actualTotal))}</span>
                      ) : (
                        <span className={styles.moneyRedInline}>Recibido: Pendiente</span>
                      )}
                      {item.status === "received" && safeMoney(item.remainingAmount) > 0 ? (
                        <span className={styles.moneyGreenInline}>Vuelto: {formatMoneyARS(safeMoney(item.remainingAmount))}</span>
                      ) : null}
                    </p>
                    <p className={styles.compactMeta}>
                      Proveedor: {item.supplierName} | {formatDateTime(item.receivedAt || item.createdAt)}
                    </p>
                  </article>
                ))}
              </div>
            </>
          ) : balanceTab === "sales" ? (
            <>
              <div className={styles.summaryGrid}>
                <article className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Ventas totales</span>
                  <strong className={`${styles.summaryValue} ${styles.summaryValueGreen}`}>{formatMoneyARS(salesTotal)}</strong>
                </article>
                <article className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Por pagar</span>
                  <strong className={`${styles.summaryValue} ${styles.summaryValueRed}`}>
                    {pendingSales.length} ({formatMoneyARS(pendingSalesTotal)})
                  </strong>
                </article>
              </div>

              <p className={styles.noteText}>Ventas totales solo considera ordenes pagadas.</p>

              <div className={styles.compactList}>
                {sortedOrders.map((item) => (
                  <article key={item.id} className={styles.compactItem}>
                    <div className={styles.compactTop}>
                      <strong className={styles.compactMainId}>{item.id}</strong>
                      <span
                        className={`${styles.tag} ${
                          item.status === "pagada" ? styles.tagGreen : item.status === "cancelada" ? styles.tagSlate : styles.tagRed
                        }`}
                      >
                        {orderStatusLabel(item.status)}
                      </span>
                    </div>
                    <p className={styles.compactMeta}>
                      {formatDateTime(item.createdAt)} - {item.operator}
                    </p>
                    <p
                      className={`${styles.compactMoney} ${
                        item.status === "pagada" ? styles.compactMoneyGreen : styles.compactMoneyRed
                      }`}
                    >
                      {formatMoneyARS(item.total)}
                    </p>
                  </article>
                ))}
              </div>
            </>
          ) : balanceTab === "accounts" ? (
            <>
              <div className={styles.summaryGrid}>
                <article className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Cuentas</span>
                  <strong className={styles.summaryValue}>{sortedFinancialAccounts.length}</strong>
                </article>
                <article className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Saldo positivo</span>
                  <strong className={`${styles.summaryValue} ${styles.summaryValueGreen}`}>
                    {formatMoneyARS(
                      sortedFinancialAccounts
                        .filter((item) => item.currentBalance > 0)
                        .reduce((acc, item) => acc + safeMoney(item.currentBalance), 0),
                    )}
                  </strong>
                </article>
                <article className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Saldo negativo</span>
                  <strong className={`${styles.summaryValue} ${styles.summaryValueRed}`}>
                    {formatMoneyARS(
                      sortedFinancialAccounts
                        .filter((item) => item.currentBalance < 0)
                        .reduce((acc, item) => acc + Math.abs(item.currentBalance), 0),
                    )}
                  </strong>
                </article>
              </div>

              <div className={styles.compactList}>
                {sortedFinancialAccounts.map((item) => (
                  <article key={item.id} className={styles.compactItem}>
                    <div className={styles.compactTop}>
                      <strong className={styles.compactMainId}>{item.name}</strong>
                      <span className={`${styles.tag} ${item.currentBalance >= 0 ? styles.tagGreen : styles.tagRed}`}>
                        {item.kind}
                      </span>
                    </div>
                    <p className={styles.compactMain}>{item.description}</p>
                    <p className={`${styles.compactMoney} ${item.currentBalance >= 0 ? styles.compactMoneyGreen : styles.compactMoneyRed}`}>
                      {formatMoneyARS(Math.abs(item.currentBalance))}
                      {item.currentBalance < 0 ? " (negativo)" : ""}
                    </p>
                    <p className={styles.compactMeta}>
                      {item.code} | actualizada {formatDateTime(item.updatedAt)}
                    </p>
                  </article>
                ))}
              </div>
            </>
          ) : !selectedCashWorkday ? (
            <p className={styles.empty}>No hay cajas/jornadas para mostrar.</p>
          ) : (
            <>
              <div className={styles.cashSelectorRow}>
                <label className={styles.cashSelectorField}>
                  <span>Caja seleccionada</span>
                  <input
                    className={styles.cashSearchInput}
                    type="text"
                    value={cashSearch}
                    onChange={(event) => setCashSearch(event.target.value)}
                    placeholder="Filtrar por usuario, fecha o codigo de orden"
                  />
                  <select
                    className={styles.cashSelect}
                    value={selectedCashWorkdayId}
                    onChange={(event) => setSelectedCashWorkdayId(event.target.value)}
                  >
                    {cashSelectOptions.length === 0 ? (
                      <option value="">Sin resultados</option>
                    ) : (
                      cashSelectOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.id} | {item.operator} | {formatDateOnly(item.startedAt)} {item.endedAt ? "(cerrada)" : "(abierta)"}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              </div>

              <div className={styles.summaryGrid}>
                <article className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Ventas jornada</span>
                  <strong className={`${styles.summaryValue} ${styles.summaryValueGreen}`}>{formatMoneyARS(selectedCashSalesTotal)}</strong>
                </article>
                <article className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Gastos jornada</span>
                  <strong className={`${styles.summaryValue} ${styles.summaryValueRed}`}>{formatMoneyARS(selectedCashExpenseTotal)}</strong>
                </article>
                <article className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Mercancia recibida</span>
                  <strong className={`${styles.summaryValue} ${styles.summaryValueRed}`}>{formatMoneyARS(selectedCashSupplySpent)}</strong>
                </article>
                <article className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Vuelto mercancia</span>
                  <strong className={`${styles.summaryValue} ${styles.summaryValueGreen}`}>{formatMoneyARS(selectedCashSupplyRemaining)}</strong>
                </article>
                <article className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Balance caja</span>
                  <strong className={`${styles.summaryValue} ${selectedCashBalance >= 0 ? styles.summaryValueGreen : styles.summaryValueRed}`}>
                    {formatMoneyARS(Math.abs(selectedCashBalance))}
                    {selectedCashBalance < 0 ? " (negativo)" : ""}
                  </strong>
                </article>
              </div>

              <div className={styles.splitPanels}>
                <section className={styles.miniPanel}>
                  <h3 className={styles.blockTitle}>Ventas</h3>
                  <div className={styles.miniList}>
                    {selectedCashPaidOrders.length === 0 ? (
                      <p className={styles.empty}>Sin ventas pagadas para esta caja.</p>
                    ) : (
                      selectedCashPaidOrders.map((item) => (
                        <article
                          key={item.id}
                          className={`${styles.miniItem} ${styles.miniItemInteractive}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => openWorkdaySale(selectedCashWorkday.id, item.id)}
                          onKeyDown={(event) => onMiniItemActivate(event, () => openWorkdaySale(selectedCashWorkday.id, item.id))}
                        >
                          <p className={styles.compactMeta}>{item.id}</p>
                          <p className={styles.compactMeta}>{formatDateTime(item.createdAt)}</p>
                          <p className={`${styles.compactMoney} ${styles.compactMoneyGreen}`}>{formatMoneyARS(item.total)}</p>
                        </article>
                      ))
                    )}
                  </div>
                </section>

                <section className={styles.miniPanel}>
                  <h3 className={styles.blockTitle}>Gastos</h3>
                  <div className={styles.miniList}>
                    {selectedCashExpenses.length === 0 ? (
                      <p className={styles.empty}>Sin gastos en esta caja.</p>
                    ) : (
                      selectedCashExpenses.map((item) => (
                        <article
                          key={item.id}
                          className={`${styles.miniItem} ${styles.miniItemInteractive}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => setBalanceTab("expenses")}
                          onKeyDown={(event) => onMiniItemActivate(event, () => setBalanceTab("expenses"))}
                        >
                          <p className={styles.compactMeta}>{formatDateTime(item.createdAt)}</p>
                          <p className={styles.compactMain}>{item.description}</p>
                          <p className={`${styles.compactMoney} ${styles.compactMoneyRed}`}>{formatMoneyARS(item.amount)}</p>
                        </article>
                      ))
                    )}
                  </div>
                </section>

                <section className={styles.miniPanel}>
                  <h3 className={styles.blockTitle}>Mercancia y vuelto</h3>
                  <div className={styles.miniList}>
                    {selectedCashSupplyOrders.length === 0 ? (
                      <p className={styles.empty}>Sin mercancia recibida para esta caja.</p>
                    ) : (
                      selectedCashSupplyOrders.map((item) => (
                        <article
                          key={item.id}
                          className={`${styles.miniItem} ${styles.miniItemInteractive}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => setBalanceTab("supplies")}
                          onKeyDown={(event) => onMiniItemActivate(event, () => setBalanceTab("supplies"))}
                        >
                          <p className={styles.compactMeta}>{item.id}</p>
                          <p className={styles.compactMeta}>{formatDateTime(item.receivedAt || item.createdAt)}</p>
                          <p className={styles.compactMain}>{item.description}</p>
                          <p className={styles.amountLine}>
                            <span>Esperado: {formatMoneyARS(safeMoney(item.expectedTotal))}</span>
                            <span className={styles.moneyRedInline}>Recibido: {formatMoneyARS(safeMoney(item.actualTotal))}</span>
                            {safeMoney(item.remainingAmount) > 0 ? (
                              <span className={styles.moneyGreenInline}>Vuelto: {formatMoneyARS(safeMoney(item.remainingAmount))}</span>
                            ) : null}
                          </p>
                        </article>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

