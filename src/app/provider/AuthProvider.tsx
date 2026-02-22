import React, { useMemo, useState } from "react";
import type { User } from "../../feature/auth/model/auth.types";
import { AuthContext, type AuthState } from "./auth.context";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const value = useMemo<AuthState>(
    () => ({
      user,
      isAuthed: !!user,
      login: (u) => setUser(u),
      logout: () => setUser(null),
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
