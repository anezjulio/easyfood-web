import type { AppUserRole } from "../../user/model/user.types";

export type User = {
  username: string;
  role: AppUserRole;
};
