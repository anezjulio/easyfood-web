const CASH_SESSION_PREFIX = "easyfood:cash-session:";

function buildOperatorKey(operator: string): string | null {
  const normalized = String(operator || "").trim().toLowerCase();
  if (!normalized) return null;
  return `${CASH_SESSION_PREFIX}${normalized}`;
}

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function isCashSessionOpen(operator: string): boolean {
  if (!canUseSessionStorage()) return false;
  const key = buildOperatorKey(operator);
  if (!key) return false;
  return window.sessionStorage.getItem(key) === "open";
}

export function markCashSessionOpen(operator: string) {
  if (!canUseSessionStorage()) return;
  const key = buildOperatorKey(operator);
  if (!key) return;
  window.sessionStorage.setItem(key, "open");
}

export function markCashSessionClosed(operator: string) {
  if (!canUseSessionStorage()) return;
  const key = buildOperatorKey(operator);
  if (!key) return;
  window.sessionStorage.setItem(key, "closed");
}
