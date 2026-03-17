import type { PaymentMethod } from "../../sale/model/sale.types";

export type FinancialAccountKind = "asset" | "income" | "expense" | "category";

export type FinancialAccount = {
  id: string;
  code: string;
  name: string;
  kind: FinancialAccountKind;
  description: string;
  currentBalance: number;
  createdAt: string;
  updatedAt: string;
};

export type FinancialDirection = "in" | "out";
export type FinancialEntryKind = "debit" | "credit";
export type FinancialReferenceModule = "sale" | "expense" | "cash" | "supply" | "system";

export type FinancialTransactionType =
  | "sale-income"
  | "sale-cash"
  | "sale-tobacco"
  | "expense-payment"
  | "expense-cash"
  | "supply-payment"
  | "supply-cash"
  | "supply-return"
  | "cash-opening"
  | "cash-close";

export type FinancialTransaction = {
  id: string;
  createdAt: string;
  type: FinancialTransactionType;
  title: string;
  description: string;
  amount: number;
  direction: FinancialDirection;
  entryKind: FinancialEntryKind;
  accountId: string;
  accountCode: string;
  accountName: string;
  referenceModule: FinancialReferenceModule;
  referenceId: string;
  orderId?: string;
  workdayId?: string;
  expenseId?: string;
  supplyOrderId?: string;
  invoiceId?: string;
  paymentMethod?: PaymentMethod;
  actor?: string;
  countsInBalance: boolean;
};
