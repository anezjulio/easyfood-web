import { readJsonOrThrow } from "../../../shared/http/http";
import type { FinancialAccount, FinancialTransaction } from "../model/transaction.types";

export async function fetchFinancialAccountsApi(): Promise<FinancialAccount[]> {
  const response = await fetch("/financial-accounts");
  return await readJsonOrThrow<FinancialAccount[]>(response);
}

export async function fetchFinancialTransactionsApi(): Promise<FinancialTransaction[]> {
  const response = await fetch("/financial-transactions");
  return await readJsonOrThrow<FinancialTransaction[]>(response);
}
