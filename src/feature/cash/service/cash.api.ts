import type { CashOpeningAssignment, CashShift, Workday, WorkdayAdminReview, WorkdayAuditChecks } from "../model/cash.types";
import { readJsonOrThrow } from "../../../shared/http/http";

const CASH_STATUS_CHANGED_EVENT = "cash-status-changed";

function notifyCashStatusChanged(operator: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CASH_STATUS_CHANGED_EVENT, {
      detail: { operator },
    }),
  );
}

export function onCashStatusChanged(listener: (operator: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const custom = event as CustomEvent<{ operator?: string }>;
    if (!custom.detail?.operator) return;
    listener(custom.detail.operator);
  };
  window.addEventListener(CASH_STATUS_CHANGED_EVENT, handler as EventListener);
  return () => window.removeEventListener(CASH_STATUS_CHANGED_EVENT, handler as EventListener);
}

export async function fetchWorkdaysApi(): Promise<Workday[]> {
  const response = await fetch("/workdays");
  return await readJsonOrThrow<Workday[]>(response);
}

export async function fetchCurrentWorkdayApi(operator: string): Promise<Workday | null> {
  const response = await fetch(`/workdays/current?operator=${encodeURIComponent(operator)}`);
  if (response.status === 404) return null;
  return await readJsonOrThrow<Workday | null>(response);
}

export async function fetchCashOpeningAssignmentsApi(): Promise<CashOpeningAssignment[]> {
  const response = await fetch("/cash-opening-assignments");
  return await readJsonOrThrow<CashOpeningAssignment[]>(response);
}

export async function upsertCashOpeningAssignmentApi(
  operator: string,
  draft: { amount: number; shift: CashShift; updatedBy: string },
): Promise<CashOpeningAssignment> {
  const response = await fetch(`/cash-opening-assignments/${encodeURIComponent(operator)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<CashOpeningAssignment>(response);
}

export async function openWorkdayApi(operator: string, draft: { openingAmount: number }): Promise<Workday> {
  const response = await fetch("/workdays/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operator, openingAmount: draft.openingAmount }),
  });
  const opened = await readJsonOrThrow<Workday>(response);
  notifyCashStatusChanged(operator);
  return opened;
}

export async function ensureOpenWorkdayApi(operator: string): Promise<Workday> {
  const current = await fetchCurrentWorkdayApi(operator);
  if (current) return current;
  throw new Error("Workday is not open");
}

export async function closeWorkdayApi(id: string, draft: { endedAt?: string; orderIds: string[] }): Promise<Workday> {
  const response = await fetch(`/workdays/${encodeURIComponent(id)}/close`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  const closed = await readJsonOrThrow<Workday>(response);
  notifyCashStatusChanged(closed.operator);
  return closed;
}

export async function requestWorkdayCloseApi(
  id: string,
  draft: { operator: string; declaredClosingCash: number; orderIds: string[] },
): Promise<Workday> {
  const response = await fetch(`/workdays/${encodeURIComponent(id)}/request-close`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  const updated = await readJsonOrThrow<Workday>(response);
  notifyCashStatusChanged(updated.operator);
  return updated;
}

export async function reviewWorkdayCloseApi(
  id: string,
  draft: {
    reviewedBy: string;
    checks: WorkdayAuditChecks;
    notes?: string;
    mismatchReport?: string;
  },
): Promise<Workday> {
  const response = await fetch(`/workdays/${encodeURIComponent(id)}/admin-close`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  const updated = await readJsonOrThrow<Workday>(response);
  notifyCashStatusChanged(updated.operator);
  return updated;
}

export async function addOrderToCurrentWorkdayApi(operator: string, orderId: string): Promise<Workday> {
  const response = await fetch("/workdays/current/add-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operator, orderId }),
  });
  return await readJsonOrThrow<Workday>(response);
}

export async function closeCurrentWorkdayApi(operator: string): Promise<Workday | null> {
  const current = await fetchCurrentWorkdayApi(operator);
  if (!current) return null;
  const fallbackChecks: WorkdayAuditChecks = {
    openingAmount: true,
    cashSales: true,
    expenses: true,
    supplyReturns: true,
    balance: true,
  };
  const fallbackReview: WorkdayAdminReview = {
    reviewedBy: operator,
    reviewedAt: new Date().toISOString(),
    checks: fallbackChecks,
  };
  return await reviewWorkdayCloseApi(current.id, {
    reviewedBy: fallbackReview.reviewedBy,
    checks: fallbackReview.checks,
    notes: fallbackReview.notes,
    mismatchReport: fallbackReview.mismatchReport,
  });
}
