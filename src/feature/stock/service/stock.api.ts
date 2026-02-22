import { readJsonOrThrow } from "../../../shared/http/http";

export type StockEntryDraft = {
  productId: string;
  manufactureDate?: string;
  expirationDate?: string;
  quantity: number;
  description?: string;
  supplyOrderId?: string;
  costPrice?: number;
  salePrice?: number;
};

export type StockEntry = StockEntryDraft & {
  id: string;
  createdAt: string;
};

export async function createStockEntryApi(draft: StockEntryDraft): Promise<StockEntry> {
  const response = await fetch("/stocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<StockEntry>(response);
}

export async function fetchStockEntriesApi(): Promise<StockEntry[]> {
  const response = await fetch("/stocks");
  return await readJsonOrThrow<StockEntry[]>(response);
}
