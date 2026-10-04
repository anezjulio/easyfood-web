import { readJsonOrThrow } from "../../../shared/http/http";
import type { SystemSettings } from "../model/system.types";

export async function fetchSystemSettingsApi(): Promise<SystemSettings> {
  const response = await fetch("/system-settings");
  return await readJsonOrThrow<SystemSettings>(response);
}

export async function updateSystemSettingsApi(draft: Partial<SystemSettings>): Promise<SystemSettings> {
  const response = await fetch("/system-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return await readJsonOrThrow<SystemSettings>(response);
}
