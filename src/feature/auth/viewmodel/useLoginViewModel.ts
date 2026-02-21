import { useState } from "react";
import { fakeLogin } from "../service/auth.fake";
import { useAuth } from "../../../app/provider/AuthProvider";

export function useLoginViewModel() {
  const auth = useAuth();

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState(import.meta.env.DEV ? "1234" : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<boolean> {
    setError(null);
    setLoading(true);
    try {
      const user = await fakeLogin(username.trim(), password);
      auth.login(user);
      return true;
    } catch (e: any) {
      setError(e?.message ?? "Error");
      return false;
    } finally {
      setLoading(false);
    }
  }

  return {
    username,
    setUsername,
    password,
    setPassword,
    loading,
    error,
    submit,
  };
}
