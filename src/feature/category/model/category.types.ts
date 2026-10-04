export type Category = {
  id: string;
  name: string;
  productIds: string[];
  createdAt: string;
  updatedAt?: string;
};

export type CategoryDraft = {
  name: string;
  productIds: string[];
};
