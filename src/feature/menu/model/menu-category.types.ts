import type { ProductCategory } from "../../product/model/product.types";

export type MenuCategory = {
  id: ProductCategory;
  name: string;
  createdAt: string;
  updatedAt?: string;
};

export type MenuCategoryDraft = {
  name: string;
};
