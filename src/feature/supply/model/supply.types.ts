export type SupplyOrderStatus = "pending" | "received";

export type SupplyOrder = {
  id: string;
  supplierName: string;
  description: string;
  expectedTotal: number;
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

export type SupplyOrderDraft = {
  supplierName: string;
  description: string;
  expectedTotal: number;
  createdBy?: string;
};

export type SupplyOrderReceiveDraft = {
  actualTotal: number;
  isExactAmount: boolean;
  receivedBy?: string;
  invoiceImageUrl?: string;
  receiveComment?: string;
};
