export type RecipeIngredient = {
  required?: boolean;
  ingredientId: string;
  quantity: number;
};

export type Recipe = {
  id: string;
  productId: string;
  ingredients: RecipeIngredient[];
  createdAt: string;
  updatedAt?: string;
};

export type RecipeDraft = {
  productId: string;
  ingredients: RecipeIngredient[];
};
