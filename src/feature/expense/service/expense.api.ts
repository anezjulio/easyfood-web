import type { Expense, ExpenseDraft } from "../model/expense.types";

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

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
