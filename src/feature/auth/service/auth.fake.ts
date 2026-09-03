import type { User } from "../model/auth.types";
import { md5 } from "../../../shared/crypto/md5";
import { resolveAppUserRole } from "../../user/model/user.types";
import { fetchUsersApi } from "../../user/service/user.api";

export async function fakeLogin(username: string, password: string): Promise<User> {
  const users = await fetchUsersApi();
  const normalizedUsername = username.trim().toLowerCase();
  const hashedPassword = md5(password);

  const found = users.find(
    (item) =>
      item.username.trim().toLowerCase() === normalizedUsername &&
      item.password === hashedPassword,
  );

  if (!found) {
    throw new Error("Usuario o contrasena invalidos");
  }

  return {
    username: found.username,
    role: resolveAppUserRole(found),
  };
}