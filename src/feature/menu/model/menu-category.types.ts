import type { ProductCategory } from "../../product/model/product.types";

export type MenuCategory = {
  order?: number;
  id: ProductCategory;
  name: string;
  createdAt: string;
  updatedAt?: string;
};

export type MenuCategoryDraft = {
  order?: number;
  name: string;
};
