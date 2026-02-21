export type ExpenseType = "recurrent" | "unexpected";

export type Expense = {
  id: string;
  description: string;
  amount: number;
  expenseType: ExpenseType;
  invoiceImageUrl?: string;
  unexpectedImageUrl?: string;
  createdBy: string;
  createdAt: string;
};

export type ExpenseDraft = {
  description: string;
  amount: number;
  expenseType: ExpenseType;
  invoiceImageUrl?: string;
  unexpectedImageUrl?: string;
  createdBy?: string;
};
