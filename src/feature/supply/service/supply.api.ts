import type { SupplyOrder, SupplyOrderDraft, SupplyOrderReceiveDraft } from "../model/supply.types";
import { readJsonOrThrow } from "../../../shared/http/http";

export async function fetchSupplyOrdersApi(): Promise<SupplyOrder[]> {
  const response = await fetch("/supply-orders");
  return await readJsonOrThrow<SupplyOrder[]>(response);
}

export async function createSupplyOrderApi(draft: SupplyOrderDraft): Promise<SupplyOrder> {
  const response = await fetch("/supply-orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<SupplyOrder>(response);
}

export async function updateSupplyOrderApi(
  id: string,
  draft: Pick<SupplyOrderDraft, "supplierName" | "description" | "expectedTotal" | "items">,
): Promise<SupplyOrder> {
  const response = await fetch(`/supply-orders/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<SupplyOrder>(response);
}

export async function cancelSupplyOrderApi(id: string): Promise<{ ok: boolean; id: string }> {
  const response = await fetch(`/supply-orders/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return await readJsonOrThrow<{ ok: boolean; id: string }>(response);
}

export async function receiveSupplyOrderApi(id: string, draft: SupplyOrderReceiveDraft): Promise<SupplyOrder> {
  const response = await fetch(`/supply-orders/${encodeURIComponent(id)}/receive`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<SupplyOrder>(response);
}
