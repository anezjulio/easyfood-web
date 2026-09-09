import type { User } from "../model/auth.types";

const KEY = "easyfood.auth.session";

export function readAuthSession(): User | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) || "null") as Partial<User> | null;
    if (value && typeof value.username === "string" && value.username.trim() &&
      (value.role === "admin" || value.role === "operator" || value.role === "terminal")) {
      return { username: value.username, role: value.role };
    }
  } catch {
    // Storage may be unavailable or contain invalid data.
  }
  return null;
}

export function saveAuthSession(user: User | null): void {
  try {
    if (user) sessionStorage.setItem(KEY, JSON.stringify(user));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Keep the current in-memory session usable when storage is unavailable.
  }
}
