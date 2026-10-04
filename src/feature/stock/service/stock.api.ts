import { readJsonOrThrow } from "../../../shared/http/http";

export type StockEntryDraft = {
  productId: string;
  expirationDate?: string;
  movementDate?: string;
  quantity: number;
  metric?: "unit" | "grams" | "kilos";
  movementType?: "in" | "out";
  description?: string;
  supplyOrderId?: string;
  costPrice?: number;
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
