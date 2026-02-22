import { useEffect, useMemo, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import { useAuth } from "../../../app/provider/useAuth";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { md5 } from "../../../shared/crypto/md5";
import { formatDateTimeAR as formatDateTime } from "../../../shared/format/locale";
import { normalizeForSearch } from "../../../shared/search/search";
import type { AppUserRecord } from "../model/user.types";
import { createUserApi, deleteUserApi, fetchUsersApi, updateUserApi } from "../service/user.api";
import styles from "./UsersScreen.module.css";

type UserSortKey = "name" | "email" | "username" | "createdAt" | "updatedAt" | "startHour" | "endHour";

export default function UsersScreen() {
  const auth = useAuth();
  const [users, setUsers] = useState<AppUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [startHour, setStartHour] = useState("08:00");
  const [endHour, setEndHour] = useState("17:00");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [nameFilter, setNameFilter] = useState("");
  const [emailFilter, setEmailFilter] = useState("");
  const [usernameFilter, setUsernameFilter] = useState("");
  const [startHourFilter, setStartHourFilter] = useState("");
  const [endHourFilter, setEndHourFilter] = useState("");
  const [createdAtFilter, setCreatedAtFilter] = useState("");
  const [updatedAtFilter, setUpdatedAtFilter] = useState("");
  const [sortKey, setSortKey] = useState<UserSortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [hasUserSorted, setHasUserSorted] = useState(false);

  function applyUserForm(user: AppUserRecord | null) {
    if (!user) {
      setName("");
      setEmail("");
      setUsername("");
      setPassword("");
      setStartHour("08:00");
      setEndHour("17:00");
      return;
    }

    setName(user.name);
    setEmail(user.email);
    setUsername(user.username);
    setPassword("");
    setStartHour(user.startHour);
    setEndHour(user.endHour);
  }

  async function reloadUsers(nextSelectedId?: string | null) {
    setLoading(true);
    const list = await fetchUsersApi();
    setUsers(list);
    setLoading(false);
    if (typeof nextSelectedId !== "undefined") {
      setSelectedUserId(nextSelectedId);
      const selected = list.find((item) => item.id === nextSelectedId) || null;
      applyUserForm(selected);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await fetchUsersApi();
        if (!alive) return;
        setUsers(list);
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const selectedUser = useMemo(
    () => users.find((item) => item.id === selectedUserId) || null,
    [users, selectedUserId],
  );

  const filteredUsers = useMemo(() => {
    const n = normalizeForSearch(nameFilter);
    const e = normalizeForSearch(emailFilter);
    const u = normalizeForSearch(usernameFilter);
    const sh = normalizeForSearch(startHourFilter);
    const eh = normalizeForSearch(endHourFilter);
    let list = users;
    if (n) list = list.filter((item) => normalizeForSearch(item.name).includes(n));
    if (e) list = list.filter((item) => normalizeForSearch(item.email).includes(e));
    if (u) list = list.filter((item) => normalizeForSearch(item.username).includes(u));
    if (sh) list = list.filter((item) => normalizeForSearch(item.startHour).includes(sh));
    if (eh) list = list.filter((item) => normalizeForSearch(item.endHour).includes(eh));
    if (createdAtFilter) list = list.filter((item) => item.createdAt.slice(0, 10) === createdAtFilter);
    if (updatedAtFilter) list = list.filter((item) => item.updatedAt.slice(0, 10) === updatedAtFilter);

    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      if (sortKey === "email") return a.email.localeCompare(b.email) * dir;
      if (sortKey === "username") return a.username.localeCompare(b.username) * dir;
      if (sortKey === "updatedAt") return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * dir;
      if (sortKey === "startHour") return a.startHour.localeCompare(b.startHour) * dir;
      if (sortKey === "endHour") return a.endHour.localeCompare(b.endHour) * dir;
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
    });
  }, [users, nameFilter, emailFilter, usernameFilter, startHourFilter, endHourFilter, createdAtFilter, updatedAtFilter, sortKey, sortDir]);

  function handleSortChange(nextKey: UserSortKey) {
    setHasUserSorted(true);
    if (sortKey === nextKey) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir("asc");
  }

  function clearSort() {
    setSortKey("createdAt");
    setSortDir("desc");
    setHasUserSorted(false);
  }

  function clearForm() {
    setSelectedUserId(null);
    applyUserForm(null);
    setError("");
    setMessage("");
  }

  function selectUserForEdit(userId: string) {
    const selected = users.find((item) => item.id === userId) || null;
    setSelectedUserId(selected ? selected.id : null);
    applyUserForm(selected);
  }

  async function submitForm(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedUsername = username.trim();

    if (!trimmedName) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Ingresa un correo valido.");
      return;
    }
    if (!trimmedUsername) {
      setError("El usuario es obligatorio.");
      return;
    }
    if (!selectedUser && (!password || password.length < 4)) {
      setError("La clave debe tener al menos 4 caracteres.");
      return;
    }
    if (selectedUser && password && password.length < 4) {
      setError("Si ingresas nueva clave, debe tener al menos 4 caracteres.");
      return;
    }
    if (!startHour || !endHour) {
      setError("Ingresa hora de entrada y cierre.");
      return;
    }

    try {
      if (selectedUser) {
        const updated = await updateUserApi(selectedUser.id, {
          name: trimmedName,
          email: trimmedEmail,
          username: trimmedUsername,
          password: password ? md5(password) : undefined,
          startHour,
          endHour,
        });
        await reloadUsers(updated.id);
        setMessage("Usuario modificado correctamente.");
      } else {
        const created = await createUserApi({
          name: trimmedName,
          email: trimmedEmail,
          username: trimmedUsername,
          password: md5(password),
          startHour,
          endHour,
        });
        await reloadUsers(created.id);
        setMessage("Usuario creado correctamente.");
      }
      setPassword("");
    } catch {
      setError(selectedUser ? "No se pudo modificar el usuario." : "No se pudo crear el usuario.");
    }
  }

  async function removeSelectedUser() {
    if (!selectedUser) return;
    const confirmed = window.confirm(`Eliminar usuario ${selectedUser.username}?`);
    if (!confirmed) return;
    setError("");
    setMessage("");
    try {
      await deleteUserApi(selectedUser.id);
      await reloadUsers(null);
      clearForm();
      setMessage("Usuario eliminado correctamente.");
    } catch {
      setError("No se pudo eliminar el usuario.");
    }
  }

  if (auth.user?.role !== "admin") {
    return (
      <div className={styles.page}>
        <div className={styles.content}>
          <header className={styles.header}>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Usuarios" }]} asTitle />
            <SessionStatusBar />
          </header>
          <p className={styles.empty}>No tienes permisos para gestionar usuarios.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Usuarios" }]} asTitle />
            <p className={styles.subtitle}>Alta de usuarios y listado con filtros.</p>
          </div>
          <SessionStatusBar />
        </header>

        <div className={styles.layout}>
          <section className={styles.formCard}>
            <h2 className={styles.formTitle}>Nuevo usuario</h2>
            <form onSubmit={submitForm} className={styles.form}>
              <label className={styles.field}>
                <span>Nombre</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className={styles.input} />
              </label>
              <label className={styles.field}>
                <span>Correo</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} className={styles.input} type="email" />
              </label>
              <label className={styles.field}>
                <span>Usuario</span>
                <input value={username} onChange={(e) => setUsername(e.target.value)} className={styles.input} />
              </label>
              <label className={styles.field}>
                <span>{selectedUser ? "Cambiar contrasena" : "Contrasena"}</span>
                <input value={password} onChange={(e) => setPassword(e.target.value)} className={styles.input} type="password" />
              </label>
              <label className={styles.field}>
                <span>Hora entrada</span>
                <input value={startHour} onChange={(e) => setStartHour(e.target.value)} className={styles.input} type="time" />
              </label>
              <label className={styles.field}>
                <span>Hora cierre</span>
                <input value={endHour} onChange={(e) => setEndHour(e.target.value)} className={styles.input} type="time" />
              </label>

              {error ? <div className={styles.errorBox}>{error}</div> : null}
              {message ? <div className={styles.successBox}>{message}</div> : null}

              <div className={styles.formActions}>
                <button type="button" className={styles.secondaryBtn} onClick={clearForm}>
                  {selectedUser ? "+ Nuevo usuario" : "Limpiar"}
                </button>
                {selectedUser ? (
                  <button type="button" className={styles.warnBtn} onClick={removeSelectedUser}>
                    Eliminar
                  </button>
                ) : null}
                <button type="submit" className={styles.primaryBtn}>{selectedUser ? "Modificar" : "Crear"}</button>
              </div>
            </form>
          </section>

          <section className={styles.tableCard}>
            <div className={styles.tableHead}>
              <div className={styles.headerCol}>
                <SortCell label="Nombre" active={hasUserSorted && sortKey === "name"} onSort={() => handleSortChange("name")} onClear={clearSort} />
                <Filter value={nameFilter} onChange={setNameFilter} />
              </div>
              <div className={styles.headerCol}>
                <SortCell label="Correo" active={hasUserSorted && sortKey === "email"} onSort={() => handleSortChange("email")} onClear={clearSort} />
                <Filter value={emailFilter} onChange={setEmailFilter} />
              </div>
              <div className={styles.headerCol}>
                <SortCell label="Usuario" active={hasUserSorted && sortKey === "username"} onSort={() => handleSortChange("username")} onClear={clearSort} />
                <Filter value={usernameFilter} onChange={setUsernameFilter} />
              </div>
              <div className={styles.headerCol}>
                <SortCell label="Entrada" active={hasUserSorted && sortKey === "startHour"} onSort={() => handleSortChange("startHour")} onClear={clearSort} />
                <Filter value={startHourFilter} onChange={setStartHourFilter} />
              </div>
              <div className={styles.headerCol}>
                <SortCell label="Cierre" active={hasUserSorted && sortKey === "endHour"} onSort={() => handleSortChange("endHour")} onClear={clearSort} />
                <Filter value={endHourFilter} onChange={setEndHourFilter} />
              </div>
              <div className={styles.headerCol}>
                <SortCell label="Creacion" active={hasUserSorted && sortKey === "createdAt"} onSort={() => handleSortChange("createdAt")} onClear={clearSort} />
                <DateFilter value={createdAtFilter} onChange={setCreatedAtFilter} />
              </div>
              <div className={styles.headerCol}>
                <SortCell label="Modificacion" active={hasUserSorted && sortKey === "updatedAt"} onSort={() => handleSortChange("updatedAt")} onClear={clearSort} />
                <DateFilter value={updatedAtFilter} onChange={setUpdatedAtFilter} />
              </div>
            </div>

            {loading ? (
              <p className={styles.empty}>Cargando...</p>
            ) : filteredUsers.length === 0 ? (
              <p className={styles.empty}>No hay usuarios.</p>
            ) : (
              filteredUsers.map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  className={`${styles.tableRow} ${selectedUserId === item.id ? styles.rowActive : ""} ${index % 2 === 0 ? styles.rowEven : ""}`}
                  onClick={() => selectUserForEdit(item.id)}
                >
                  <div>{item.name}</div>
                  <div>{item.email}</div>
                  <div>{item.username}</div>
                  <div>{item.startHour}</div>
                  <div>{item.endHour}</div>
                  <div>{formatDateTime(item.createdAt)}</div>
                  <div>{formatDateTime(item.updatedAt)}</div>
                </button>
              ))
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function SortCell({
  label,
  active,
  onSort,
  onClear,
}: {
  label: string;
  active: boolean;
  onSort: () => void;
  onClear: () => void;
}) {
  return (
    <div className={styles.sortCell}>
      <button type="button" className={`${styles.sortBtn} ${active ? styles.sortBtnActive : ""}`} onClick={onSort}>
        {label}
      </button>
      {active ? (
        <button type="button" className={styles.clearBtn} onClick={onClear} aria-label={`Quitar orden por ${label}`}>
          x
        </button>
      ) : null}
    </div>
  );
}

function Filter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className={styles.filterWrap}>
      <input className={styles.filterInput} value={value} onChange={(e) => onChange(e.target.value)} />
      {value ? (
        <button type="button" className={styles.clearBtn} onClick={() => onChange("")} aria-label="Limpiar filtro">
          x
        </button>
      ) : null}
    </div>
  );
}

function DateFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className={styles.filterWrap}>
      <input type="date" className={styles.filterInputDate} value={value} onChange={(e) => onChange(e.target.value)} />
      {value ? (
        <button type="button" className={styles.clearBtn} onClick={() => onChange("")} aria-label="Limpiar filtro fecha">
          x
        </button>
      ) : null}
    </div>
  );
}

