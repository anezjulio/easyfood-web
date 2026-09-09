import React, { useMemo, useState } from "react";
import type { User } from "../../feature/auth/model/auth.types";
import { AuthContext, type AuthState } from "./auth.context";
import { readAuthSession, saveAuthSession } from "../../feature/auth/service/auth.session";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(readAuthSession);

  const value = useMemo<AuthState>(
    () => ({
      user,
      isAuthed: !!user,
      login: (u) => { saveAuthSession(u); setUser(u); },
      logout: () => { saveAuthSession(null); setUser(null); },
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
