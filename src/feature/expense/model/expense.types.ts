export type ExpenseType = "recurrent" | "unexpected";
export type ExpenseStatus = "pending-confirmation" | "confirmed";
export type ExpenseAmountMode = "assigned" | "different";

export type Expense = {
  id: string;
  description: string;
  amount: number;
  assignedAmount: number;
  expenseType: ExpenseType;
  invoiceImageUrl?: string;
  unexpectedImageUrl?: string;
  createdBy: string;
  createdAt: string;
  status: ExpenseStatus;
  confirmedAmount?: number;
  confirmedBy?: string;
  confirmedAt?: string;
  confirmationComment?: string;
  amountMode?: ExpenseAmountMode;
};

export type ExpenseDraft = {
  description: string;
  amount: number;
  expenseType: ExpenseType;
  invoiceImageUrl?: string;
  unexpectedImageUrl?: string;
  createdBy?: string;
};

export type ConfirmExpenseDraft = {
  confirmedAmount: number;
  amountMode: ExpenseAmountMode;
  confirmationComment?: string;
  confirmedBy?: string;
};
