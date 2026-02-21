import React, { createContext, useContext, useMemo, useState } from "react";
import type { User } from "../../feature/auth/model/auth.types";

type AuthState = {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  isAuthed: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}