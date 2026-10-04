export type ComboFixedItem = {
  productId: string;
  quantity: number;
};

export type ComboOptionGroup = {
  id: string;
  name: string;
  quantity: number;
  productIds: string[];
};

export type Combo = {
  id: string;
  productId: string;
  items: ComboFixedItem[];
  optionGroups: ComboOptionGroup[];
  createdAt: string;
  updatedAt?: string;
};

export type ComboDraft = {
  productId: string;
  items: ComboFixedItem[];
  optionGroups: ComboOptionGroup[];
};
