import type { PaymentMethod } from "../../sale/model/sale.types";

export type WorkdayStatus = "open" | "pending-close" | "closed";
export type CashShift = "diurno" | "nocturno";

export type WorkdayCloseSummary = {
  totalSales: number;
  totalByPaymentMethod: Record<PaymentMethod, number>;
  cashSales: number;
  totalExpenses: number;
  totalSupplyReturns: number;
  expectedClosingCash: number;
  declaredClosingCash: number;
  closingDifference: number;
  balanceTotal: number;
};

export type WorkdayAuditChecks = {
  openingAmount: boolean;
  cashSales: boolean;
  expenses: boolean;
  supplyReturns: boolean;
  balance: boolean;
};

export type WorkdayAdminReview = {
  reviewedBy: string;
  reviewedAt: string;
  checks: WorkdayAuditChecks;
  notes?: string;
  mismatchReport?: string;
};

export type CashOpeningAssignment = {
  operator: string;
  amount: number;
  shift: CashShift;
  startHour: string;
  endHour: string;
  updatedBy: string;
  updatedAt: string;
};

export type Workday = {
  id: string;
  operator: string;
  startedAt: string;
  endedAt?: string;
  orderIds: string[];
  status?: WorkdayStatus;
  openingAssignedAmount?: number;
  openingDeclaredAmount?: number;
  openingDifferenceAmount?: number;
  closeRequestedAt?: string;
  closeSummary?: WorkdayCloseSummary;
  adminReview?: WorkdayAdminReview;
};
