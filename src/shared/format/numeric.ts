export function keepOnlyDigits(value: string) {
  return (value || "").replace(/\D/g, "");
}

export function formatIntegerTextMask(input: string) {
  const digits = keepOnlyDigits(input);
  if (!digits) return "";
  const normalized = digits.replace(/^0+/, "");
  if (!normalized) return "";
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(normalized));
}

export function parsePositiveIntFromTextMask(input: string): number {
  const parsed = Math.trunc(Number(keepOnlyDigits(input)));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}
