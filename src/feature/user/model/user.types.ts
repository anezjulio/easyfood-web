export type AppUserRole = "admin" | "operator" | "terminal";

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
  if (user.role === "admin" || user.role === "operator" || user.role === "terminal") return user.role;

  const normalizedUsername = String(user.username || "").trim().toLowerCase();
  if (normalizedUsername === "admin") return "admin";
  if (normalizedUsername === "terminal") return "terminal";
  return "operator";
}
