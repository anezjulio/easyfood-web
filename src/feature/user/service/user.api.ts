import type { AppUserRecord, AppUserRole } from "../model/user.types";
import { md5 } from "../../../shared/crypto/md5";

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

const STORAGE_KEY = "easyfood_users";

const DEFAULT_USERS: AppUserRecord[] = [
  {
    id: "1",
    name: "Administrador",
    email: "admin@easyfood.local",
    username: "admin",
    role: "admin",
    password: md5("1234"),
    startHour: "00:00",
    endHour: "23:59",
  } as AppUserRecord,
];

function readUsers(): AppUserRecord[] {
  const stored = localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
    return DEFAULT_USERS;
  }

  try {
    return JSON.parse(stored) as AppUserRecord[];
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
    return DEFAULT_USERS;
  }
}

function saveUsers(users: AppUserRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

export async function fetchUsersApi(): Promise<AppUserRecord[]> {
  return readUsers();
}

export async function createUserApi(
  draft: UserDraft,
): Promise<AppUserRecord> {
  const users = readUsers();

  const newUser = {
    ...draft,
    id: crypto.randomUUID(),
    password: md5(draft.password),
  } as AppUserRecord;

  users.push(newUser);
  saveUsers(users);

  return newUser;
}

export async function updateUserApi(
  id: string,
  draft: UserUpdateDraft,
): Promise<AppUserRecord> {
  const users = readUsers();

  const index = users.findIndex(
    (user) => String(user.id) === String(id),
  );

  if (index === -1) {
    throw new Error("Usuario no encontrado");
  }

  const current = users[index];

  const updated = {
    ...current,
    ...draft,
    password: draft.password
      ? md5(draft.password)
      : current.password,
  } as AppUserRecord;

  users[index] = updated;
  saveUsers(users);

  return updated;
}

export async function deleteUserApi(
  id: string,
): Promise<{ ok: boolean; id: string }> {
  const users = readUsers();

  const filtered = users.filter(
    (user) => String(user.id) !== String(id),
  );

  if (filtered.length === users.length) {
    throw new Error("Usuario no encontrado");
  }

  saveUsers(filtered);

  return {
    ok: true,
    id,
  };
}