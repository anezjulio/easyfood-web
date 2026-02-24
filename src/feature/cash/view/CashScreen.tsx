import { useEffect, useMemo, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import HeaderOperationNotice from "../../../app/component/HeaderOperationNotice";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import { formatDateTimeAR as formatDateTime, formatMoneyARS } from "../../../shared/format/locale";
import { normalizeForSearch } from "../../../shared/search/search";
import type { Expense } from "../../expense/model/expense.types";
import { fetchExpensesApi } from "../../expense/service/expense.api";
import { PAYMENT_METHODS, formatPaymentMethodLabel, type Order, type PaymentMethod } from "../../sale/model/sale.types";
import { fetchOrdersApi } from "../../sale/service/sale.api";
import type { SupplyOrder } from "../../supply/model/supply.types";
import { fetchSupplyOrdersApi } from "../../supply/service/supply.api";
import type { AppUserRecord } from "../../user/model/user.types";
import { fetchUsersApi } from "../../user/service/user.api";
import type { CashOpeningAssignment, CashShift, Workday, WorkdayAuditChecks, WorkdayCloseSummary } from "../model/cash.types";
import {
  fetchCashOpeningAssignmentsApi,
  fetchCurrentWorkdayApi,
  fetchWorkdaysApi,
  reviewWorkdayCloseApi,
  upsertCashOpeningAssignmentApi,
} from "../service/cash.api";
import { openCashWithAmount, requestCashCloseWithAmount } from "../service/cash.operation";
import { markCashSessionClosed, markCashSessionOpen } from "../service/cash.session";
import styles from "./CashScreen.module.css";

type CashTab = "cash" | "close-review";
type CashSortKey = "id" | "operator" | "paymentMethod" | "total" | "createdAt";
type WorkdayStatus = "open" | "pending-close" | "closed";
type AssignmentDraft = { amount: string; shift: CashShift };

const CASH_SHIFT_WINDOWS: Record<CashShift, { startHour: string; endHour: string; label: string }> = {
  diurno: { startHour: "08:00", endHour: "19:59", label: "Diurno" },
  nocturno: { startHour: "20:00", endHour: "07:59", label: "Nocturno" },
};

function resolveWorkdayStatus(workday: Workday | null | undefined): WorkdayStatus {
  if (!workday) return "closed";
  if (workday.status === "open" || workday.status === "pending-close" || workday.status === "closed") return workday.status;
  return workday.endedAt ? "closed" : "open";
}

function parseMoneyInput(value: string): number | null {
  const normalized = String(value || "").trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.trunc(parsed);
}

function parseHourToMinutes(value: string): number | null {
  const [hh, mm] = String(value || "").trim().split(":");
  const hours = Number(hh);
  const minutes = Number(mm);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function inferShiftFromHours(startHour: string, endHour: string): CashShift {
  const start = parseHourToMinutes(startHour);
  const end = parseHourToMinutes(endHour);
  if (start === null || end === null) return "diurno";
  if (start > end) return "nocturno";
  if (start >= 18 * 60 || start < 6 * 60) return "nocturno";
  return "diurno";
}

function buildPaymentTotals(): Record<PaymentMethod, number> {
  return {
    efectivo: 0,
    "tarjeta debito": 0,
    "tarjeta credito": 0,
    mercadopago: 0,
  };
}

function isWithinRange(iso: string | undefined, fromMs: number, toMs: number): boolean {
  const valueMs = new Date(String(iso || "")).getTime();
  if (!Number.isFinite(valueMs)) return false;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return true;
  return valueMs >= fromMs && valueMs <= toMs;
}

function computeWorkdayCloseSummaryFromData(
  workday: Workday,
  allOrders: Order[],
  expenses: Expense[],
  supplyOrders: SupplyOrder[],
  declaredClosingCash: number,
): WorkdayCloseSummary {
  const fromMs = new Date(workday.startedAt).getTime();
  const untilIso = workday.closeRequestedAt || workday.endedAt || new Date().toISOString();
  const toMs = new Date(untilIso).getTime();
  const orderIds = new Set(workday.orderIds);

  const paidOrders = allOrders.filter((item) => orderIds.has(item.id) && item.status === "pagada");
  const totalByPaymentMethod = buildPaymentTotals();
  for (const order of paidOrders) {
    const method = order.paymentMethod;
    if (!method) continue;
    if (!(method in totalByPaymentMethod)) continue;
    totalByPaymentMethod[method] += Math.trunc(Number(order.total || 0));
  }

  const totalSales = PAYMENT_METHODS.reduce((acc, method) => acc + totalByPaymentMethod[method], 0);
  const cashSales = totalByPaymentMethod.efectivo;
  const totalExpenses = expenses
    .filter((item) => normalizeForSearch(item.createdBy) === normalizeForSearch(workday.operator) && isWithinRange(item.createdAt, fromMs, toMs))
    .reduce((acc, item) => acc + Math.trunc(Number(item.amount || 0)), 0);
  const totalSupplyReturns = supplyOrders
    .filter((item) => {
      if (item.status !== "received") return false;
      if (normalizeForSearch(item.receivedBy || "") !== normalizeForSearch(workday.operator)) return false;
      return isWithinRange(item.receivedAt, fromMs, toMs);
    })
    .reduce((acc, item) => {
      const remaining = Math.trunc(Number(item.remainingAmount || 0));
      return acc + (remaining > 0 ? remaining : 0);
    }, 0);

  const openingDeclaredAmount = Math.trunc(Number(workday.openingDeclaredAmount || 0));
  const normalizedDeclared = Math.max(0, Math.trunc(Number(declaredClosingCash || 0)));
  const expectedClosingCash = openingDeclaredAmount + cashSales + totalSupplyReturns - totalExpenses;
  const balanceTotal = openingDeclaredAmount + totalSales + totalSupplyReturns - totalExpenses;

  return {
    totalSales,
    totalByPaymentMethod,
    cashSales,
    totalExpenses,
    totalSupplyReturns,
    expectedClosingCash,
    declaredClosingCash: normalizedDeclared,
    closingDifference: normalizedDeclared - expectedClosingCash,
    balanceTotal,
  };
}

function buildDefaultAuditChecks(): WorkdayAuditChecks {
  return {
    openingAmount: true,
    cashSales: true,
    expenses: true,
    supplyReturns: true,
    balance: true,
  };
}

function buildWorkdayMismatchLines(workday: Workday, summary: WorkdayCloseSummary, checks: WorkdayAuditChecks): string[] {
  const lines: string[] = [];
  const openingAssignedAmount = Math.trunc(Number(workday.openingAssignedAmount || 0));
  const openingDeclaredAmount = Math.trunc(Number(workday.openingDeclaredAmount || 0));
  const openingDifference = openingDeclaredAmount - openingAssignedAmount;

  if (!checks.openingAmount) {
    if (openingDifference !== 0) {
      lines.push(
        `Apertura: asignado ${formatMoneyARS(openingAssignedAmount)}, declarado ${formatMoneyARS(openingDeclaredAmount)} (${openingDifference > 0 ? "sobra" : "falta"} ${formatMoneyARS(Math.abs(openingDifference))}).`,
      );
    } else {
      lines.push("Apertura marcada con diferencia manual.");
    }
  }
  if (!checks.cashSales) lines.push(`Ventas en efectivo con diferencia por ${formatMoneyARS(summary.cashSales)}.`);
  if (!checks.expenses) lines.push(`Gastos con diferencia por ${formatMoneyARS(summary.totalExpenses)}.`);
  if (!checks.supplyReturns) lines.push(`Vuelto de mercaderia con diferencia por ${formatMoneyARS(summary.totalSupplyReturns)}.`);
  if (!checks.balance || summary.closingDifference !== 0) {
    if (summary.closingDifference !== 0) {
      lines.push(
        `Cierre en efectivo: esperado ${formatMoneyARS(summary.expectedClosingCash)}, declarado ${formatMoneyARS(summary.declaredClosingCash)} (${summary.closingDifference > 0 ? "sobra" : "falta"} ${formatMoneyARS(Math.abs(summary.closingDifference))}).`,
      );
    } else if (!checks.balance) {
      lines.push("Balance marcado con diferencia manual.");
    }
  }
  return lines;
}

function buildWorkdayMismatchReport(workday: Workday, summary: WorkdayCloseSummary, checks: WorkdayAuditChecks): string {
  const lines = buildWorkdayMismatchLines(workday, summary, checks);
  if (!lines.length) return "";
  return `El operador ${workday.operator}, en la jornada ${workday.id}, presenta diferencias. ${lines.join(" ")}`;
}

export default function CashScreen() {
  const auth = useAuth();
  const isAdmin = auth.user?.role === "admin";
  const [activeTab, setActiveTab] = useState<CashTab>("cash");
  const [workday, setWorkday] = useState<Workday | null>(null);
  const [workdays, setWorkdays] = useState<Workday[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [supplyOrders, setSupplyOrders] = useState<SupplyOrder[]>([]);
  const [assignments, setAssignments] = useState<CashOpeningAssignment[]>([]);
  const [users, setUsers] = useState<AppUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderIdFilter, setOrderIdFilter] = useState("");
  const [operatorFilter, setOperatorFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [totalFilter, setTotalFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [sortKey, setSortKey] = useState<CashSortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [hasUserSorted, setHasUserSorted] = useState(false);
  const [openingAmountInput, setOpeningAmountInput] = useState("");
  const [declaredClosingCashInput, setDeclaredClosingCashInput] = useState("");
  const [isOpening, setIsOpening] = useState(false);
  const [isRequestingClose, setIsRequestingClose] = useState(false);
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, AssignmentDraft>>({});
  const [savingAssignmentFor, setSavingAssignmentFor] = useState("");
  const [selectedReviewWorkdayId, setSelectedReviewWorkdayId] = useState("");
  const [auditChecks, setAuditChecks] = useState<WorkdayAuditChecks>(buildDefaultAuditChecks());
  const [auditNotes, setAuditNotes] = useState("");
  const [auditMismatchReport, setAuditMismatchReport] = useState("");
  const [isReviewingClose, setIsReviewingClose] = useState(false);
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");

  async function reload() {
    const username = auth.user?.username;
    if (!username) return;
    setLoading(true);
    setError("");
    try {
      const [currentWorkday, allWorkdays, allOrders, allExpenses, allSupplyOrders, allAssignments, allUsers] = await Promise.all([
        fetchCurrentWorkdayApi(username),
        fetchWorkdaysApi(),
        fetchOrdersApi(),
        fetchExpensesApi(),
        fetchSupplyOrdersApi(),
        fetchCashOpeningAssignmentsApi(),
        isAdmin ? fetchUsersApi() : Promise.resolve([]),
      ]);
      if (currentWorkday && resolveWorkdayStatus(currentWorkday) === "open") {
        markCashSessionOpen(username);
      } else {
        markCashSessionClosed(username);
      }
      setWorkday(currentWorkday);
      setWorkdays(allWorkdays);
      setOrders(allOrders);
      setExpenses(allExpenses);
      setSupplyOrders(allSupplyOrders);
      setAssignments(allAssignments);
      setUsers(allUsers);
      const ownAssignment = allAssignments.find((item) => normalizeForSearch(item.operator) === normalizeForSearch(username));
      if (!currentWorkday) {
        setOpeningAmountInput(ownAssignment ? String(ownAssignment.amount) : "");
        setDeclaredClosingCashInput("");
        setSelectedOrderId(null);
      } else if (currentWorkday.closeSummary) {
        setDeclaredClosingCashInput(String(currentWorkday.closeSummary.declaredClosingCash));
      } else if (resolveWorkdayStatus(currentWorkday) === "open") {
        setDeclaredClosingCashInput(String(Math.max(0, Math.trunc(Number(currentWorkday.openingDeclaredAmount || 0)))));
      } else {
        setDeclaredClosingCashInput("");
      }
      const nextDrafts: Record<string, AssignmentDraft> = {};
      for (const user of allUsers) {
        if (!user.username) continue;
        if (normalizeForSearch(user.username) === "admin") continue;
        nextDrafts[user.username] = {
          amount: "",
          shift: inferShiftFromHours(user.startHour, user.endHour),
        };
      }
      for (const assignment of allAssignments) {
        nextDrafts[assignment.operator] = {
          amount: String(assignment.amount),
          shift: assignment.shift || nextDrafts[assignment.operator]?.shift || "diurno",
        };
      }
      setAssignmentDrafts(nextDrafts);
    } catch {
      setError("No se pudo cargar la informacion de caja.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.username, auth.user?.role]);

  const status = resolveWorkdayStatus(workday);
  const dayOrders = useMemo(() => {
    if (!workday) return [];
    const ids = new Set(workday.orderIds);
    return orders.filter((item) => ids.has(item.id));
  }, [orders, workday]);

  const filteredOrders = useMemo(() => {
    const idQuery = normalizeForSearch(orderIdFilter);
    const operatorQuery = normalizeForSearch(operatorFilter);
    const paymentQuery = normalizeForSearch(paymentFilter);
    const totalDigits = totalFilter.replace(/\D/g, "");
    let list = dayOrders;
    if (idQuery) list = list.filter((item) => normalizeForSearch(item.id).includes(idQuery));
    if (operatorQuery) list = list.filter((item) => normalizeForSearch(item.operator).includes(operatorQuery));
    if (paymentQuery) {
      list = list.filter((item) => {
        const raw = String(item.paymentMethod || "");
        return normalizeForSearch(`${raw} ${formatPaymentMethodLabel(item.paymentMethod)}`).includes(paymentQuery);
      });
    }
    if (totalDigits) list = list.filter((item) => String(Math.trunc(item.total)).includes(totalDigits));
    if (dateFilter) list = list.filter((item) => item.createdAt.slice(0, 10) === dateFilter);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "id") return a.id.localeCompare(b.id) * dir;
      if (sortKey === "operator") return a.operator.localeCompare(b.operator) * dir;
      if (sortKey === "paymentMethod") {
        return formatPaymentMethodLabel(a.paymentMethod).localeCompare(formatPaymentMethodLabel(b.paymentMethod)) * dir;
      }
      if (sortKey === "total") return (a.total - b.total) * dir;
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
    });
  }, [dayOrders, orderIdFilter, operatorFilter, paymentFilter, totalFilter, dateFilter, sortKey, sortDir]);

  const selectedOrder = useMemo(
    () => dayOrders.find((item) => item.id === selectedOrderId) || null,
    [dayOrders, selectedOrderId],
  );
  const dayTotal = useMemo(() => dayOrders.reduce((acc, item) => acc + item.total, 0), [dayOrders]);

  const closeSummary = useMemo(() => {
    if (!workday) return null;
    if (workday.closeSummary) return workday.closeSummary;
    const declared = parseMoneyInput(declaredClosingCashInput);
    const fallbackDeclared =
      declared ?? Math.max(0, Math.trunc(Number(workday.openingDeclaredAmount || workday.openingAssignedAmount || 0)));
    return computeWorkdayCloseSummaryFromData(workday, orders, expenses, supplyOrders, fallbackDeclared);
  }, [declaredClosingCashInput, expenses, orders, supplyOrders, workday]);

  const ownAssignment = useMemo(() => {
    if (!auth.user?.username) return null;
    return assignments.find((item) => normalizeForSearch(item.operator) === normalizeForSearch(auth.user?.username || "")) || null;
  }, [assignments, auth.user?.username]);

  const assignmentRows = useMemo(() => {
    const byUsername = new Map<string, AppUserRecord>();
    for (const user of users) {
      const key = String(user.username || "").trim();
      if (!key || normalizeForSearch(key) === "admin") continue;
      byUsername.set(key, user);
    }
    for (const assignment of assignments) {
      const key = String(assignment.operator || "").trim();
      if (!key || normalizeForSearch(key) === "admin") continue;
      if (byUsername.has(key)) continue;
      byUsername.set(key, {
        id: key,
        name: key,
        email: "",
        username: key,
        password: "",
        createdAt: "",
        updatedAt: "",
        startHour: "",
        endHour: "",
      });
    }
    return [...byUsername.values()].sort((a, b) => a.username.localeCompare(b.username));
  }, [assignments, users]);

  const pendingCloseWorkdays = useMemo(
    () => workdays.filter((item) => resolveWorkdayStatus(item) === "pending-close" && !item.endedAt),
    [workdays],
  );

  useEffect(() => {
    if (!pendingCloseWorkdays.length) {
      setSelectedReviewWorkdayId("");
      return;
    }
    setSelectedReviewWorkdayId((current) =>
      pendingCloseWorkdays.some((item) => item.id === current) ? current : pendingCloseWorkdays[0].id,
    );
  }, [pendingCloseWorkdays]);

  const selectedReviewWorkday = useMemo(
    () => pendingCloseWorkdays.find((item) => item.id === selectedReviewWorkdayId) || null,
    [pendingCloseWorkdays, selectedReviewWorkdayId],
  );

  const selectedReviewSummary = useMemo(() => {
    if (!selectedReviewWorkday) return null;
    if (selectedReviewWorkday.closeSummary) return selectedReviewWorkday.closeSummary;
    const fallbackDeclared = Math.max(
      0,
      Math.trunc(Number(selectedReviewWorkday.openingDeclaredAmount || selectedReviewWorkday.openingAssignedAmount || 0)),
    );
    return computeWorkdayCloseSummaryFromData(selectedReviewWorkday, orders, expenses, supplyOrders, fallbackDeclared);
  }, [expenses, orders, selectedReviewWorkday, supplyOrders]);

  useEffect(() => {
    if (!selectedReviewWorkday) {
      setAuditChecks(buildDefaultAuditChecks());
      setAuditNotes("");
      setAuditMismatchReport("");
      return;
    }
    setAuditChecks(selectedReviewWorkday.adminReview?.checks || buildDefaultAuditChecks());
    setAuditNotes(selectedReviewWorkday.adminReview?.notes || "");
    setAuditMismatchReport(selectedReviewWorkday.adminReview?.mismatchReport || "");
  }, [selectedReviewWorkday]);

  const auditMismatchLines = useMemo(() => {
    if (!selectedReviewWorkday || !selectedReviewSummary) return [];
    return buildWorkdayMismatchLines(selectedReviewWorkday, selectedReviewSummary, auditChecks);
  }, [auditChecks, selectedReviewSummary, selectedReviewWorkday]);

  function handleSortChange(nextKey: CashSortKey) {
    setHasUserSorted(true);
    if (sortKey === nextKey) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir("asc");
  }

  function handleClearSort() {
    setSortKey("createdAt");
    setSortDir("desc");
    setHasUserSorted(false);
  }

  function sortIndicator(key: CashSortKey) {
    if (!hasUserSorted || sortKey !== key) return "";
    return sortDir === "asc" ? " \u2191" : " \u2193";
  }

  async function handleOpenCash() {
    if (!auth.user?.username) return;
    const openingAmount = parseMoneyInput(openingAmountInput);
    if (openingAmount === null) {
      setError("Ingresa un monto de apertura valido.");
      return;
    }
    setIsOpening(true);
    setError("");
    setWarning("");
    setMessage("");
    try {
      const opened = await openCashWithAmount(auth.user.username, openingAmount);
      const difference = Math.trunc(Number(opened.openingDifferenceAmount || 0));
      if (difference !== 0) {
        setWarning(
          `Caja abierta. Diferencia detectada: ${difference > 0 ? "sobra" : "falta"} ${formatMoneyARS(Math.abs(difference))}.`,
        );
        setMessage("");
      } else {
        setWarning("");
        setMessage("Caja abierta.");
      }
      await reload();
    } catch (error) {
      setWarning("");
      setError(error instanceof Error && error.message ? error.message : "No se pudo abrir caja.");
    } finally {
      setIsOpening(false);
    }
  }

  async function handleRequestClose() {
    if (!auth.user?.username || !workday) return;
    const declaredClosingCash = parseMoneyInput(declaredClosingCashInput);
    if (declaredClosingCash === null) {
      setError("Ingresa un monto de cierre valido.");
      return;
    }
    setIsRequestingClose(true);
    setError("");
    setWarning("");
    setMessage("");
    try {
      await requestCashCloseWithAmount(
        workday.id,
        auth.user.username,
        declaredClosingCash,
        dayOrders.map((item) => item.id),
      );
      setWarning("");
      setMessage("Cierre efectuado.");
      await reload();
    } catch (error) {
      setWarning("");
      setError(error instanceof Error && error.message ? error.message : "No se pudo solicitar el cierre de caja.");
    } finally {
      setIsRequestingClose(false);
    }
  }

  async function handleSaveAssignment(operator: string) {
    if (!auth.user?.username) return;
    const draft = assignmentDrafts[operator];
    const amount = parseMoneyInput(draft?.amount || "");
    const shift = draft?.shift || "diurno";
    if (amount === null) {
      setError(`Ingresa un monto valido para ${operator}.`);
      return;
    }
    setSavingAssignmentFor(operator);
    setError("");
    setWarning("");
    setMessage("");
    try {
      const updated = await upsertCashOpeningAssignmentApi(operator, { amount, shift, updatedBy: auth.user.username });
      setAssignmentDrafts((current) => ({
        ...current,
        [operator]: {
          amount: String(updated.amount),
          shift: updated.shift,
        },
      }));
      const shiftLabel = CASH_SHIFT_WINDOWS[updated.shift]?.label || updated.shift;
      const shiftHours = `${updated.startHour} a ${updated.endHour}`;
      setWarning("");
      setMessage(`Apertura actualizada para ${operator}: ${shiftLabel} (${shiftHours}).`);
      await reload();
    } catch (error) {
      setWarning("");
      setError(error instanceof Error && error.message ? error.message : "No se pudo actualizar el monto de apertura.");
    } finally {
      setSavingAssignmentFor("");
    }
  }

  async function handleReviewClose() {
    if (!auth.user?.username || !selectedReviewWorkday || !selectedReviewSummary) return;
    setIsReviewingClose(true);
    setError("");
    setWarning("");
    setMessage("");
    try {
      const generatedReport = buildWorkdayMismatchReport(selectedReviewWorkday, selectedReviewSummary, auditChecks);
      await reviewWorkdayCloseApi(selectedReviewWorkday.id, {
        reviewedBy: auth.user.username,
        checks: auditChecks,
        notes: auditNotes.trim() || undefined,
        mismatchReport: auditMismatchReport.trim() || generatedReport || undefined,
      });
      if (normalizeForSearch(selectedReviewWorkday.operator) === normalizeForSearch(auth.user.username)) {
        markCashSessionClosed(auth.user.username);
      }
      setWarning("");
      setMessage("Cierre efectuado.");
      await reload();
    } catch {
      setWarning("");
      setError("No se pudo confirmar el cierre de caja.");
    } finally {
      setIsReviewingClose(false);
    }
  }

  const openingAssigned = ownAssignment ? ownAssignment.amount : workday?.openingAssignedAmount;
  const openingDeclared = workday?.openingDeclaredAmount;
  const openingDifference = Math.trunc(Number(workday?.openingDifferenceAmount || 0));
  const clearHeaderNotice = () => {
    setError("");
    setWarning("");
    setMessage("");
  };

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div className={styles.headerLead}>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Caja" }]} asTitle />
            <p className={styles.subtitle}>Apertura, cierre y auditoria de caja por jornada.</p>
          </div>
          <HeaderOperationNotice
            className={styles.headerNotice}
            message={message}
            warning={warning}
            error={error}
            onClose={clearHeaderNotice}
          />
          <SessionStatusBar />
        </header>

        {isAdmin ? (
          <section className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "cash" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("cash")}
            >
              Caja
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === "close-review" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("close-review")}
            >
              Cierre de caja
            </button>
          </section>
        ) : null}

        {activeTab === "cash" ? (
          <>
            <section className={styles.operationCard}>
              {!workday ? (
                <>
                  <h2 className={styles.sectionTitle}>Apertura de caja</h2>
                  {ownAssignment && ownAssignment.amount > 0 ? (
                    <p className={styles.helpText}>
                      Monto asignado por administracion:{" "}
                      <span className={styles.assignedAmount}>{formatMoneyARS(ownAssignment.amount)}</span>.
                    </p>
                  ) : null}
                  <div className={styles.inlineForm}>
                    <label className={styles.field}>
                      <span>Efectivo recibido para abrir caja</span>
                      <input
                        className={styles.input}
                        type="number"
                        min={0}
                        step={1}
                        value={openingAmountInput}
                        onChange={(event) => setOpeningAmountInput(event.target.value)}
                        placeholder="0"
                      />
                    </label>
                    <button type="button" className={styles.primaryBtn} onClick={handleOpenCash} disabled={isOpening || loading}>
                      {isOpening ? "Abriendo..." : "Abrir caja"}
                    </button>
                  </div>
                </>
              ) : status === "open" ? (
                <>
                  <h2 className={styles.sectionTitle}>Solicitud de cierre</h2>
                  <div className={styles.inlineForm}>
                    <label className={styles.field}>
                      <span>Efectivo contado al cierre</span>
                      <input
                        className={styles.input}
                        type="number"
                        min={0}
                        step={1}
                        value={declaredClosingCashInput}
                        onChange={(event) => setDeclaredClosingCashInput(event.target.value)}
                        placeholder="0"
                      />
                    </label>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={handleRequestClose}
                      disabled={isRequestingClose || loading}
                    >
                      {isRequestingClose ? "Enviando..." : "Solicitar cierre"}
                    </button>
                  </div>
                  {closeSummary ? <CloseSummaryPanel summary={closeSummary} /> : null}
                </>
              ) : (
                <>
                  <h2 className={styles.sectionTitle}>Cierre en revision</h2>
                  <p className={styles.helpText}>La jornada fue enviada y debe cerrarse desde la pestana Cierre de caja.</p>
                  {closeSummary ? <CloseSummaryPanel summary={closeSummary} /> : null}
                </>
              )}
            </section>

            <section className={styles.summaryCard}>
              <p><strong>Usuario:</strong> {workday?.operator || auth.user?.username || "-"}</p>
              <p><strong>Estado:</strong> {status === "open" ? "Abierta" : status === "pending-close" ? "Pendiente de cierre" : "Cerrada"}</p>
              <p><strong>Apertura:</strong> {workday ? formatDateTime(workday.startedAt) : "-"}</p>
              <p><strong>Cierre:</strong> {workday?.endedAt ? formatDateTime(workday.endedAt) : status === "pending-close" ? "Pendiente admin" : "Caja abierta"}</p>
              <p><strong>Ventas del turno:</strong> {dayOrders.length}</p>
              <p><strong>Total vendido:</strong> {formatMoneyARS(dayTotal)}</p>
              <p>
                <strong>Monto asignado:</strong>{" "}
                {typeof openingAssigned === "number" ? <span className={styles.assignedAmount}>{formatMoneyARS(openingAssigned)}</span> : "-"}
              </p>
              <p><strong>Monto declarado:</strong> {typeof openingDeclared === "number" ? formatMoneyARS(openingDeclared) : "-"}</p>
              <p><strong>Diferencia apertura:</strong> {workday ? formatMoneyARS(Math.abs(openingDifference)) : "-"} {workday && openingDifference !== 0 ? `(${openingDifference > 0 ? "sobra" : "falta"})` : ""}</p>
            </section>

            {isAdmin ? (
              <section className={styles.assignmentCard}>
                <h2 className={styles.sectionTitle}>Montos de apertura por usuario/turno</h2>
                {assignmentRows.length === 0 ? (
                  <p className={styles.placeholder}>No hay usuarios para asignar montos.</p>
                ) : (
                  <div className={styles.assignmentList}>
                    {assignmentRows.map((user) => {
                      const currentDraft = assignmentDrafts[user.username] || {
                        amount: "",
                        shift: inferShiftFromHours(user.startHour, user.endHour),
                      };
                      const shiftWindow = CASH_SHIFT_WINDOWS[currentDraft.shift];
                      return (
                        <div key={user.username} className={styles.assignmentRow}>
                          <div className={styles.assignmentMeta}>
                            <strong>{user.username}</strong>
                            <span>
                              Turno asignado: {shiftWindow.label} ({shiftWindow.startHour} a {shiftWindow.endHour})
                            </span>
                          </div>
                          <select
                            className={styles.assignmentSelect}
                            value={currentDraft.shift}
                            onChange={(event) =>
                              setAssignmentDrafts((current) => ({
                                ...current,
                                [user.username]: {
                                  amount: current[user.username]?.amount ?? "",
                                  shift: event.target.value as CashShift,
                                },
                              }))
                            }
                          >
                            <option value="diurno">
                              Diurno ({CASH_SHIFT_WINDOWS.diurno.startHour} a {CASH_SHIFT_WINDOWS.diurno.endHour})
                            </option>
                            <option value="nocturno">
                              Nocturno ({CASH_SHIFT_WINDOWS.nocturno.startHour} a {CASH_SHIFT_WINDOWS.nocturno.endHour})
                            </option>
                          </select>
                          <input
                            className={styles.assignmentInput}
                            type="number"
                            min={0}
                            step={1}
                            value={currentDraft.amount}
                            onChange={(event) =>
                              setAssignmentDrafts((current) => ({
                                ...current,
                                [user.username]: {
                                  amount: event.target.value,
                                  shift: current[user.username]?.shift || currentDraft.shift,
                                },
                              }))
                            }
                          />
                          <button
                            type="button"
                            className={styles.secondaryBtn}
                            disabled={savingAssignmentFor === user.username}
                            onClick={() => void handleSaveAssignment(user.username)}
                          >
                            {savingAssignmentFor === user.username ? "Guardando..." : "Guardar"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : null}

            <div className={styles.layout}>
              <section className={styles.tableCard}>
                <h2 className={styles.tableTitle}>Ventas de la jornada</h2>
                <div className={styles.tableHead}>
                  {renderSortableHeader("Orden", "id", sortIndicator, sortKey, hasUserSorted, handleSortChange, handleClearSort)}
                  {renderSortableHeader("Operador", "operator", sortIndicator, sortKey, hasUserSorted, handleSortChange, handleClearSort)}
                  {renderSortableHeader("Pago", "paymentMethod", sortIndicator, sortKey, hasUserSorted, handleSortChange, handleClearSort)}
                  {renderSortableHeader("Total", "total", sortIndicator, sortKey, hasUserSorted, handleSortChange, handleClearSort)}
                  {renderSortableHeader("Fecha", "createdAt", sortIndicator, sortKey, hasUserSorted, handleSortChange, handleClearSort)}
                </div>

                <div className={styles.tableFilters}>
                  <FilterCell value={orderIdFilter} onChange={setOrderIdFilter} />
                  <FilterCell value={operatorFilter} onChange={setOperatorFilter} />
                  <FilterCell value={paymentFilter} onChange={setPaymentFilter} />
                  <FilterCell value={totalFilter} onChange={setTotalFilter} inputMode="numeric" />
                  <DateFilterCell value={dateFilter} onChange={setDateFilter} />
                </div>

                {loading ? (
                  <div className={styles.placeholder}>Cargando...</div>
                ) : filteredOrders.length === 0 ? (
                  <div className={styles.placeholder}>No hay ventas en esta jornada.</div>
                ) : (
                  filteredOrders.map((item, index) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`${styles.tableRow} ${selectedOrderId === item.id ? styles.tableRowActive : ""} ${index % 2 === 0 ? styles.tableRowEven : ""}`}
                      onClick={() => setSelectedOrderId(item.id)}
                    >
                      <div>{item.id}</div>
                      <div>{item.operator}</div>
                      <div>{item.paymentMethod ? formatPaymentMethodLabel(item.paymentMethod) : "-"}</div>
                      <div className={styles.cellRight}>{formatMoneyARS(item.total)}</div>
                      <div>{formatDateTime(item.createdAt)}</div>
                    </button>
                  ))
                )}
              </section>

              <section className={styles.detailCard}>
                <h2 className={styles.detailTitle}>Detalle de orden</h2>
                {!selectedOrder ? (
                  <p className={styles.placeholder}>Selecciona una orden para ver su detalle.</p>
                ) : (
                  <div className={styles.detailBody}>
                    <p><strong>Orden:</strong> {selectedOrder.id}</p>
                    <p><strong>Hora:</strong> {formatDateTime(selectedOrder.createdAt)}</p>
                    <p><strong>Operador:</strong> {selectedOrder.operator}</p>
                    <p><strong>Metodo:</strong> {selectedOrder.paymentMethod ? formatPaymentMethodLabel(selectedOrder.paymentMethod) : "-"}</p>
                    <div className={styles.detailTable}>
                      <div className={styles.detailHead}>
                        <div>Producto</div>
                        <div className={styles.cellRight}>Cant.</div>
                        <div className={styles.cellRight}>Precio</div>
                        <div className={styles.cellRight}>Subtotal</div>
                      </div>
                      {selectedOrder.items.map((product) => (
                        <div key={`${selectedOrder.id}-${product.productId}`} className={styles.detailRow}>
                          <div>{product.productName}</div>
                          <div className={styles.cellRight}>{product.quantity}</div>
                          <div className={styles.cellRight}>{formatMoneyARS(product.unitPrice)}</div>
                          <div className={styles.cellRight}>{formatMoneyARS(product.unitPrice * product.quantity)}</div>
                        </div>
                      ))}
                    </div>
                    <p className={styles.totalLine}><strong>Total:</strong> {formatMoneyARS(selectedOrder.total)}</p>
                  </div>
                )}
              </section>
            </div>
          </>
        ) : (
          <section className={styles.auditLayout}>
            <section className={styles.auditListCard}>
              <h2 className={styles.sectionTitle}>Jornadas pendientes de cierre</h2>
              {pendingCloseWorkdays.length === 0 ? (
                <p className={styles.placeholder}>No hay cierres pendientes.</p>
              ) : (
                <div className={styles.auditList}>
                  {pendingCloseWorkdays.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`${styles.auditRow} ${selectedReviewWorkdayId === item.id ? styles.auditRowActive : ""}`}
                      onClick={() => setSelectedReviewWorkdayId(item.id)}
                    >
                      <strong>{item.id}</strong>
                      <span>{item.operator}</span>
                      <span>{formatDateTime(item.closeRequestedAt || item.startedAt)}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.auditDetailCard}>
              <h2 className={styles.sectionTitle}>Auditoria de cierre</h2>
              {!selectedReviewWorkday || !selectedReviewSummary ? (
                <p className={styles.placeholder}>Selecciona una jornada pendiente para auditar.</p>
              ) : (
                <div className={styles.auditBody}>
                  <div className={styles.auditSummaryGrid}>
                    <p><strong>Operador:</strong> {selectedReviewWorkday.operator}</p>
                    <p><strong>Jornada:</strong> {selectedReviewWorkday.id}</p>
                    <p><strong>Apertura:</strong> {formatMoneyARS(Math.trunc(Number(selectedReviewWorkday.openingDeclaredAmount || 0)))}</p>
                    <p><strong>Ventas en efectivo:</strong> {formatMoneyARS(selectedReviewSummary.cashSales)}</p>
                    <p><strong>Total gastos:</strong> {formatMoneyARS(selectedReviewSummary.totalExpenses)}</p>
                    <p><strong>Vuelto mercaderia:</strong> {formatMoneyARS(selectedReviewSummary.totalSupplyReturns)}</p>
                    <p><strong>Efectivo esperado:</strong> {formatMoneyARS(selectedReviewSummary.expectedClosingCash)}</p>
                    <p><strong>Efectivo declarado:</strong> {formatMoneyARS(selectedReviewSummary.declaredClosingCash)}</p>
                    <p><strong>Diferencia cierre:</strong> {formatMoneyARS(Math.abs(selectedReviewSummary.closingDifference))} {selectedReviewSummary.closingDifference !== 0 ? `(${selectedReviewSummary.closingDifference > 0 ? "sobra" : "falta"})` : ""}</p>
                    <p><strong>Balance total:</strong> {formatMoneyARS(selectedReviewSummary.balanceTotal)}</p>
                  </div>
                  <div className={styles.paymentBreakdown}>
                    {PAYMENT_METHODS.map((method) => (
                      <p key={method}>
                        <strong>{formatPaymentMethodLabel(method)}:</strong> {formatMoneyARS(selectedReviewSummary.totalByPaymentMethod[method])}
                      </p>
                    ))}
                  </div>
                  <div className={styles.auditChecks}>
                    <AuditCheck
                      label="Apertura OK"
                      checked={auditChecks.openingAmount}
                      onChange={(next) => setAuditChecks((current) => ({ ...current, openingAmount: next }))}
                    />
                    <AuditCheck
                      label="Ventas efectivo OK"
                      checked={auditChecks.cashSales}
                      onChange={(next) => setAuditChecks((current) => ({ ...current, cashSales: next }))}
                    />
                    <AuditCheck
                      label="Gastos OK"
                      checked={auditChecks.expenses}
                      onChange={(next) => setAuditChecks((current) => ({ ...current, expenses: next }))}
                    />
                    <AuditCheck
                      label="Vuelto mercaderia OK"
                      checked={auditChecks.supplyReturns}
                      onChange={(next) => setAuditChecks((current) => ({ ...current, supplyReturns: next }))}
                    />
                    <AuditCheck
                      label="Balance OK"
                      checked={auditChecks.balance}
                      onChange={(next) => setAuditChecks((current) => ({ ...current, balance: next }))}
                    />
                  </div>
                  {auditMismatchLines.length > 0 ? (
                    <div className={styles.mismatchBox}>
                      {auditMismatchLines.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </div>
                  ) : null}
                  <label className={styles.field}>
                    <span>Informe de diferencias</span>
                    <textarea
                      className={styles.textarea}
                      value={auditMismatchReport}
                      onChange={(event) => setAuditMismatchReport(event.target.value)}
                      placeholder="El operador ... en esta jornada ... sobro/falto ..."
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Notas</span>
                    <textarea
                      className={styles.textarea}
                      value={auditNotes}
                      onChange={(event) => setAuditNotes(event.target.value)}
                      placeholder="Observaciones del cierre"
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    disabled={isReviewingClose}
                    onClick={() => void handleReviewClose()}
                  >
                    {isReviewingClose ? "Cerrando..." : "Confirmar cierre"}
                  </button>
                </div>
              )}
            </section>
          </section>
        )}

      </div>
    </div>
  );
}

function CloseSummaryPanel({ summary }: { summary: WorkdayCloseSummary }) {
  return (
    <div className={styles.closeSummaryCard}>
      <h3 className={styles.closeSummaryTitle}>Resumen de cierre</h3>
      <div className={styles.closeSummaryGrid}>
        <p><strong>Total ventas:</strong> {formatMoneyARS(summary.totalSales)}</p>
        <p><strong>Ventas en efectivo:</strong> {formatMoneyARS(summary.cashSales)}</p>
        <p><strong>Total gastos:</strong> {formatMoneyARS(summary.totalExpenses)}</p>
        <p><strong>Vuelto mercaderia:</strong> {formatMoneyARS(summary.totalSupplyReturns)}</p>
        <p><strong>Efectivo esperado:</strong> {formatMoneyARS(summary.expectedClosingCash)}</p>
        <p><strong>Efectivo declarado:</strong> {formatMoneyARS(summary.declaredClosingCash)}</p>
        <p><strong>Diferencia:</strong> {formatMoneyARS(Math.abs(summary.closingDifference))} {summary.closingDifference !== 0 ? `(${summary.closingDifference > 0 ? "sobra" : "falta"})` : ""}</p>
        <p><strong>Balance total:</strong> {formatMoneyARS(summary.balanceTotal)}</p>
      </div>
      <div className={styles.paymentBreakdown}>
        {PAYMENT_METHODS.map((method) => (
          <p key={method}>
            <strong>{formatPaymentMethodLabel(method)}:</strong> {formatMoneyARS(summary.totalByPaymentMethod[method])}
          </p>
        ))}
      </div>
    </div>
  );
}

function AuditCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className={styles.checkRow}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function FilterCell({
  value,
  onChange,
  inputMode,
}: {
  value: string;
  onChange: (value: string) => void;
  inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
}) {
  return (
    <div className={styles.filterWrap}>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={styles.filterInput} inputMode={inputMode} />
      {value ? (
        <button type="button" className={styles.clearBtn} onClick={() => onChange("")} aria-label="Limpiar filtro">
          x
        </button>
      ) : null}
    </div>
  );
}

function DateFilterCell({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className={styles.filterWrap}>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={styles.filterInputDate} />
      {value ? (
        <button type="button" className={styles.clearBtn} onClick={() => onChange("")} aria-label="Limpiar filtro de fecha">
          x
        </button>
      ) : null}
    </div>
  );
}

function renderSortableHeader(
  label: string,
  key: CashSortKey,
  indicator: (key: CashSortKey) => string,
  sortKey: CashSortKey,
  hasUserSorted: boolean,
  onSortChange: (key: CashSortKey) => void,
  onSortClear: () => void,
) {
  const active = hasUserSorted && sortKey === key;
  return (
    <div className={styles.headerCell}>
      <button type="button" className={`${styles.headerBtn} ${active ? styles.headerBtnActive : ""}`} onClick={() => onSortChange(key)}>
        {label}
        {indicator(key)}
      </button>
      {active ? (
        <button type="button" className={styles.clearBtn} onClick={onSortClear} aria-label={`Quitar orden por ${label}`}>
          x
        </button>
      ) : null}
    </div>
  );
}

