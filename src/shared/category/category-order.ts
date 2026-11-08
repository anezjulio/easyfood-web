type OrderedCategory = { id?: string; name: string; order?: number };

export function getCategoryOrder(category: OrderedCategory): number {
  if (typeof category.order === "number" && Number.isFinite(category.order) && category.order >= 0) return Math.trunc(category.order);
  const key = `${category.id || ""} ${category.name}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\bcombos?\b/.test(key)) return 10;
  if (/\bhamburguesas?\b/.test(key)) return 20;
  if (/\bpanchos?\b/.test(key)) return 30;
  if (/\bbebidas?\b/.test(key)) return 40;
  if (/\bextras?\b/.test(key)) return 50;
  return 1000;
}

export function compareCategoryOrder(a: OrderedCategory, b: OrderedCategory): number {
  return getCategoryOrder(a) - getCategoryOrder(b) || a.name.localeCompare(b.name);
}
