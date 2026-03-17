import { useEffect, useMemo, useState, type FormEvent } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import { formatDateTimeAR as formatDateTime } from "../../../shared/format/locale";
import { normalizeForSearch } from "../../../shared/search/search";
import type { FeedbackEntry, FeedbackType } from "../model/feedback.types";
import { createFeedbackApi, fetchFeedbackApi } from "../service/feedback.api";
import styles from "./FeedbackScreen.module.css";

type AdminTab = "create" | "list";

function feedbackTypeLabel(value: FeedbackType) {
  return value === "claim" ? "Reclamo" : "Sugerencia";
}

export default function FeedbackScreen() {
  const auth = useAuth();
  const isAdmin = auth.user?.role === "admin";
  const username = auth.user?.username || "operator";
  const role = isAdmin ? "admin" : "operator";

  const [activeTab, setActiveTab] = useState<AdminTab>("create");
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(isAdmin);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [type, setType] = useState<FeedbackType>("suggestion");
  const [message, setMessage] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | FeedbackType>("all");

  useEffect(() => {
    if (!isAdmin) return;

    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const list = await fetchFeedbackApi();
        if (!alive) return;
        setEntries(list);
      } catch {
        if (!alive) return;
        setError("No se pudo cargar el libro de sugerencias y reclamos.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isAdmin]);

  const visibleEntries = useMemo(() => {
    const query = normalizeForSearch(search);

    return [...entries]
      .filter((item) => {
        if (typeFilter !== "all" && item.type !== typeFilter) return false;
        if (!query) return true;

        const visibleAuthor = item.isAnonymous ? "anonimo" : item.createdBy;
        return normalizeForSearch(
          `${item.message} ${item.createdBy} ${visibleAuthor} ${feedbackTypeLabel(item.type)} ${item.createdByRole}`,
        ).includes(query);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [entries, search, typeFilter]);

  const anonymousCount = useMemo(() => entries.filter((item) => item.isAnonymous).length, [entries]);
  const claimCount = useMemo(() => entries.filter((item) => item.type === "claim").length, [entries]);
  const suggestionCount = useMemo(() => entries.filter((item) => item.type === "suggestion").length, [entries]);

  async function submitEntry(event: FormEvent) {
    event.preventDefault();
    const trimmedMessage = message.trim();

    setError("");
    setSuccess("");

    if (!trimmedMessage) {
      setError("Escribe el comentario antes de registrarlo.");
      return;
    }

    try {
      const created = await createFeedbackApi({
        type,
        message: trimmedMessage,
        isAnonymous,
        createdBy: username,
        createdByRole: role,
      });

      if (isAdmin) {
        setEntries((current) => [created, ...current]);
      }

      setType("suggestion");
      setMessage("");
      setIsAnonymous(false);
      setSuccess(isAdmin ? "Entrada registrada en el libro." : "Comentario enviado correctamente.");
      if (isAdmin) setActiveTab("list");
    } catch {
      setError("No se pudo guardar la entrada.");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Sugerencias y reclamos" }]} asTitle />
            <p className={styles.subtitle}>
              {isAdmin
                ? "Registra entradas y revisa el historial completo del libro."
                : "Deja sugerencias o reclamos operativos. Puedes enviarlos de forma anonima."}
            </p>
          </div>
          <SessionStatusBar />
        </header>

        {isAdmin ? (
          <>
            <section className={styles.summaryGrid}>
              <article className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Total registrados</span>
                <strong className={styles.summaryValue}>{entries.length}</strong>
              </article>
              <article className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Sugerencias</span>
                <strong className={styles.summaryValue}>{suggestionCount}</strong>
              </article>
              <article className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Reclamos</span>
                <strong className={styles.summaryValue}>{claimCount}</strong>
              </article>
              <article className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Anonimos</span>
                <strong className={styles.summaryValue}>{anonymousCount}</strong>
              </article>
            </section>

            <section className={styles.tabs}>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === "create" ? styles.tabBtnActive : ""}`.trim()}
                onClick={() => setActiveTab("create")}
              >
                Registrar entrada
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === "list" ? styles.tabBtnActive : ""}`.trim()}
                onClick={() => setActiveTab("list")}
              >
                Listado
              </button>
            </section>
          </>
        ) : null}

        {!isAdmin || activeTab === "create" ? (
          <section className={styles.formCard}>
            <h2 className={styles.cardTitle}>{isAdmin ? "Nueva entrada" : "Registrar comentario"}</h2>

            <form className={styles.form} onSubmit={submitEntry}>
              <label className={styles.field}>
                <span>Tipo</span>
                <select className={styles.input} value={type} onChange={(event) => setType(event.target.value as FeedbackType)}>
                  <option value="suggestion">Sugerencia</option>
                  <option value="claim">Reclamo</option>
                </select>
              </label>

              <label className={styles.field}>
                <span>Comentario</span>
                <textarea
                  className={styles.textarea}
                  rows={8}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Describe la sugerencia o el reclamo con el mayor contexto posible."
                />
              </label>

              <label className={styles.checkboxRow}>
                <input type="checkbox" checked={isAnonymous} onChange={(event) => setIsAnonymous(event.target.checked)} />
                <span>Enviar como anonimo</span>
              </label>

              <p className={styles.note}>
                Si marcas anonimo, el listado mostrara la entrada sin nombre de usuario. El tipo, la fecha y el perfil que la
                registro seguiran visibles.
              </p>

              {error ? <div className={styles.errorBox}>{error}</div> : null}
              {success ? <div className={styles.successBox}>{success}</div> : null}

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => {
                    setType("suggestion");
                    setMessage("");
                    setIsAnonymous(false);
                    setError("");
                    setSuccess("");
                  }}
                >
                  Limpiar
                </button>
                <button type="submit" className={styles.primaryBtn}>
                  Guardar entrada
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {isAdmin && activeTab === "list" ? (
          <section className={styles.listCard}>
            <div className={styles.listHeader}>
              <h2 className={styles.cardTitle}>Listado</h2>
              <div className={styles.filters}>
                <input
                  className={styles.input}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por comentario, autor visible o perfil"
                />
                <select
                  className={styles.input}
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value as "all" | FeedbackType)}
                >
                  <option value="all">Todos los tipos</option>
                  <option value="suggestion">Sugerencias</option>
                  <option value="claim">Reclamos</option>
                </select>
              </div>
            </div>

            {loading ? (
              <p className={styles.empty}>Cargando entradas...</p>
            ) : error ? (
              <p className={styles.empty}>{error}</p>
            ) : visibleEntries.length === 0 ? (
              <p className={styles.empty}>No hay entradas para mostrar.</p>
            ) : (
              <div className={styles.entryList}>
                {visibleEntries.map((item) => (
                  <article key={item.id} className={styles.entryCard}>
                    <div className={styles.entryTop}>
                      <div className={styles.badgeRow}>
                        <span className={item.type === "claim" ? styles.badgeClaim : styles.badgeSuggestion}>
                          {feedbackTypeLabel(item.type)}
                        </span>
                        <span className={item.isAnonymous ? styles.badgeAnonymous : styles.badgeNamed}>
                          {item.isAnonymous ? "Anonimo" : "Nominal"}
                        </span>
                      </div>
                      <span className={styles.entryDate}>{formatDateTime(item.createdAt)}</span>
                    </div>

                    <p className={styles.entryMessage}>{item.message}</p>

                    <div className={styles.metaGrid}>
                      <p className={styles.metaItem}>
                        <strong>Autor visible:</strong> {item.isAnonymous ? "Anonimo" : item.createdBy}
                      </p>
                      <p className={styles.metaItem}>
                        <strong>Perfil:</strong> {item.createdByRole === "admin" ? "Administrativo" : "Operador"}
                      </p>
                      <p className={styles.metaItem}>
                        <strong>ID:</strong> {item.id}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
