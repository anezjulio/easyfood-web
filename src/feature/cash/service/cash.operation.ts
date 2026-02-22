import type { Workday } from "../model/cash.types";
import { fetchCurrentWorkdayApi, openWorkdayApi, requestWorkdayCloseApi } from "./cash.api";
import { markCashSessionClosed, markCashSessionOpen } from "./cash.session";

function resolveWorkdayIsOpen(workday: Workday | null): boolean {
  if (!workday) return false;
  const status = workday.status || (workday.endedAt ? "closed" : "open");
  return status === "open";
}

export async function syncCashState(operator: string): Promise<{ workday: Workday | null; isOpen: boolean }> {
  const normalized = String(operator || "").trim();
  if (!normalized) return { workday: null, isOpen: false };

  try {
    const current = await fetchCurrentWorkdayApi(normalized);
    const isOpen = resolveWorkdayIsOpen(current);
    if (isOpen) {
      markCashSessionOpen(normalized);
    } else {
      markCashSessionClosed(normalized);
    }
    return { workday: current, isOpen };
  } catch {
    markCashSessionClosed(normalized);
    return { workday: null, isOpen: false };
  }
}

export async function openCashWithAmount(operator: string, openingAmount: number): Promise<Workday> {
  const normalized = String(operator || "").trim();
  if (!normalized) {
    throw new Error("Operator is required");
  }

  markCashSessionOpen(normalized);
  try {
    return await openWorkdayApi(normalized, { openingAmount });
  } catch (error) {
    markCashSessionClosed(normalized);
    throw error;
  }
}

export async function requestCashCloseWithAmount(
  workdayId: string,
  operator: string,
  declaredClosingCash: number,
  orderIds: string[],
): Promise<Workday> {
  const normalized = String(operator || "").trim();
  if (!normalized) {
    throw new Error("Operator is required");
  }

  const updated = await requestWorkdayCloseApi(workdayId, {
    operator: normalized,
    declaredClosingCash,
    orderIds,
  });
  markCashSessionClosed(normalized);
  return updated;
}

