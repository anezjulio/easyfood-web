import { useEffect, useMemo, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import { formatDateTimeAR as formatDateTime } from "../../../shared/format/locale";
import { normalizeForSearch } from "../../../shared/search/search";
import MerchandiseRequestEditor from "../component/MerchandiseRequestEditor";
import RequestItemsTable from "../component/RequestItemsTable";
import type { OperationRequest, OperationRequestItem, OperationRequestType } from "../model/request.types";
import {
  cancelOperationRequestApi,
  createOperationRequestApi,
  fetchOperationRequestsApi,
  updateOperationRequestApi,
} from "../service/request.api";
import styles from "./OperationRequestsScreen.module.css";

type Tab = "history" | "form";

function requestTypeLabel(value: OperationRequestType) {
  return value === "merchandise" ? "Mercancia" : "Permisos";
}

function statusLabel(value: OperationRequest["status"]) {
  return value === "pending" ? "Pendiente" : value === "approved" ? "Aprobada" : "Rechazada";
}

function summarizeRequestedProducts(items: OperationRequestItem[]) {
  if (!items.length) return "Sin productos cargados.";
  if (items.length === 1) return `${items[0].productName} x${items[0].quantity}`;
  return `${items[0].productName} x${items[0].quantity} y ${items.length - 1} mas`;
}

function toItemDrafts(items: OperationRequestItem[]) {
  return items.map((item) => ({
    productId: item.productId,
    quantity: Math.max(1, Math.trunc(item.quantity)),
  }));
}

export default function OperationRequestsScreen() {
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("history");
  const [requests, setRequests] = useState<OperationRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [requestType, setRequestType] = useState<OperationRequestType>("merchandise");
  const [description, setDescription] = useState("");
  const [requestItems, setRequestItems] = useState<OperationRequestItem[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | OperationRequestType>("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState("");
  const [cancelModalRequestId, setCancelModalRequestId] = useState<string | null>(null);

  const currentUsername = normalizeForSearch(auth.user?.username || "");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const list = await fetchOperationRequestsApi();
        if (alive) {
          setRequests(list);
        }
      } catch {
        if (alive) {
          setError("No se pudo cargar solicitudes.");
        }
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

  function isRequestOwnedByCurrentUser(item: OperationRequest) {
    return normalizeForSearch(item.requestedBy) === currentUsername;
  }

  function canEditPendingRequest(item: OperationRequest) {
    return item.status === "pending" && isRequestOwnedByCurrentUser(item);
  }

  const visibleRequests = useMemo(() => {
    const query = normalizeForSearch(search);
    let list = requests;

    if (auth.user?.role !== "admin") {
      list = list.filter((item) => normalizeForSearch(item.requestedBy) === currentUsername);
    }

    if (statusFilter !== "all") {
      list = list.filter((item) => item.status === statusFilter);
    }

    if (typeFilter !== "all") {
      list = list.filter((item) => item.requestType === typeFilter);
    }

    if (query) {
      list = list.filter((item) => {
        const requestedProducts = (item.items || []).map((product) => product.productName).join(" ");
        const content = `${item.description} ${item.requestedBy} ${requestTypeLabel(item.requestType)} ${requestedProducts}`;
        return normalizeForSearch(content).includes(query);
      });
    }

    return [...list].sort((a, b) => {
      const rankA = a.status === "pending" ? 0 : 1;
      const rankB = b.status === "pending" ? 0 : 1;
      if (rankA !== rankB) return rankA - rankB;
      return new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime();
    });
  }, [auth.user?.role, currentUsername, requests, search, statusFilter, typeFilter]);

  const selectedRequest = useMemo(
    () => requests.find((item) => item.id === selectedRequestId) || null,
    [requests, selectedRequestId],
  );
  const cancelModalRequest = useMemo(
    () => requests.find((item) => item.id === cancelModalRequestId) || null,
    [cancelModalRequestId, requests],
  );
  const selectedIsEditable = !!selectedRequest && canEditPendingRequest(selectedRequest);

  function clearFeedback() {
    setError("");
    setWarning("");
    setMessage("");
  }

  function increaseRequestItem(productId: string) {
    setRequestItems((current) =>
      current.map((item) => (item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item)),
    );
    clearFeedback();
  }

  function decreaseRequestItem(productId: string) {
    setRequestItems((current) =>
      current.flatMap((item) => {
        if (item.productId !== productId) return [item];
        if (item.quantity <= 1) return [];
        return [{ ...item, quantity: item.quantity - 1 }];
      }),
    );
    clearFeedback();
  }

  function changeRequestItemQuantity(productId: string, value: string) {
    const parsed = Math.trunc(Number(value));
    if (!value.trim()) {
      setRequestItems((current) => current.filter((item) => item.productId !== productId));
      clearFeedback();
      return;
    }
    if (!Number.isFinite(parsed)) return;
    if (parsed <= 0) {
      setRequestItems((current) => current.filter((item) => item.productId !== productId));
      clearFeedback();
      return;
    }
    setRequestItems((current) =>
      current.map((item) => (item.productId === productId ? { ...item, quantity: parsed } : item)),
    );
    clearFeedback();
  }

  function removeRequestItem(productId: string) {
    setRequestItems((current) => current.filter((item) => item.productId !== productId));
    clearFeedback();
  }

  function resetForm(clearFeedback = true) {
    setSelectedRequestId(null);
    setRequestType("merchandise");
    setDescription("");
    setRequestItems([]);
    if (clearFeedback) {
      setError("");
      setWarning("");
      setMessage("");
    }
  }

  function openNewRequestTab() {
    resetForm(true);
    setActiveTab("form");
  }

  function selectRequestForEdit(item: OperationRequest) {
    if (!canEditPendingRequest(item)) return;
    setSelectedRequestId(item.id);
    setRequestType(item.requestType);
    setDescription(item.description);
    setRequestItems(item.items || []);
    clearFeedback();
    setActiveTab("form");
  }

  useEffect(() => {
    if (!selectedRequestId) return;
    if (!selectedRequest || !selectedIsEditable) {
      resetForm(false);
      return;
    }
    setRequestType(selectedRequest.requestType);
    setDescription(selectedRequest.description);
    setRequestItems(selectedRequest.items || []);
  }, [selectedIsEditable, selectedRequest, selectedRequestId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setWarning("");
    setMessage("");

    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      setError("Ingresa la descripcion de la solicitud.");
      return;
    }

    if (requestType === "merchandise" && requestItems.length === 0) {
      setError("Agrega al menos un producto para la solicitud de mercancia.");
      return;
    }

    try {
      if (selectedRequest && selectedIsEditable) {
        const updated = await updateOperationRequestApi(selectedRequest.id, {
          requestType,
          description: trimmedDescription,
          items: requestType === "merchandise" ? toItemDrafts(requestItems) : [],
        });
        setRequests((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        resetForm(false);
        setMessage("Solicitud pendiente actualizada.");
      } else {
        const created = await createOperationRequestApi({
          requestType,
          description: trimmedDescription,
          requestedBy: auth.user?.username || "operator",
          items: requestType === "merchandise" ? toItemDrafts(requestItems) : [],
        });
        setRequests((current) => [created, ...current]);
        resetForm(false);
        setMessage("Solicitud enviada para aprobacion.");
      }
      setActiveTab("history");
    } catch {
      setError(selectedRequest && selectedIsEditable ? "No se pudo actualizar la solicitud." : "No se pudo crear la solicitud.");
    }
  }

  function openCancelModal(requestId: string) {
    const target = requests.find((item) => item.id === requestId);
    if (!target || !canEditPendingRequest(target)) return;
    setCancelModalRequestId(requestId);
  }

  function closeCancelModal() {
    setCancelModalRequestId(null);
  }

  async function confirmCancelPendingRequest() {
    if (!cancelModalRequest || !canEditPendingRequest(cancelModalRequest)) {
      setCancelModalRequestId(null);
      return;
    }
    setError("");
    setWarning("");
    setMessage("");

    try {
      await cancelOperationRequestApi(cancelModalRequest.id);
      setRequests((current) => current.filter((item) => item.id !== cancelModalRequest.id));
      if (selectedRequestId === cancelModalRequest.id) {
        resetForm(false);
      }
      setWarning("Solicitud pendiente cancelada.");
      setActiveTab("history");
    } catch {
      setError("No se pudo cancelar la solicitud.");
    } finally {
      setCancelModalRequestId(null);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Solicitudes" }]} asTitle />
            <p className={styles.subtitle}>Crea solicitudes de mercancia o permisos y separa el historico del formulario.</p>
          </div>
          <SessionStatusBar />
        </header>

        {error ? <div className={styles.errorBox}>{error}</div> : null}
        {warning ? <div className={styles.warningBox}>{warning}</div> : null}
        {message ? <div className={styles.successBox}>{message}</div> : null}

        <section className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "history" ? styles.tabBtnActive : ""}`.trim()}
            onClick={() => setActiveTab("history")}
          >
            Historico
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "form" ? styles.tabBtnActive : ""}`.trim()}
            onClick={() => setActiveTab("form")}
          >
            {selectedIsEditable ? "Editar solicitud" : "Nueva solicitud"}
          </button>
        </section>

        {activeTab === "history" ? (
          <section className={styles.listCard}>
            <div className={styles.cardHeader}>
              <div>
                <h2 className={styles.cardTitle}>Historico de solicitudes</h2>
                <p className={styles.cardSubtitle}>Busca por tipo, descripcion, usuario o nombre de producto.</p>
              </div>
              <button type="button" className={styles.primaryBtn} onClick={openNewRequestTab}>
                + Nueva solicitud
              </button>
            </div>

            <div className={styles.filters}>
              <input
                className={styles.searchInput}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por tipo, descripcion o producto"
              />
              <select
                className={styles.filterSelect}
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as "all" | OperationRequestType)}
              >
                <option value="all">Todos los tipos</option>
                <option value="merchandise">Mercancia</option>
                <option value="permissions">Permisos</option>
              </select>
              <select
                className={styles.filterSelect}
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "all" | "pending" | "approved" | "rejected")}
              >
                <option value="all">Todos los estados</option>
                <option value="pending">Pendientes</option>
                <option value="approved">Aprobadas</option>
                <option value="rejected">Rechazadas</option>
              </select>
            </div>

            {loading ? (
              <p className={styles.empty}>Cargando solicitudes...</p>
            ) : visibleRequests.length === 0 ? (
              <p className={styles.empty}>No hay solicitudes para mostrar.</p>
            ) : (
              <div className={styles.requestList}>
                {visibleRequests.map((item) => {
                  const editablePending = canEditPendingRequest(item);
                  const requestedUnits = (item.items || []).reduce((acc, product) => acc + Math.max(0, Math.trunc(product.quantity)), 0);

                  return (
                    <article key={item.id} className={styles.requestCard}>
                      <div className={styles.requestTop}>
                        <div className={styles.requestTitleBlock}>
                          <span className={styles.requestType}>{requestTypeLabel(item.requestType)}</span>
                          <span
                            className={`${styles.badge} ${item.status === "pending" ? styles.badgePending : ""} ${
                              item.status === "approved" ? styles.badgeApproved : ""
                            } ${item.status === "rejected" ? styles.badgeRejected : ""}`.trim()}
                          >
                            {statusLabel(item.status)}
                          </span>
                        </div>

                        {editablePending ? (
                          <div className={styles.requestActions}>
                            <button type="button" className={styles.inlineBtn} onClick={() => selectRequestForEdit(item)}>
                              Editar
                            </button>
                            <button type="button" className={styles.inlineDangerBtn} onClick={() => openCancelModal(item.id)}>
                              Cancelar
                            </button>
                          </div>
                        ) : null}
                      </div>

                      <p className={styles.description}>{item.description}</p>

                      {item.requestType === "merchandise" ? (
                        <div className={styles.requestSummaryRow}>
                          <span>{(item.items || []).length} productos</span>
                          <span>{requestedUnits} unidades</span>
                          <span>{summarizeRequestedProducts(item.items || [])}</span>
                        </div>
                      ) : null}

                      <p className={styles.meta}>
                        <strong>Solicitado por:</strong> {item.requestedBy} - {formatDateTime(item.requestedAt)}
                      </p>

                      {item.reviewComment ? (
                        <p className={styles.reviewNote}>
                          <strong>Respuesta admin:</strong> {item.reviewComment}
                        </p>
                      ) : null}

                      {item.supplyOrderId ? (
                        <p className={styles.meta}>
                          <strong>Pedido proveedor:</strong> {item.supplyOrderId}
                        </p>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
          <form
            className={`${styles.formLayout} ${requestType === "merchandise" ? styles.formLayoutMerchandise : ""}`.trim()}
            onSubmit={submit}
          >
            {requestType === "merchandise" ? (
              <>
                <div className={styles.formColumn}>
                  <section className={styles.formCard}>
                    <div className={styles.form}>
                      {selectedIsEditable ? (
                        <p className={styles.editingHint}>Editando solicitud {selectedRequest?.id}.</p>
                      ) : null}

                      <div className={styles.typeButtons}>
                        <button
                          type="button"
                          className={`${styles.typeBtn} ${styles.typeBtnActive}`.trim()}
                          onClick={() => setRequestType("merchandise")}
                        >
                          Mercancia
                        </button>
                        <button
                          type="button"
                          className={styles.typeBtn}
                          onClick={() => setRequestType("permissions")}
                        >
                          Permisos
                        </button>
                      </div>

                      <label className={styles.field}>
                        <span>Descripcion</span>
                        <textarea
                          className={styles.textarea}
                          value={description}
                          onChange={(event) => setDescription(event.target.value)}
                          rows={4}
                          placeholder="Explica para que necesitas esta mercancia, proveedor sugerido u observaciones."
                        />
                      </label>

                      <div className={styles.formHint}>
                        La solicitud de mercancia se guarda con los productos y sus cantidades seleccionadas.
                      </div>
                    </div>
                  </section>

                  <MerchandiseRequestEditor
                    items={requestItems}
                    onChange={(nextItems) => {
                      setRequestItems(nextItems);
                      clearFeedback();
                    }}
                    layoutMode="split"
                    renderMode="catalog"
                  />
                </div>

                <div className={styles.selectionColumn}>
                  <RequestItemsTable
                    items={requestItems}
                    editable
                    title="Productos de la solicitud"
                    helperText="Ajusta cantidades, resta o elimina productos antes de guardar."
                    emptyMessage="Todavia no agregaste productos a la solicitud."
                    onIncrease={increaseRequestItem}
                    onDecrease={decreaseRequestItem}
                    onQuantityChange={changeRequestItemQuantity}
                    onRemove={removeRequestItem}
                    footer={
                      <div className={styles.actions}>
                        <button type="submit" className={styles.primaryBtn}>
                          {selectedIsEditable ? "Guardar cambios" : "Enviar solicitud"}
                        </button>
                      </div>
                    }
                  />
                </div>
              </>
            ) : (
              <section className={styles.formCard}>
                <div className={styles.form}>
                  {selectedIsEditable ? (
                    <p className={styles.editingHint}>Editando solicitud {selectedRequest?.id}.</p>
                  ) : null}

                  <div className={styles.typeButtons}>
                    <button
                      type="button"
                      className={styles.typeBtn}
                      onClick={() => setRequestType("merchandise")}
                    >
                      Mercancia
                    </button>
                    <button
                      type="button"
                      className={`${styles.typeBtn} ${styles.typeBtnActive}`.trim()}
                      onClick={() => setRequestType("permissions")}
                    >
                      Permisos
                    </button>
                  </div>

                  <label className={styles.field}>
                    <span>Descripcion</span>
                    <textarea
                      className={styles.textarea}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      rows={4}
                      placeholder="Detalla el permiso solicitado."
                    />
                  </label>

                  <div className={styles.formHint}>
                    Para permisos no hace falta seleccionar productos; solo describe el pedido con el mayor contexto posible.
                  </div>

                  <div className={styles.actions}>
                    <button type="submit" className={styles.primaryBtn}>
                      {selectedIsEditable ? "Guardar cambios" : "Enviar solicitud"}
                    </button>
                  </div>
                </div>
              </section>
            )}
          </form>
        )}

        {cancelModalRequest ? (
          <div className={styles.modalOverlay} onClick={closeCancelModal}>
            <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <h3 className={styles.modalTitle}>Cancelar solicitud</h3>
              <p className={styles.modalText}>Deseas cancelar esta solicitud pendiente?</p>
              <p className={styles.modalMeta}>
                <strong>ID:</strong> {cancelModalRequest.id}
              </p>
              <p className={styles.modalMeta}>
                <strong>Tipo:</strong> {requestTypeLabel(cancelModalRequest.requestType)}
              </p>
              <p className={styles.modalMeta}>
                <strong>Estado:</strong> {statusLabel(cancelModalRequest.status)}
              </p>
              <p className={styles.modalMeta}>
                <strong>Solicitado por:</strong> {cancelModalRequest.requestedBy}
              </p>
              <p className={styles.modalMeta}>
                <strong>Fecha:</strong> {formatDateTime(cancelModalRequest.requestedAt)}
              </p>
              <p className={styles.modalMeta}>
                <strong>Descripcion:</strong>
              </p>
              <p className={styles.modalDescription}>{cancelModalRequest.description}</p>
              {cancelModalRequest.reviewComment ? (
                <>
                  <p className={styles.modalMeta}>
                    <strong>Respuesta admin:</strong>
                  </p>
                  <p className={styles.modalDescription}>{cancelModalRequest.reviewComment}</p>
                </>
              ) : null}
              {cancelModalRequest.supplierMessage ? (
                <>
                  <p className={styles.modalMeta}>
                    <strong>Pedido proveedor:</strong>
                  </p>
                  <p className={styles.modalDescription}>{cancelModalRequest.supplierMessage}</p>
                </>
              ) : null}
              {cancelModalRequest.reviewedBy ? (
                <p className={styles.modalMeta}>
                  <strong>Revisado por:</strong> {cancelModalRequest.reviewedBy}
                  {cancelModalRequest.reviewedAt ? ` - ${formatDateTime(cancelModalRequest.reviewedAt)}` : ""}
                </p>
              ) : null}
              {cancelModalRequest.supplyOrderId ? (
                <p className={styles.modalMeta}>
                  <strong>Pedido proveedor ID:</strong> {cancelModalRequest.supplyOrderId}
                </p>
              ) : null}
              <div className={styles.modalActions}>
                <button type="button" className={styles.secondaryBtn} onClick={closeCancelModal}>
                  No
                </button>
                <button type="button" className={styles.modalDangerBtn} onClick={() => void confirmCancelPendingRequest()}>
                  Si, cancelar
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
