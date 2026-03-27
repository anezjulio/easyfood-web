import type { ProductCategory } from "../../product/model/product.types";

export type OperationRequestType = "merchandise" | "permissions";

export type OperationRequestStatus = "pending" | "approved" | "rejected";

export type OperationRequestItem = {
  productId: string;
  productName: string;
  quantity: number;
  barcode?: string;
  category?: ProductCategory;
};

export type OperationRequest = {
  id: string;
  requestType: OperationRequestType;
  description: string;
  items?: OperationRequestItem[];
  requestedBy: string;
  requestedAt: string;
  status: OperationRequestStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  supplyOrderId?: string;
  supplierMessage?: string;
  reviewComment?: string;
};

export type OperationRequestItemDraft = {
  productId: string;
  quantity: number;
};

export type CreateOperationRequestDraft = {
  requestType: OperationRequestType;
  description: string;
  requestedBy: string;
  items?: OperationRequestItemDraft[];
};
