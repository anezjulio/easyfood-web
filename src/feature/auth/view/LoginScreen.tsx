import { useNavigate, useLocation } from "react-router-dom";
import { useLoginViewModel } from "../viewmodel/useLoginViewModel";
import styles from "./LoginScreen.module.css";

export default function LoginScreen() {
  const vm = useLoginViewModel();
  const nav = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || "/operation";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await vm.submit();
    if (ok) nav(from, { replace: true });
  }

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Iniciar sesión</h1>

        <label className={styles.label}>
          Usuario
          <input
            value={vm.username}
            onChange={(e) => vm.setUsername(e.target.value)}
            className={styles.input}
            autoComplete="username"
          />
        </label>

        <label className={styles.label}>
          Contraseña
          <input
            value={vm.password}
            onChange={(e) => vm.setPassword(e.target.value)}
            className={styles.input}
            type="password"
            autoComplete="current-password"
          />
        </label>

        {vm.error ? <div className={styles.error}>{vm.error}</div> : null}

        <button
          type="submit"
          disabled={vm.loading}
          className={`${styles.submitButton} ${vm.loading ? styles.submitButtonLoading : ""}`}
        >
          {vm.loading ? "Ingresando..." : "Entrar"}
        </button>
      </form>
      <p className={styles.poweredBy}>powered by easyfood</p>
    </div>
  );
}
