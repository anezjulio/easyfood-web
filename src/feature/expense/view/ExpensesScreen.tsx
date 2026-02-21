import type React from "react";
import { useEffect, useMemo, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/AuthProvider";
import { resolveImageUrl, uploadImageFromFile } from "../../../shared/image/image.service";
import type { Expense, ExpenseType } from "../model/expense.types";
import { createExpenseApi, fetchExpensesApi } from "../service/expense.api";
import styles from "./ExpensesScreen.module.css";

function normalize(text: string) {
  return (text || "").toLowerCase().trim();
}

function formatDateTime(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

function formatMoneyMask(value: number) {
  const amount = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  const grouped = String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$ ${grouped}`;
}

function formatMoneyMaskFromDigits(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return "";
  return `$ ${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

function expenseTypeLabel(value: ExpenseType) {
  return value === "recurrent" ? "Recurrente / programado" : "Imprevisto";
}

export default function ExpensesScreen() {
  const auth = useAuth();
  const currentUsername = normalize(auth.user?.username || "");
  const isAdmin = auth.user?.role === "admin";

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const [expenseType, setExpenseType] = useState<ExpenseType>("unexpected");
  const [description, setDescription] = useState("");
  const [amountDigits, setAmountDigits] = useState("");
  const [invoiceImageUrl, setInvoiceImageUrl] = useState("");
  const [unexpectedImageUrl, setUnexpectedImageUrl] = useState("");
  const [isUploadingInvoice, setIsUploadingInvoice] = useState(false);
  const [isUploadingUnexpected, setIsUploadingUnexpected] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [previewImageTitle, setPreviewImageTitle] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ExpenseType>("all");
  const [search, setSearch] = useState("");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const list = await fetchExpensesApi();
        if (!alive) return;
        setExpenses(list);
      } catch {
        if (!alive) return;
        setError("No se pudieron cargar los gastos.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const visibleExpenses = useMemo(() => {
    const query = normalize(search);
    let list = expenses;
    if (!isAdmin) {
      list = list.filter((item) => normalize(item.createdBy) === currentUsername);
    }
    if (typeFilter !== "all") {
      list = list.filter((item) => item.expenseType === typeFilter);
    }
    if (query) {
      list = list.filter((item) => normalize(`${item.description} ${item.createdBy}`).includes(query));
    }
    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [currentUsername, expenses, isAdmin, search, typeFilter]);

  const totalVisible = useMemo(
    () => visibleExpenses.reduce((acc, item) => acc + Math.max(0, Math.trunc(item.amount)), 0),
    [visibleExpenses],
  );

  function clearForm() {
    setExpenseType("unexpected");
    setDescription("");
    setAmountDigits("");
    setInvoiceImageUrl("");
    setUnexpectedImageUrl("");
    setPreviewImageUrl("");
    setPreviewImageTitle("");
    setError("");
    setMessage("");
  }

  async function handleInvoiceImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("La factura debe ser una imagen.");
      return;
    }

    setError("");
    setMessage("");
    setIsUploadingInvoice(true);
    try {
      const uploadedPath = await uploadImageFromFile(file);
      setInvoiceImageUrl(uploadedPath);
      setMessage("Foto de factura cargada.");
    } catch {
      setError("No se pudo cargar la foto de factura.");
    } finally {
      setIsUploadingInvoice(false);
    }
  }

  async function handleUnexpectedImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("La foto del imprevisto debe ser una imagen.");
      return;
    }

    setError("");
    setMessage("");
    setIsUploadingUnexpected(true);
    try {
      const uploadedPath = await uploadImageFromFile(file);
      setUnexpectedImageUrl(uploadedPath);
      setMessage("Foto del imprevisto cargada.");
    } catch {
      setError("No se pudo cargar la foto del imprevisto.");
    } finally {
      setIsUploadingUnexpected(false);
    }
  }

  function openImagePreview(imageUrl: string, title: string) {
    if (!imageUrl) return;
    setPreviewImageUrl(imageUrl);
    setPreviewImageTitle(title);
  }

  function closeImagePreview() {
    setPreviewImageUrl("");
    setPreviewImageTitle("");
  }

  async function submitExpense(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    const trimmedDescription = description.trim();
    const parsedAmount = Math.trunc(Number(amountDigits));

    if (!trimmedDescription) {
      setError("Ingresa el motivo o descripcion del gasto.");
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Ingresa un monto valido.");
      return;
    }
    if (isUploadingInvoice || isUploadingUnexpected) {
      setError("Espera a que termine la carga de imagen.");
      return;
    }

    try {
      const created = await createExpenseApi({
        expenseType,
        description: trimmedDescription,
        amount: parsedAmount,
        invoiceImageUrl,
        unexpectedImageUrl: expenseType === "unexpected" ? unexpectedImageUrl || undefined : undefined,
        createdBy: auth.user?.username || "operator",
      });
      setExpenses((current) => [created, ...current]);
      setMessage("Gasto registrado correctamente.");
      setDescription("");
      setAmountDigits("");
      setExpenseType("unexpected");
      setInvoiceImageUrl("");
      setUnexpectedImageUrl("");
    } catch {
      setError("No se pudo registrar el gasto.");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Gastos" }]} asTitle />
            <p className={styles.subtitle}>
              Registra gastos recurrentes o imprevistos con libertad en motivo y monto.
            </p>
          </div>
          <SessionStatusBar />
        </header>

        <section className={styles.summary}>
          <p className={styles.summaryTotal}>
            <strong>Total gastos visibles:</strong> <span className={styles.summaryTotalAmount}>{formatMoneyMask(totalVisible)}</span>
          </p>
          <p><strong>Registros:</strong> {visibleExpenses.length}</p>
          <p><strong>Vista:</strong> {isAdmin ? "Todos los usuarios" : "Solo tus gastos"}</p>
        </section>

        <div className={styles.layout}>
          <section className={styles.formCard}>
            <h2 className={styles.cardTitle}>Nuevo gasto</h2>
            <form className={styles.form} onSubmit={submitExpense}>
              <div className={styles.typeButtons}>
                <button
                  type="button"
                  className={`${styles.typeBtn} ${expenseType === "recurrent" ? styles.typeBtnActive : ""}`}
                  onClick={() => {
                    setExpenseType("recurrent");
                    setUnexpectedImageUrl("");
                  }}
                >
                  Recurrente / programado
                </button>
                <button
                  type="button"
                  className={`${styles.typeBtn} ${expenseType === "unexpected" ? styles.typeBtnActive : ""}`}
                  onClick={() => setExpenseType("unexpected")}
                >
                  Imprevisto
                </button>
              </div>

              <label className={styles.field}>
                <span>Motivo o descripcion</span>
                <textarea
                  className={styles.textarea}
                  rows={8}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Ej: fumigacion mensual, reparacion de aire, electricista, pago de servicio urgente"
                />
              </label>

              <label className={styles.field}>
                <span>Monto gastado</span>
                <input
                  className={styles.input}
                  type="text"
                  inputMode="numeric"
                  value={formatMoneyMaskFromDigits(amountDigits)}
                  onChange={(event) => {
                    setAmountDigits(event.target.value.replace(/\D/g, ""));
                    setError("");
                    setMessage("");
                  }}
                  placeholder="$ 0"
                />
              </label>

              <div className={styles.field}>
                <span>Foto de factura (opcional)</span>
                <label className={styles.uploadBtn} aria-disabled={isUploadingInvoice}>
                  {isUploadingInvoice ? "Subiendo..." : "Seleccionar imagen"}
                  <input
                    type="file"
                    accept="image/*"
                    className={styles.hiddenFileInput}
                    onChange={handleInvoiceImageChange}
                    disabled={isUploadingInvoice}
                  />
                </label>
                {invoiceImageUrl ? (
                  <button
                    type="button"
                    className={styles.imagePreviewBtn}
                    onClick={() => openImagePreview(invoiceImageUrl, "Factura del gasto")}
                  >
                    <img
                      className={styles.imageThumb}
                      src={resolveImageUrl(invoiceImageUrl)}
                      alt="Vista previa de factura"
                    />
                  </button>
                ) : null}
              </div>

              {expenseType === "unexpected" ? (
                <div className={styles.field}>
                  <span>Foto del imprevisto (opcional)</span>
                  <label className={styles.uploadBtn} aria-disabled={isUploadingUnexpected}>
                    {isUploadingUnexpected ? "Subiendo..." : "Seleccionar imagen"}
                    <input
                      type="file"
                      accept="image/*"
                      className={styles.hiddenFileInput}
                      onChange={handleUnexpectedImageChange}
                      disabled={isUploadingUnexpected}
                    />
                  </label>
                  {unexpectedImageUrl ? (
                    <div className={styles.optionalImageActions}>
                      <button
                        type="button"
                        className={styles.imagePreviewBtn}
                        onClick={() => openImagePreview(unexpectedImageUrl, "Imprevisto reportado")}
                      >
                        <img
                          className={styles.imageThumb}
                          src={resolveImageUrl(unexpectedImageUrl)}
                          alt="Vista previa de imprevisto"
                        />
                      </button>
                      <button
                        type="button"
                        className={styles.removeImageBtn}
                        onClick={() => setUnexpectedImageUrl("")}
                      >
                        Quitar foto
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {error ? <div className={styles.errorBox}>{error}</div> : null}
              {message ? <div className={styles.successBox}>{message}</div> : null}

              <div className={styles.actions}>
                <button type="button" className={styles.secondaryBtn} onClick={clearForm}>
                  Limpiar
                </button>
                <button type="submit" className={styles.primaryBtn}>
                  Registrar gasto
                </button>
              </div>
            </form>
          </section>

          <section className={styles.listCard}>
            <h2 className={styles.cardTitle}>Historial de gastos</h2>

            <div className={styles.filters}>
              <input
                className={styles.searchInput}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por motivo o usuario"
              />
              <select
                className={styles.typeSelect}
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as "all" | ExpenseType)}
              >
                <option value="all">Todos</option>
                <option value="recurrent">Recurrente / programado</option>
                <option value="unexpected">Imprevisto</option>
              </select>
            </div>

            {loading ? (
              <p className={styles.empty}>Cargando gastos...</p>
            ) : visibleExpenses.length === 0 ? (
              <p className={styles.empty}>No hay gastos para mostrar.</p>
            ) : (
              <div className={styles.expenseList}>
                {visibleExpenses.map((item) => (
                  <article key={item.id} className={styles.expenseCard}>
                    <div className={styles.expenseTop}>
                      <span className={item.expenseType === "recurrent" ? styles.badgeRecurrent : styles.badgeUnexpected}>
                        {expenseTypeLabel(item.expenseType)}
                      </span>
                      <strong className={styles.amount}>{formatMoneyMask(item.amount)}</strong>
                    </div>
                    <p className={styles.description}>{item.description}</p>
                    <div className={styles.cardImageRow}>
                      {item.invoiceImageUrl ? (
                        <button
                          type="button"
                          className={styles.cardImageBtn}
                          onClick={() => openImagePreview(item.invoiceImageUrl || "", "Factura del gasto")}
                        >
                          Factura
                        </button>
                      ) : null}
                      {item.unexpectedImageUrl ? (
                        <button
                          type="button"
                          className={styles.cardImageBtn}
                          onClick={() => openImagePreview(item.unexpectedImageUrl || "", "Imprevisto reportado")}
                        >
                          Imprevisto
                        </button>
                      ) : null}
                    </div>
                    <p className={styles.meta}>
                      Cargado por <strong>{item.createdBy}</strong> el {formatDateTime(item.createdAt)}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {previewImageUrl ? (
        <div className={styles.modalOverlay} onClick={closeImagePreview} role="presentation">
          <section
            className={styles.modalCard}
            role="dialog"
            aria-modal="true"
            aria-label={previewImageTitle || "Imagen de gasto"}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>{previewImageTitle || "Imagen de gasto"}</h3>
              <button type="button" className={styles.modalCloseBtn} onClick={closeImagePreview}>
                Cerrar
              </button>
            </div>
            <img className={styles.modalImage} src={resolveImageUrl(previewImageUrl)} alt={previewImageTitle || "Imagen"} />
          </section>
        </div>
      ) : null}
    </div>
  );
}
