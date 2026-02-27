import { md5 } from "../../../shared/crypto/md5";
import { readJsonOrThrow } from "../../../shared/http/http";

type ResetDatabaseDraft = {
  requestedBy: string;
  adminPassword: string;
};

type ResetDatabaseResult = {
  ok: boolean;
  clearedAt: string;
  message: string;
};

export async function resetDatabaseApi(draft: ResetDatabaseDraft): Promise<ResetDatabaseResult> {
  const response = await fetch("/admin/data/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestedBy: String(draft.requestedBy || "").trim(),
      adminPasswordHash: md5(String(draft.adminPassword || "")),
    }),
  });
  return await readJsonOrThrow<ResetDatabaseResult>(response);
}

