import type { ProductCategory } from "../../product/model/product.types";

export type SupplyOrderStatus = "pending" | "received";

export type SupplyOrderItem = {
  productId: string;
  productName: string;
  quantity: number;
  barcode?: string;
  brand?: string;
  category?: ProductCategory;
  receivedQuantity?: number;
  missingQuantity?: number;
  expirationDate?: string;
};

export type SupplyOrder = {
  id: string;
  supplierName: string;
  description: string;
  expectedTotal: number;
  items: SupplyOrderItem[];
  createdAt: string;
  createdBy: string;
  status: SupplyOrderStatus;
  isExactAmount?: boolean;
  actualTotal?: number;
  remainingAmount?: number;
  receivedAt?: string;
  receivedBy?: string;
  invoiceImageUrl?: string;
  receiveComment?: string;
};

export type SupplyOrderItemDraft = {
  productId: string;
  quantity: number;
};

export type SupplyOrderDraft = {
  supplierName: string;
  description?: string;
  items?: SupplyOrderItemDraft[];
  expectedTotal: number;
  createdBy?: string;
};

export type SupplyOrderReceiveItemDraft = {
  productId: string;
  missingQuantity: number;
  expirationDate?: string;
};

export type SupplyOrderReceiveDraft = {
  actualTotal: number;
  isExactAmount: boolean;
  receivedBy?: string;
  invoiceImageUrl?: string;
  receiveComment?: string;
  items?: SupplyOrderReceiveItemDraft[];
};
