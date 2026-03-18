const moneyArsFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const dateArFormatter = new Intl.DateTimeFormat("es-AR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimeArFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
});

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

export function formatMoneyARS(value: number) {
  return moneyArsFormatter.format(value);
}

export function formatDateAR(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return dateArFormatter.format(date);
}

export function formatDateTimeAR(iso?: string) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return dateTimeArFormatter.format(date);
}

export function formatTimeRemaining(iso?: string, nowMs = Date.now()) {
  if (!iso) return "";
  const targetMs = new Date(iso).getTime();
  if (!Number.isFinite(targetMs)) return "";

  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) return "Vencida";

  const remainingHours = Math.ceil(diffMs / ONE_HOUR_MS);
  if (remainingHours <= 24) {
    return `Restan ${remainingHours} ${remainingHours === 1 ? "hora" : "horas"}`;
  }

  const remainingDays = Math.ceil(diffMs / ONE_DAY_MS);
  return `Restan ${remainingDays} ${remainingDays === 1 ? "dia" : "dias"}`;
}
