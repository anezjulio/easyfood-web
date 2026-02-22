import type { Expense, ExpenseDraft } from "../model/expense.types";
import { readJsonOrThrow } from "../../../shared/http/http";

export async function fetchExpensesApi(): Promise<Expense[]> {
  const response = await fetch("/expenses");
  return await readJsonOrThrow<Expense[]>(response);
}

export async function createExpenseApi(draft: ExpenseDraft): Promise<Expense> {
  const response = await fetch("/expenses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<Expense>(response);
}
