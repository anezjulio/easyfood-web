import type { AppUserRecord, AppUserRole } from "../model/user.types";
import { readJsonOrThrow } from "../../../shared/http/http";

export type UserDraft = {
  name: string;
  email: string;
  username: string;
  role?: AppUserRole;
  password: string;
  startHour: string;
  endHour: string;
};

export type UserUpdateDraft = {
  name: string;
  email: string;
  username: string;
  role?: AppUserRole;
  password?: string;
  startHour: string;
  endHour: string;
};

const API_URL = (import.meta.env.VITE_FAKE_API_URL ?? "").replace(/\/$/, "");

function apiUrl(path: string): string {
  if (!API_URL) {
    throw new Error(
      "VITE_FAKE_API_URL no está configurada. El frontend no sabe dónde está la API."
    );
  }

  return `${API_URL}${path}`;
}

export async function fetchUsersApi(): Promise<AppUserRecord[]> {
  const response = await fetch(apiUrl("/users"));
  return await readJsonOrThrow<AppUserRecord[]>(response);
}

export async function createUserApi(
  draft: UserDraft,
): Promise<AppUserRecord> {
  const response = await fetch(apiUrl("/users"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(draft),
  });

  return await readJsonOrThrow<AppUserRecord>(response);
}

export async function updateUserApi(
  id: string,
  draft: UserUpdateDraft,
): Promise<AppUserRecord> {
  const response = await fetch(
    apiUrl(`/users/${encodeURIComponent(id)}`),
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(draft),
    },
  );

  return await readJsonOrThrow<AppUserRecord>(response);
}

export async function deleteUserApi(
  id: string,
): Promise<{ ok: boolean; id: string }> {
  const response = await fetch(
    apiUrl(`/users/${encodeURIComponent(id)}`),
    {
      method: "DELETE",
    },
  );

  return await readJsonOrThrow<{ ok: boolean; id: string }>(response);
}