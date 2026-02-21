export type OperationRequestType = "merchandise" | "permissions";

export type OperationRequestStatus = "pending" | "approved" | "rejected";

export type OperationRequest = {
  id: string;
  requestType: OperationRequestType;
  description: string;
  requestedBy: string;
  requestedAt: string;
  status: OperationRequestStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  supplyOrderId?: string;
  supplierMessage?: string;
  reviewComment?: string;
};

export type CreateOperationRequestDraft = {
  requestType: OperationRequestType;
  description: string;
  requestedBy: string;
};
