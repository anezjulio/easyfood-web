import type {
  CreateOperationRequestDraft,
  OperationRequest,
  OperationRequestItemDraft,
  OperationRequestStatus,
  OperationRequestType,
} from "../model/request.types";
import { readJsonOrThrow } from "../../../shared/http/http";

export async function fetchOperationRequestsApi(): Promise<OperationRequest[]> {
  const response = await fetch("/operation-requests");
  return await readJsonOrThrow<OperationRequest[]>(response);
}

export async function createOperationRequestApi(draft: CreateOperationRequestDraft): Promise<OperationRequest> {
  const response = await fetch("/operation-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<OperationRequest>(response);
}

export async function updateOperationRequestApi(
  id: string,
  draft: { requestType: OperationRequestType; description: string; items?: OperationRequestItemDraft[] },
): Promise<OperationRequest> {
  const response = await fetch(`/operation-requests/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<OperationRequest>(response);
}

export async function cancelOperationRequestApi(id: string): Promise<{ ok: boolean; id: string }> {
  const response = await fetch(`/operation-requests/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return await readJsonOrThrow<{ ok: boolean; id: string }>(response);
}

export async function updateOperationRequestStatusApi(
  id: string,
  status: Exclude<OperationRequestStatus, "pending">,
  reviewedBy: string,
  options?: { supplyOrderId?: string; supplierMessage?: string; reviewComment?: string; items?: OperationRequestItemDraft[] },
): Promise<OperationRequest> {
  const response = await fetch(`/operation-requests/${encodeURIComponent(id)}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status,
      reviewedBy,
      supplyOrderId: options?.supplyOrderId,
      supplierMessage: options?.supplierMessage,
      reviewComment: options?.reviewComment,
      items: options?.items,
    }),
  });
  return await readJsonOrThrow<OperationRequest>(response);
}
