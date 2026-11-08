export type Category = {
  order?: number;
  id: string;
  name: string;
  productIds: string[];
  createdAt: string;
  updatedAt?: string;
};

export type CategoryDraft = {
  order?: number;
  name: string;
  productIds: string[];
};
