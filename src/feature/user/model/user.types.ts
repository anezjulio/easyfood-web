export type AppUserRole = "admin" | "operator";

export type AppUserRecord = {
  id: string;
  name: string;
  email: string;
  username: string;
  role?: AppUserRole;
  password: string;
  createdAt: string;
  updatedAt: string;
  startHour: string;
  endHour: string;
};

export function resolveAppUserRole(
  user: Pick<AppUserRecord, "username" | "role"> | null | undefined,
): AppUserRole {
  if (!user) return "operator";
  if (user.role === "admin" || user.role === "operator") return user.role;
  return String(user.username || "").trim().toLowerCase() === "admin" ? "admin" : "operator";
}
