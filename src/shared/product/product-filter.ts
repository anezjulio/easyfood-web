export function matchesPriceFilter(price: number, filterDigits: string): boolean {
  if (!filterDigits) return true;
  const priceDigits = String(Math.trunc(Math.abs(price)));
  const trailingZeros = filterDigits.match(/0+$/)?.[0].length ?? 0;
  if (trailingZeros >= 2) return priceDigits === filterDigits;
  return priceDigits.includes(filterDigits);
}

export function matchesNumericContainsFilter(value: number, filterDigits: string): boolean {
  if (!filterDigits) return true;
  const valueDigits = String(Math.trunc(Math.abs(value)));
  return valueDigits.includes(filterDigits);
}
