import type {
  CreateLicenseDraft,
  CreateLicenseIssuanceDraft,
  LicenseRecord,
  UpdateLicenseDraft,
} from "../model/license.types";
import { readJsonOrThrow } from "../../../shared/http/http";

export async function fetchLicensesApi(): Promise<LicenseRecord[]> {
  const response = await fetch("/licenses");
  return await readJsonOrThrow<LicenseRecord[]>(response);
}

export async function createLicenseApi(draft: CreateLicenseDraft): Promise<LicenseRecord> {
  const response = await fetch("/licenses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<LicenseRecord>(response);
}

export async function updateLicenseApi(id: string, draft: UpdateLicenseDraft): Promise<LicenseRecord> {
  const response = await fetch(`/licenses/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<LicenseRecord>(response);
}

export async function addLicenseIssuanceApi(id: string, draft: CreateLicenseIssuanceDraft): Promise<LicenseRecord> {
  const response = await fetch(`/licenses/${encodeURIComponent(id)}/issuances`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<LicenseRecord>(response);
}
