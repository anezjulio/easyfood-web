import { md5 } from "../../../shared/crypto/md5";
import { readJsonOrThrow } from "../../../shared/http/http";

export const DATA_STORE_CHANGED_EVENT = "easyfood-data-store-changed";

type ResetDatabaseDraft = {
  requestedBy: string;
  adminPassword: string;
};

type ResetDatabaseResult = {
  ok: boolean;
  clearedAt: string;
  activeStoreId?: string;
  message: string;
};

export type DataStoreSummary = {
  id: string;
  name: string;
  dbPath: string;
  imagesDir: string;
  receiptsDir: string;
  createdAt: string;
};

type DataStoresState = {
  activeStoreId: string;
  stores: DataStoreSummary[];
};

type CreateDataStoreDraft = {
  requestedBy: string;
  adminPassword: string;
  name: string;
  storeId?: string;
};

type CreateDataStoreResult = {
  ok: boolean;
  message: string;
  activeStoreId: string;
  store: DataStoreSummary;
};

type SwitchDataStoreDraft = {
  requestedBy: string;
  adminPassword: string;
  storeId: string;
};

type SwitchDataStoreResult = {
  ok: boolean;
  message: string;
  activeStoreId: string;
  store: DataStoreSummary;
};

type DownloadDataStoreBackupDraft = {
  requestedBy: string;
  adminPassword: string;
  storeId: string;
};

function toAdminPayload(requestedBy: string, adminPassword: string) {
  return {
    requestedBy: String(requestedBy || "").trim(),
    adminPasswordHash: md5(String(adminPassword || "")),
  };
}

function notifyDataStoreChanged(storeId?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DATA_STORE_CHANGED_EVENT, { detail: { storeId } }));
}

export async function fetchDataStoresApi(): Promise<DataStoresState> {
  const response = await fetch("/admin/data/stores");
  return await readJsonOrThrow<DataStoresState>(response);
}

export async function createDataStoreApi(draft: CreateDataStoreDraft): Promise<CreateDataStoreResult> {
  const response = await fetch("/admin/data/stores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...toAdminPayload(draft.requestedBy, draft.adminPassword),
      name: String(draft.name || "").trim(),
      storeId: String(draft.storeId || "").trim(),
    }),
  });
  const result = await readJsonOrThrow<CreateDataStoreResult>(response);
  notifyDataStoreChanged(result.activeStoreId);
  return result;
}

export async function switchDataStoreApi(draft: SwitchDataStoreDraft): Promise<SwitchDataStoreResult> {
  const response = await fetch("/admin/data/stores/active", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...toAdminPayload(draft.requestedBy, draft.adminPassword),
      storeId: String(draft.storeId || "").trim(),
    }),
  });
  const result = await readJsonOrThrow<SwitchDataStoreResult>(response);
  notifyDataStoreChanged(result.activeStoreId);
  return result;
}

export async function downloadDataStoreBackupApi(
  draft: DownloadDataStoreBackupDraft,
): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch("/admin/data/stores/backup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...toAdminPayload(draft.requestedBy, draft.adminPassword),
      storeId: String(draft.storeId || "").trim(),
    }),
  });

  if (!response.ok) {
    await readJsonOrThrow<never>(response);
  }

  return {
    blob: await response.blob(),
    filename: response.headers.get("X-Backup-Filename") || `easyfood-${draft.storeId || "base"}-backup.js`,
  };
}

export async function resetDatabaseApi(draft: ResetDatabaseDraft): Promise<ResetDatabaseResult> {
  const response = await fetch("/admin/data/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toAdminPayload(draft.requestedBy, draft.adminPassword)),
  });
  const result = await readJsonOrThrow<ResetDatabaseResult>(response);
  notifyDataStoreChanged(result.activeStoreId);
  return result;
}
