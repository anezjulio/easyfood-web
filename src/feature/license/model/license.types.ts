import type { ProductCategory } from "../../product/model/product.types";

export type LicenseStatus = "active" | "pending-renewal" | "expired";

export type LicenseIssuance = {
  id: string;
  issuedAt: string;
  expiresAt: string;
  createdAt: string;
  notes?: string;
};

export type LicenseRecord = {
  id: string;
  name: string;
  description: string;
  category?: ProductCategory;
  issueDate?: string;
  expirationDate?: string;
  durationDays?: number;
  contactEmail?: string;
  contactPhone?: string;
  sourceAddress?: string;
  status: LicenseStatus;
  createdAt: string;
  updatedAt: string;
  issuances: LicenseIssuance[];
};

export type CreateLicenseDraft = {
  name: string;
  description: string;
  category?: ProductCategory;
  issueDate?: string;
  expirationDate?: string;
  contactEmail?: string;
  contactPhone?: string;
  sourceAddress?: string;
};

export type UpdateLicenseDraft = CreateLicenseDraft;

export type CreateLicenseIssuanceDraft = {
  issuedAt: string;
  expiresAt: string;
  notes?: string;
};

