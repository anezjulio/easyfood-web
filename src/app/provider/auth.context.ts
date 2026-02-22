import { createContext } from "react";
import type { User } from "../../feature/auth/model/auth.types";

export type AuthState = {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  isAuthed: boolean;
};

export const AuthContext = createContext<AuthState | null>(null);
