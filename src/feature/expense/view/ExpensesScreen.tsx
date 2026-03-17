import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import { formatDateTimeAR as formatDateTime, formatMoneyARS } from "../../../shared/format/locale";
import { resolveImageUrl, uploadImageFromFile } from "../../../shared/image/image.service";
import { normalizeForSearch } from "../../../shared/search/search";
import type { Expense, ExpenseAmountMode, ExpenseStatus, ExpenseType } from "../model/expense.types";
import { confirmExpenseApi, createExpenseApi, fetchExpensesApi } from "../service/expense.api";
import styles from "./ExpensesScreen.module.css";

type Tab = "create" | "confirm" | "history";

function formatMoneyMaskFromDigits(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits ? `$ ${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}` : "";
}

function expenseTypeLabel(value: ExpenseType) {
  return value === "recurrent" ? "Recurrente / programado" : "Imprevisto";
}

function expenseStatusLabel(value: ExpenseStatus) {
  return value === "confirmed" ? "Confirmado" : "Pendiente";
}

function resolveTab(raw: unknown, isAdmin: boolean): Tab {
  const value = String(raw || "").trim().toLowerCase();
  if (isAdmin) {
    if (value === "confirm") return "confirm";
    if (value === "history") return "history";
    return "create";
  }
  return value === "history" ? "history" : "confirm";
}

function getDisplayAmount(item: Expense) {
  return item.status === "confirmed" ? item.confirmedAmount || item.amount : item.assignedAmount;
}

export default function ExpensesScreen() {
  const auth = useAuth();
  const location = useLocation();
  const isAdmin = auth.user?.role === "admin";
  const username = normalizeForSearch(auth.user?.username || "");
  const requestedTab = (location.state as { tab?: unknown } | null)?.tab;

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>(resolveTab(requestedTab, isAdmin));
  const [typeFilter, setTypeFilter] = useState<"all" | ExpenseType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ExpenseStatus>("all");
  const [search, setSearch] = useState("");
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [previewImageTitle, setPreviewImageTitle] = useState("");

  const [expenseType, setExpenseType] = useState<ExpenseType>("unexpected");
  const [description, setDescription] = useState("");
  const [amountDigits, setAmountDigits] = useState("");
  const [invoiceImageUrl, setInvoiceImageUrl] = useState("");
  const [unexpectedImageUrl, setUnexpectedImageUrl] = useState("");
  const [isUploadingInvoice, setIsUploadingInvoice] = useState(false);
  const [isUploadingUnexpected, setIsUploadingUnexpected] = useState(false);
  const [formError, setFormError] = useState("");
  const [formMessage, setFormMessage] = useState("");

  const [selectedExpenseId, setSelectedExpenseId] = useState("");
  const [amountMode, setAmountMode] = useState<ExpenseAmountMode>("assigned");
  const [differentAmountDigits, setDifferentAmountDigits] = useState("");
  const [confirmComment, setConfirmComment] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");

  useEffect(() => {
    setActiveTab(resolveTab(requestedTab, isAdmin));
  }, [isAdmin, requestedTab]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const list = await fetchExpensesApi();
        if (alive) setExpenses(list);
      } catch {
        if (alive) setFormError("No se pudieron cargar los gastos.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const pendingExpenses = useMemo(
    () =>
      [...expenses]
        .filter((item) => item.status === "pending-confirmation")
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [expenses],
  );
  const confirmedExpenses = useMemo(
    () => [...expenses].filter((item) => item.status === "confirmed").sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [expenses],
  );
  const historyExpenses = useMemo(() => {
    let list = expenses;
    if (!isAdmin) {
      list = list.filter((item) => normalizeForSearch(item.createdBy) === username || normalizeForSearch(item.confirmedBy || "") === username);
    }
    if (typeFilter !== "all") list = list.filter((item) => item.expenseType === typeFilter);
    if (statusFilter !== "all") list = list.filter((item) => item.status === statusFilter);
    const query = normalizeForSearch(search);
    if (query) {
      list = list.filter((item) =>
        normalizeForSearch(`${item.description} ${item.createdBy} ${item.confirmedBy || ""} ${item.confirmationComment || ""}`).includes(query),
      );
    }
    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [expenses, isAdmin, search, statusFilter, typeFilter, username]);
  const totalConfirmedVisible = useMemo(
    () => historyExpenses.filter((item) => item.status === "confirmed").reduce((acc, item) => acc + getDisplayAmount(item), 0),
    [historyExpenses],
  );

  useEffect(() => {
    if (!pendingExpenses.length) {
      setSelectedExpenseId("");
      return;
    }
    if (!pendingExpenses.some((item) => item.id === selectedExpenseId)) {
      setSelectedExpenseId(pendingExpenses[0].id);
    }
  }, [pendingExpenses, selectedExpenseId]);

  const selectedExpense = useMemo(
    () => pendingExpenses.find((item) => item.id === selectedExpenseId) || null,
    [pendingExpenses, selectedExpenseId],
  );
  const differentAmount = Math.trunc(Number(differentAmountDigits || 0));
  const differentIsValid = !!selectedExpense && Number.isFinite(differentAmount) && differentAmount > 0 && differentAmount !== selectedExpense.assignedAmount;
  const commentTrimmed = confirmComment.trim();
  const confirmDisabled = !selectedExpense || (amountMode === "different" && (!differentIsValid || !commentTrimmed));

  function clearCreateForm() {
    setExpenseType("unexpected");
    setDescription("");
    setAmountDigits("");
    setInvoiceImageUrl("");
    setUnexpectedImageUrl("");
    setFormError("");
    setFormMessage("");
  }

  function resetConfirmForm() {
    setAmountMode("assigned");
    setDifferentAmountDigits("");
    setConfirmComment("");
    setConfirmError("");
    setConfirmMessage("");
  }

  async function uploadImage(event: React.ChangeEvent<HTMLInputElement>, kind: "invoice" | "unexpected") {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormError(kind === "invoice" ? "La factura debe ser una imagen." : "La foto del imprevisto debe ser una imagen.");
      return;
    }
    setFormError("");
    setFormMessage("");
    kind === "invoice" ? setIsUploadingInvoice(true) : setIsUploadingUnexpected(true);
    try {
      const uploadedPath = await uploadImageFromFile(file);
      if (kind === "invoice") setInvoiceImageUrl(uploadedPath);
      else setUnexpectedImageUrl(uploadedPath);
      setFormMessage(kind === "invoice" ? "Foto de factura cargada." : "Foto del imprevisto cargada.");
    } catch {
      setFormError(kind === "invoice" ? "No se pudo cargar la foto de factura." : "No se pudo cargar la foto del imprevisto.");
    } finally {
      kind === "invoice" ? setIsUploadingInvoice(false) : setIsUploadingUnexpected(false);
    }
  }

  async function submitExpense(event: React.FormEvent) {
    event.preventDefault();
    const trimmedDescription = description.trim();
    const parsedAmount = Math.trunc(Number(amountDigits));
    setFormError("");
    setFormMessage("");
    if (!trimmedDescription) return setFormError("Ingresa el motivo o descripcion del gasto.");
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return setFormError("Ingresa un monto valido.");
    if (isUploadingInvoice || isUploadingUnexpected) return setFormError("Espera a que termine la carga de imagen.");
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
      clearCreateForm();
      setFormMessage("Gasto creado. Queda pendiente de confirmacion.");
    } catch {
      setFormError("No se pudo registrar el gasto.");
    }
  }

  async function confirmExpense() {
    if (!selectedExpense) return;
    setConfirmError("");
    setConfirmMessage("");
    if (amountMode === "different" && !differentIsValid) return setConfirmError("Ingresa un monto confirmado valido y diferente.");
    if (amountMode === "different" && !commentTrimmed) return setConfirmError("Debes dejar un comentario cuando el monto cambia.");
    try {
      const updated = await confirmExpenseApi(selectedExpense.id, {
        confirmedAmount: amountMode === "assigned" ? selectedExpense.assignedAmount : differentAmount,
        amountMode,
        confirmationComment: commentTrimmed || undefined,
        confirmedBy: auth.user?.username || "operator",
      });
      setExpenses((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      resetConfirmForm();
      setConfirmMessage("Gasto confirmado correctamente.");
    } catch {
      setConfirmError("No se pudo confirmar el gasto.");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Gastos" }]} asTitle />
            <p className={styles.subtitle}>
              {isAdmin
                ? "Registra gastos, confirma pendientes y revisa el historial."
                : "Confirma gastos asignados y justifica los cambios de monto."}
            </p>
          </div>
          <SessionStatusBar />
        </header>

        <section className={styles.summary}>
          <p className={styles.summaryTotal}><strong>Total confirmado visible:</strong> <span className={styles.summaryTotalAmount}>{formatMoneyARS(totalConfirmedVisible)}</span></p>
          <p><strong>Pendientes:</strong> {pendingExpenses.length}</p>
          <p><strong>Confirmados:</strong> {confirmedExpenses.length}</p>
        </section>

        <section className={styles.tabs}>
          {isAdmin ? (
            <>
              <button type="button" className={`${styles.tabBtn} ${activeTab === "create" ? styles.tabBtnActive : ""}`} onClick={() => setActiveTab("create")}>Registrar gasto</button>
              <button type="button" className={`${styles.tabBtn} ${activeTab === "confirm" ? styles.tabBtnActive : ""}`} onClick={() => setActiveTab("confirm")}>Confirmar Gasto</button>
              <button type="button" className={`${styles.tabBtn} ${activeTab === "history" ? styles.tabBtnActive : ""}`} onClick={() => setActiveTab("history")}>Historial</button>
            </>
          ) : (
            <>
              <button type="button" className={`${styles.tabBtn} ${activeTab === "confirm" ? styles.tabBtnActive : ""}`} onClick={() => setActiveTab("confirm")}>Confirmar Gasto</button>
              <button type="button" className={`${styles.tabBtn} ${activeTab === "history" ? styles.tabBtnActive : ""}`} onClick={() => setActiveTab("history")}>Historial</button>
            </>
          )}
        </section>

        {activeTab === "create" && isAdmin ? (
          <div className={styles.layout}>
            <section className={styles.formCard}>
              <h2 className={styles.cardTitle}>Nuevo gasto</h2>
              <form className={styles.form} onSubmit={submitExpense}>
                <div className={styles.typeButtons}>
                  <button type="button" className={`${styles.typeBtn} ${expenseType === "recurrent" ? styles.typeBtnActive : ""}`} onClick={() => { setExpenseType("recurrent"); setUnexpectedImageUrl(""); }}>Recurrente / programado</button>
                  <button type="button" className={`${styles.typeBtn} ${expenseType === "unexpected" ? styles.typeBtnActive : ""}`} onClick={() => setExpenseType("unexpected")}>Imprevisto</button>
                </div>
                <label className={styles.field}><span>Motivo o descripcion</span><textarea className={styles.textarea} rows={8} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
                <label className={styles.field}><span>Monto asignado</span><input className={styles.input} type="text" inputMode="numeric" value={formatMoneyMaskFromDigits(amountDigits)} onChange={(event) => { setAmountDigits(event.target.value.replace(/\D/g, "")); setFormError(""); setFormMessage(""); }} placeholder="$ 0" /></label>
                <div className={styles.field}>
                  <span>Foto de factura (opcional)</span>
                  <label className={styles.uploadBtn} aria-disabled={isUploadingInvoice}>{isUploadingInvoice ? "Subiendo..." : "Seleccionar imagen"}<input type="file" accept="image/*" className={styles.hiddenFileInput} onChange={(event) => uploadImage(event, "invoice")} disabled={isUploadingInvoice} /></label>
                  {invoiceImageUrl ? <button type="button" className={styles.imagePreviewBtn} onClick={() => { setPreviewImageUrl(invoiceImageUrl); setPreviewImageTitle("Factura del gasto"); }}><img className={styles.imageThumb} src={resolveImageUrl(invoiceImageUrl)} alt="Vista previa de factura" /></button> : null}
                </div>
                {expenseType === "unexpected" ? (
                  <div className={styles.field}>
                    <span>Foto del imprevisto (opcional)</span>
                    <label className={styles.uploadBtn} aria-disabled={isUploadingUnexpected}>{isUploadingUnexpected ? "Subiendo..." : "Seleccionar imagen"}<input type="file" accept="image/*" className={styles.hiddenFileInput} onChange={(event) => uploadImage(event, "unexpected")} disabled={isUploadingUnexpected} /></label>
                    {unexpectedImageUrl ? <div className={styles.optionalImageActions}><button type="button" className={styles.imagePreviewBtn} onClick={() => { setPreviewImageUrl(unexpectedImageUrl); setPreviewImageTitle("Imprevisto reportado"); }}><img className={styles.imageThumb} src={resolveImageUrl(unexpectedImageUrl)} alt="Vista previa de imprevisto" /></button><button type="button" className={styles.removeImageBtn} onClick={() => setUnexpectedImageUrl("")}>Quitar foto</button></div> : null}
                  </div>
                ) : null}
                {formError ? <div className={styles.errorBox}>{formError}</div> : null}
                {formMessage ? <div className={styles.successBox}>{formMessage}</div> : null}
                <div className={styles.actions}><button type="button" className={styles.secondaryBtn} onClick={clearCreateForm}>Limpiar</button><button type="submit" className={styles.primaryBtn}>Crear gasto</button></div>
              </form>
            </section>
            <section className={styles.sideInfoCard}><h2 className={styles.cardTitle}>Flujo</h2><div className={styles.infoGrid}><p><strong>1.</strong> Admin crea y asigna monto.</p><p><strong>2.</strong> Admin u operador confirma.</p><p><strong>3.</strong> Si cambia el monto, comentario obligatorio.</p><p><strong>4.</strong> La confirmacion impacta cuentas y transacciones.</p></div></section>
          </div>
        ) : null}

        {activeTab === "confirm" ? (
          <div className={styles.confirmLayout}>
            <section className={styles.listCard}>
              <h2 className={styles.cardTitle}>Gastos pendientes</h2>
              {loading ? <p className={styles.empty}>Cargando gastos pendientes...</p> : pendingExpenses.length === 0 ? <p className={styles.empty}>No hay gastos pendientes de confirmacion.</p> : (
                <div className={styles.expenseList}>
                  {pendingExpenses.map((item) => (
                    <button type="button" key={item.id} className={`${styles.pendingBtn} ${selectedExpenseId === item.id ? styles.pendingBtnActive : ""}`} onClick={() => { setSelectedExpenseId(item.id); resetConfirmForm(); }}>
                      <div className={styles.expenseTop}><span className={styles.badgePending}>{expenseStatusLabel(item.status)}</span><strong className={styles.amount}>{formatMoneyARS(item.assignedAmount)}</strong></div>
                      <p className={styles.description}>{item.description}</p>
                      <p className={styles.meta}>Creado por {item.createdBy} el {formatDateTime(item.createdAt)}</p>
                    </button>
                  ))}
                </div>
              )}
            </section>
            <section className={styles.detailCard}>
              <h2 className={styles.cardTitle}>Confirmacion de gasto</h2>
              {!selectedExpense ? <p className={styles.empty}>Selecciona un gasto pendiente.</p> : (
                <div className={styles.detailBody}>
                  <p><strong>Descripcion:</strong></p>
                  <p className={styles.descriptionBox}>{selectedExpense.description}</p>
                  <p><strong>Tipo:</strong> {expenseTypeLabel(selectedExpense.expenseType)}</p>
                  <p><strong>Monto asignado:</strong> {formatMoneyARS(selectedExpense.assignedAmount)}</p>
                  <label className={styles.field}><span>Confirmar monto</span><select className={styles.input} value={amountMode} onChange={(event) => { setAmountMode(event.target.value as ExpenseAmountMode); setConfirmError(""); setConfirmMessage(""); }}><option value="assigned">Usar monto asignado</option><option value="different">Monto diferente</option></select></label>
                  {amountMode === "different" ? <label className={styles.field}><span>Monto confirmado</span><input className={styles.input} type="text" inputMode="numeric" value={formatMoneyMaskFromDigits(differentAmountDigits)} onChange={(event) => { setDifferentAmountDigits(event.target.value.replace(/\D/g, "")); setConfirmError(""); setConfirmMessage(""); }} placeholder="$ 0" /></label> : null}
                  <div className={styles.amountRows}><div><span>Asignado</span><strong>{formatMoneyARS(selectedExpense.assignedAmount)}</strong></div><div><span>A confirmar</span><strong>{formatMoneyARS(amountMode === "assigned" ? selectedExpense.assignedAmount : Math.max(0, differentAmount))}</strong></div></div>
                  <label className={styles.field}><span>Comentario{amountMode === "different" ? " *" : " (opcional)"}</span><textarea className={styles.textarea} rows={4} value={confirmComment} onChange={(event) => { setConfirmComment(event.target.value); setConfirmError(""); setConfirmMessage(""); }} placeholder={amountMode === "different" ? "Explica por que el monto final cambio" : "Comentario opcional"} /></label>
                  {confirmError ? <div className={styles.errorBox}>{confirmError}</div> : null}
                  {confirmMessage ? <div className={styles.successBox}>{confirmMessage}</div> : null}
                  <div className={styles.actions}><button type="button" className={styles.secondaryBtn} onClick={resetConfirmForm}>Limpiar</button><button type="button" className={styles.primaryBtn} onClick={confirmExpense} disabled={confirmDisabled}>Confirmar Gasto</button></div>
                </div>
              )}
            </section>
          </div>
        ) : null}

        {activeTab === "history" ? (
          <section className={styles.listCard}>
            <h2 className={styles.cardTitle}>Historial de gastos</h2>
            <div className={styles.filters}>
              <input className={styles.searchInput} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por motivo, usuario o comentario" />
              <select className={styles.typeSelect} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "all" | ExpenseType)}><option value="all">Todos los tipos</option><option value="recurrent">Recurrente / programado</option><option value="unexpected">Imprevisto</option></select>
              <select className={styles.typeSelect} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | ExpenseStatus)}><option value="all">Todos los estados</option><option value="pending-confirmation">Pendiente</option><option value="confirmed">Confirmado</option></select>
            </div>
            {loading ? <p className={styles.empty}>Cargando gastos...</p> : historyExpenses.length === 0 ? <p className={styles.empty}>No hay gastos para mostrar.</p> : (
              <div className={styles.expenseList}>
                {historyExpenses.map((item) => (
                  <article key={item.id} className={styles.expenseCard}>
                    <div className={styles.expenseTop}><div className={styles.badgeRow}><span className={item.expenseType === "recurrent" ? styles.badgeRecurrent : styles.badgeUnexpected}>{expenseTypeLabel(item.expenseType)}</span><span className={item.status === "confirmed" ? styles.badgeConfirmed : styles.badgePending}>{expenseStatusLabel(item.status)}</span></div><strong className={styles.amount}>{formatMoneyARS(getDisplayAmount(item))}</strong></div>
                    <p className={styles.description}>{item.description}</p>
                    <div className={styles.metaGrid}>
                      <p className={styles.meta}><strong>Creado:</strong> {formatDateTime(item.createdAt)} - {item.createdBy}</p>
                      <p className={styles.meta}><strong>Monto asignado:</strong> {formatMoneyARS(item.assignedAmount)}</p>
                      {item.status === "confirmed" ? <><p className={styles.meta}><strong>Confirmado:</strong> {formatDateTime(item.confirmedAt)} - {item.confirmedBy}</p><p className={styles.meta}><strong>Monto final:</strong> {formatMoneyARS(item.confirmedAmount || item.amount)}</p></> : null}
                    </div>
                    {item.confirmationComment ? <p className={styles.commentBox}><strong>Comentario:</strong> {item.confirmationComment}</p> : null}
                    <div className={styles.cardImageRow}>
                      {item.invoiceImageUrl ? <button type="button" className={styles.cardImageBtn} onClick={() => { setPreviewImageUrl(item.invoiceImageUrl || ""); setPreviewImageTitle("Factura del gasto"); }}>Factura</button> : null}
                      {item.unexpectedImageUrl ? <button type="button" className={styles.cardImageBtn} onClick={() => { setPreviewImageUrl(item.unexpectedImageUrl || ""); setPreviewImageTitle("Imprevisto reportado"); }}>Imprevisto</button> : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>

      {previewImageUrl ? (
        <div className={styles.modalOverlay} onClick={() => { setPreviewImageUrl(""); setPreviewImageTitle(""); }} role="presentation">
          <section className={styles.modalCard} role="dialog" aria-modal="true" aria-label={previewImageTitle || "Imagen de gasto"} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}><h3 className={styles.modalTitle}>{previewImageTitle || "Imagen de gasto"}</h3><button type="button" className={styles.modalCloseBtn} onClick={() => { setPreviewImageUrl(""); setPreviewImageTitle(""); }}>Cerrar</button></div>
            <img className={styles.modalImage} src={resolveImageUrl(previewImageUrl)} alt={previewImageTitle || "Imagen"} />
          </section>
        </div>
      ) : null}
    </div>
  );
}
