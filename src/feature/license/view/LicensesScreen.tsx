import { useEffect, useMemo, useState, type FormEvent } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import { formatDateTimeAR as formatDateTime } from "../../../shared/format/locale";
import { normalizeForSearch } from "../../../shared/search/search";
import type { ProductCategory } from "../../product/model/product.types";
import type { LicenseRecord, LicenseStatus } from "../model/license.types";
import { addLicenseIssuanceApi, createLicenseApi, fetchLicensesApi, updateLicenseApi } from "../service/license.api";
import styles from "./LicensesScreen.module.css";

const categoryOptions: ProductCategory[] = [
  "bebida",
  "vivere",
  "helado",
  "chocolate",
  "tabaqueria",
  "golosina",
  "perecedero",
];

function formatDateOnly(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short" }).format(d);
}

function computeDurationDays(issueDate?: string, expirationDate?: string) {
  if (!issueDate || !expirationDate) return undefined;
  const from = new Date(issueDate).getTime();
  const to = new Date(expirationDate).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return undefined;
  return Math.floor((to - from) / 86_400_000);
}

function formatDuration(durationDays?: number) {
  if (!Number.isFinite(durationDays) || !durationDays || durationDays <= 0) return "Sin duracion";
  const months = Math.floor(durationDays / 30);
  const years = Math.floor(months / 12);
  if (years >= 1) {
    const remMonths = months % 12;
    if (remMonths === 0) return `${years} ${years === 1 ? "ano" : "anos"}`;
    return `${years} ${years === 1 ? "ano" : "anos"} y ${remMonths} ${remMonths === 1 ? "mes" : "meses"}`;
  }
  return `${months || 1} ${(months || 1) === 1 ? "mes" : "meses"}`;
}

function statusLabel(status: LicenseStatus) {
  if (status === "active") return "Activa";
  if (status === "expired") return "Vencida";
  return "Pendiente por renovar";
}

function resolveStatus(item: LicenseRecord): LicenseStatus {
  if (!item.issueDate || !item.expirationDate) return "pending-renewal";
  const expires = new Date(item.expirationDate).getTime();
  if (!Number.isFinite(expires)) return "pending-renewal";
  if (expires < Date.now()) return "expired";
  return "active";
}

export default function LicensesScreen() {
  const auth = useAuth();
  const [licenses, setLicenses] = useState<LicenseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("");
  const [issueDate, setIssueDate] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [sourceAddress, setSourceAddress] = useState("");

  const [issuanceIssueDate, setIssuanceIssueDate] = useState("");
  const [issuanceExpirationDate, setIssuanceExpirationDate] = useState("");
  const [issuanceNotes, setIssuanceNotes] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LicenseStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | ProductCategory>("all");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const list = await fetchLicensesApi();
      setLicenses(list);
    } catch {
      setError("No se pudieron cargar permisos/licencias.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const sortedLicenses = useMemo(
    () => [...licenses].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [licenses],
  );

  const selected = useMemo(
    () => sortedLicenses.find((item) => item.id === selectedId) || null,
    [selectedId, sortedLicenses],
  );

  useEffect(() => {
    if (!selected) {
      setName("");
      setDescription("");
      setCategory("");
      setIssueDate("");
      setExpirationDate("");
      setContactEmail("");
      setContactPhone("");
      setSourceAddress("");
      return;
    }
    setName(selected.name);
    setDescription(selected.description);
    setCategory(selected.category || "");
    setIssueDate(selected.issueDate || "");
    setExpirationDate(selected.expirationDate || "");
    setContactEmail(selected.contactEmail || "");
    setContactPhone(selected.contactPhone || "");
    setSourceAddress(selected.sourceAddress || "");
  }, [selected]);

  const filteredLicenses = useMemo(() => {
    const query = normalizeForSearch(search);
    return sortedLicenses.filter((item) => {
      const itemStatus = resolveStatus(item);
      if (statusFilter !== "all" && itemStatus !== statusFilter) return false;
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (!query) return true;
      const raw = `${item.name} ${item.description} ${item.category || ""} ${item.contactEmail || ""} ${item.sourceAddress || ""}`;
      return normalizeForSearch(raw).includes(query);
    });
  }, [categoryFilter, search, sortedLicenses, statusFilter]);

  const durationDays = useMemo(() => computeDurationDays(issueDate, expirationDate), [expirationDate, issueDate]);

  async function submitLicense(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    if (!trimmedName) {
      setError("Ingresa el nombre del permiso/licencia.");
      return;
    }
    if (!trimmedDescription) {
      setError("Ingresa una descripcion.");
      return;
    }
    if ((issueDate && !expirationDate) || (!issueDate && expirationDate)) {
      setError("Completa ambas fechas o deja ambas vacias.");
      return;
    }
    if (issueDate && expirationDate) {
      const from = new Date(issueDate).getTime();
      const to = new Date(expirationDate).getTime();
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
        setError("La fecha de vencimiento debe ser posterior a expedicion.");
        return;
      }
    }

    const draft = {
      name: trimmedName,
      description: trimmedDescription,
      category: (category || undefined) as ProductCategory | undefined,
      issueDate: issueDate || undefined,
      expirationDate: expirationDate || undefined,
      contactEmail: contactEmail.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
      sourceAddress: sourceAddress.trim() || undefined,
    };

    try {
      if (selected) {
        const updated = await updateLicenseApi(selected.id, draft);
        setLicenses((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setMessage("Permiso/licencia actualizado.");
      } else {
        const created = await createLicenseApi(draft);
        setLicenses((current) => [created, ...current]);
        setSelectedId(created.id);
        setMessage("Permiso/licencia creado.");
      }
    } catch {
      setError("No se pudo guardar el permiso/licencia.");
    }
  }

  async function submitIssuance(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setError("");
    setMessage("");

    if (!issuanceIssueDate || !issuanceExpirationDate) {
      setError("Completa expedicion y vencimiento para registrar el alta.");
      return;
    }
    const from = new Date(issuanceIssueDate).getTime();
    const to = new Date(issuanceExpirationDate).getTime();
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
      setError("La fecha de vencimiento del alta debe ser posterior.");
      return;
    }

    try {
      const updated = await addLicenseIssuanceApi(selected.id, {
        issuedAt: issuanceIssueDate,
        expiresAt: issuanceExpirationDate,
        notes: issuanceNotes.trim() || undefined,
      });
      setLicenses((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setIssuanceIssueDate("");
      setIssuanceExpirationDate("");
      setIssuanceNotes("");
      setMessage("Alta/expedicion registrada.");
    } catch {
      setError("No se pudo registrar la alta.");
    }
  }

  function clearForm() {
    setSelectedId(null);
    setError("");
    setMessage("");
  }

  if (auth.user?.role !== "admin") {
    return (
      <div className={styles.page}>
        <div className={styles.content}>
          <header className={styles.header}>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Permisos/Licencias" }]} asTitle />
            <SessionStatusBar />
          </header>
          <p className={styles.empty}>No tienes permisos para gestionar permisos/licencias.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Permisos/Licencias" }]} asTitle />
            <p className={styles.subtitle}>Control de permisos para categorias de productos y renovaciones.</p>
          </div>
          <SessionStatusBar />
        </header>

        <div className={styles.layout}>
          <section className={styles.listCard}>
            <div className={styles.filters}>
              <input
                className={styles.input}
                placeholder="Buscar por nombre, descripcion, categoria o direccion"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                className={styles.select}
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "all" | LicenseStatus)}
              >
                <option value="all">Todos los estados</option>
                <option value="active">Activas</option>
                <option value="pending-renewal">Pendientes por renovar</option>
                <option value="expired">Vencidas</option>
              </select>
              <select
                className={styles.select}
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value as "all" | ProductCategory)}
              >
                <option value="all">Todas las categorias</option>
                {categoryOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            {loading ? (
              <p className={styles.empty}>Cargando...</p>
            ) : filteredLicenses.length === 0 ? (
              <p className={styles.empty}>No hay permisos/licencias.</p>
            ) : (
              <div className={styles.list}>
                {filteredLicenses.map((item) => {
                  const resolvedStatus = resolveStatus(item);
                  const itemDuration = item.durationDays || computeDurationDays(item.issueDate, item.expirationDate);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`${styles.itemBtn} ${selectedId === item.id ? styles.itemBtnActive : ""}`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <div className={styles.itemTop}>
                        <strong>{item.name}</strong>
                        <span
                          className={`${styles.statusTag} ${
                            resolvedStatus === "active"
                              ? styles.statusGreen
                              : resolvedStatus === "expired"
                                ? styles.statusRed
                                : styles.statusAmber
                          }`}
                        >
                          {statusLabel(resolvedStatus)}
                        </span>
                      </div>
                      <p className={styles.description}>{item.description}</p>
                      <p className={styles.meta}>
                        Categoria: {item.category || "-"} | Duracion: {formatDuration(itemDuration)}
                      </p>
                      <p className={styles.meta}>
                        Expedicion: {formatDateOnly(item.issueDate)} | Vencimiento: {formatDateOnly(item.expirationDate)}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className={styles.formCard}>
            <h2 className={styles.title}>{selected ? "Editar permiso/licencia" : "Nuevo permiso/licencia"}</h2>

            <form className={styles.form} onSubmit={submitLicense}>
              <label className={styles.field}>
                <span>Nombre</span>
                <input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Descripcion</span>
                <textarea
                  className={styles.textarea}
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Categoria de producto (opcional)</span>
                <select className={styles.select} value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="">Sin categoria</option>
                  {categoryOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.gridTwo}>
                <label className={styles.field}>
                  <span>Fecha expedicion</span>
                  <input className={styles.input} type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
                </label>
                <label className={styles.field}>
                  <span>Fecha vencimiento</span>
                  <input
                    className={styles.input}
                    type="date"
                    value={expirationDate}
                    onChange={(event) => setExpirationDate(event.target.value)}
                  />
                </label>
              </div>
              <p className={styles.metaStrong}>Duracion calculada: {formatDuration(durationDays)}</p>

              <div className={styles.gridTwo}>
                <label className={styles.field}>
                  <span>Correo (opcional)</span>
                  <input
                    className={styles.input}
                    type="email"
                    value={contactEmail}
                    onChange={(event) => setContactEmail(event.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span>Telefono (opcional)</span>
                  <input className={styles.input} value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
                </label>
              </div>

              <label className={styles.field}>
                <span>Direccion / sitio de gestion</span>
                <input className={styles.input} value={sourceAddress} onChange={(event) => setSourceAddress(event.target.value)} />
              </label>

              {error ? <p className={styles.error}>{error}</p> : null}
              {message ? <p className={styles.success}>{message}</p> : null}

              <div className={styles.actions}>
                <button type="button" className={styles.secondaryBtn} onClick={clearForm}>
                  {selected ? "Nuevo" : "Limpiar"}
                </button>
                <button type="submit" className={styles.primaryBtn}>
                  {selected ? "Guardar cambios" : "Crear"}
                </button>
              </div>
            </form>

            {selected ? (
              <div className={styles.issuanceCard}>
                <h3 className={styles.subtitleH3}>Altas / expediciones</h3>
                <p className={styles.meta}>Ultima actualizacion: {formatDateTime(selected.updatedAt)}</p>
                <form className={styles.form} onSubmit={submitIssuance}>
                  <div className={styles.gridTwo}>
                    <label className={styles.field}>
                      <span>Expedicion</span>
                      <input
                        className={styles.input}
                        type="date"
                        value={issuanceIssueDate}
                        onChange={(event) => setIssuanceIssueDate(event.target.value)}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Vencimiento</span>
                      <input
                        className={styles.input}
                        type="date"
                        value={issuanceExpirationDate}
                        onChange={(event) => setIssuanceExpirationDate(event.target.value)}
                      />
                    </label>
                  </div>
                  <label className={styles.field}>
                    <span>Notas (opcional)</span>
                    <textarea
                      className={styles.textarea}
                      rows={2}
                      value={issuanceNotes}
                      onChange={(event) => setIssuanceNotes(event.target.value)}
                    />
                  </label>
                  <button type="submit" className={styles.primaryBtn}>
                    Registrar alta
                  </button>
                </form>

                <div className={styles.list}>
                  {selected.issuances.length === 0 ? (
                    <p className={styles.empty}>Sin altas registradas.</p>
                  ) : (
                    selected.issuances.map((item) => (
                      <article key={item.id} className={styles.issuanceItem}>
                        <p className={styles.meta}>
                          Expedicion: {formatDateOnly(item.issuedAt)} | Vencimiento: {formatDateOnly(item.expiresAt)}
                        </p>
                        {item.notes ? <p className={styles.description}>{item.notes}</p> : null}
                        <p className={styles.meta}>Registrado: {formatDateTime(item.createdAt)}</p>
                      </article>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

