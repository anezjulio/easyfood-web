function normalize(value: string): string {
  return (value || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function isPanchoProductType(name: string): boolean {
  return normalize(name).includes("pancho");
}

export function generateAutoBarcode(): string {
  const base = `${Date.now()}${Math.floor(Math.random() * 10_000)}`.replace(/\D/g, "");
  const suffix = base.slice(-10).padStart(10, "0");
  return `779${suffix}`;
}

export function generatePanchoBarcode(): string {
  return generateAutoBarcode();
}
