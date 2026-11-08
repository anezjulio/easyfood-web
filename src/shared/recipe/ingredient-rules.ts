export function isRecipeIngredientRequired(item: { required?: boolean }, ingredientCount: number): boolean {
  return ingredientCount === 1 || item.required !== false;
}

export function normalizeRecipeRequirements<T extends { required?: boolean }>(items: T[]): Array<T & { required: boolean }> {
  return items.map((item) => ({ ...item, required: isRecipeIngredientRequired(item, items.length) }));
}
