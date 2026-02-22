import { useState } from "react";
import { fakeLogin } from "../service/auth.fake";
import { useAuth } from "../../../app/provider/useAuth";
import { markCashSessionClosed } from "../../cash/service/cash.session";

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
      markCashSessionClosed(user.username);
      auth.login(user);
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Error";
      setError(message);
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

