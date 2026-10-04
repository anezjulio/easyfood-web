import { readJsonOrThrow } from "../../../shared/http/http";
import type { Combo, ComboDraft } from "../model/combo.types";

const FAKE_API_URL = (import.meta.env.VITE_FAKE_API_URL || "").trim();

function getUrl(path: string) {
  return FAKE_API_URL ? `${FAKE_API_URL}${path}` : path;
}

export async function fetchCombosApi(): Promise<Combo[]> {
  const response = await fetch(getUrl("/combos"));
  return await readJsonOrThrow<Combo[]>(response);
}

export async function createComboApi(draft: ComboDraft): Promise<Combo> {
  const response = await fetch(getUrl("/combos"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<Combo>(response);
}

export async function updateComboApi(id: string, draft: ComboDraft): Promise<Combo | null> {
  const response = await fetch(getUrl(`/combos/${encodeURIComponent(id)}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  if (response.status === 404) return null;
  return await readJsonOrThrow<Combo>(response);
}

export async function deleteComboApi(id: string): Promise<boolean> {
  const response = await fetch(getUrl(`/combos/${encodeURIComponent(id)}`), { method: "DELETE" });
  const data = await readJsonOrThrow<{ ok: boolean }>(response);
  return !!data.ok;
}
