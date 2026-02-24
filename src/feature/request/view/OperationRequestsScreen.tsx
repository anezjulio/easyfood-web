import { useEffect, useMemo, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import { formatDateTimeAR as formatDateTime } from "../../../shared/format/locale";
import { normalizeForSearch } from "../../../shared/search/search";
import type { OperationRequest, OperationRequestType } from "../model/request.types";
import {
  cancelOperationRequestApi,
  createOperationRequestApi,
  fetchOperationRequestsApi,
  updateOperationRequestApi,
} from "../service/request.api";
import styles from "./OperationRequestsScreen.module.css";

function requestTypeLabel(value: OperationRequestType) {
  return value === "merchandise" ? "Mercancia" : "Permisos";
}

function statusLabel(value: OperationRequest["status"]) {
  return value === "pending" ? "Pendiente" : value === "approved" ? "Aprobado" : "Rechazado";
}

export default function OperationRequestsScreen() {
  const auth = useAuth();
  const [requests, setRequests] = useState<OperationRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [requestType, setRequestType] = useState<OperationRequestType>("merchandise");
  const [description, setDescription] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
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

  const visibleRequests = useMemo(() => {
    const query = normalizeForSearch(search);
    let list = requests;

    if (auth.user?.role !== "admin") {
      list = list.filter((item) => normalizeForSearch(item.requestedBy) === currentUsername);
    }

    if (statusFilter !== "all") {
      list = list.filter((item) => item.status === statusFilter);
    }

    if (query) {
      list = list.filter((item) => {
        const content = `${item.description} ${item.requestedBy}`.toLowerCase();
        return content.includes(query);
      });
    }

    return [...list].sort((a, b) => {
      const rankA = a.status === "pending" ? 0 : 1;
      const rankB = b.status === "pending" ? 0 : 1;
      if (rankA !== rankB) return rankA - rankB;
      return new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime();
    });
  }, [auth.user?.role, currentUsername, requests, search, statusFilter]);

  const selectedRequest = useMemo(
    () => visibleRequests.find((item) => item.id === selectedRequestId) || null,
    [selectedRequestId, visibleRequests],
  );
  const cancelModalRequest = useMemo(
    () => visibleRequests.find((item) => item.id === cancelModalRequestId) || null,
    [cancelModalRequestId, visibleRequests],
  );

  function isRequestOwnedByCurrentUser(item: OperationRequest) {
    return normalizeForSearch(item.requestedBy) === currentUsername;
  }

  function canEditPendingRequest(item: OperationRequest) {
    return item.status === "pending" && isRequestOwnedByCurrentUser(item);
  }

  function canSelectRequest(item: OperationRequest) {
    return canEditPendingRequest(item);
  }

  const selectedIsEditable = !!selectedRequest && canEditPendingRequest(selectedRequest);

  function resetForm(clearFeedback = true) {
    setSelectedRequestId(null);
    setRequestType("merchandise");
    setDescription("");
    if (clearFeedback) {
      setError("");
      setWarning("");
      setMessage("");
    }
  }

  function selectRequest(item: OperationRequest) {
    if (!canSelectRequest(item)) return;
    setSelectedRequestId(item.id);
    setError("");
    setWarning("");
    setMessage("");

    if (canEditPendingRequest(item)) {
      setRequestType(item.requestType);
      setDescription(item.description);
      return;
    }

    setRequestType("merchandise");
    setDescription("");
  }

  useEffect(() => {
    if (!selectedRequestId) return;
    if (!selectedRequest) {
      resetForm(false);
      return;
    }
    if (selectedIsEditable) {
      setRequestType(selectedRequest.requestType);
      setDescription(selectedRequest.description);
    }
  }, [selectedRequestId, selectedRequest, selectedIsEditable]);

  useEffect(() => {
    if (!selectedRequest) return;
    if (!selectedIsEditable) {
      resetForm(false);
    }
  }, [selectedRequest, selectedIsEditable]);

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

    try {
      if (selectedRequest && selectedIsEditable) {
        const updated = await updateOperationRequestApi(selectedRequest.id, {
          requestType,
          description: trimmedDescription,
        });
        setRequests((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setWarning("");
        setMessage("Solicitud pendiente actualizada.");
      } else {
        const created = await createOperationRequestApi({
          requestType,
          description: trimmedDescription,
          requestedBy: auth.user?.username || "operator",
        });
        setRequests((current) => [created, ...current]);
        setWarning("");
        setMessage("Solicitud enviada para aprobacion.");
        setRequestType("merchandise");
        setDescription("");
      }
    } catch {
      setError(selectedRequest && selectedIsEditable ? "No se pudo actualizar la solicitud." : "No se pudo crear la solicitud.");
    }
  }

  function openCancelModal(requestId: string) {
    const target = visibleRequests.find((item) => item.id === requestId);
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
      setMessage("");
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
            <p className={styles.subtitle}>Crea solicitudes de Mercancia o Permisos para revision administrativa.</p>
          </div>
          <SessionStatusBar />
        </header>

        <div className={styles.layout}>
          <section className={styles.listCard}>
            <h2 className={styles.cardTitle}>Solicitudes</h2>

            <div className={styles.filters}>
              <input
                className={styles.searchInput}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por descripcion o usuario"
              />
              <select
                className={styles.statusSelect}
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "all" | "pending" | "approved" | "rejected")}
              >
                <option value="all">Todos</option>
                <option value="pending">Pendientes</option>
                <option value="approved">Aprobados</option>
                <option value="rejected">Rechazados</option>
              </select>
            </div>

            {loading ? (
              <p className={styles.empty}>Cargando solicitudes...</p>
            ) : visibleRequests.length === 0 ? (
              <p className={styles.empty}>No hay solicitudes para mostrar.</p>
            ) : (
              <div className={styles.requestList}>
                <button
                  type="button"
                  className={`${styles.newRequestItem} ${selectedRequestId === null ? styles.newRequestItemActive : ""}`}
                  onClick={() => resetForm(true)}
                >
                  + Nueva solicitud
                </button>
                {visibleRequests.map((item) => {
                  const isSelected = selectedRequestId === item.id;
                  const selectable = canSelectRequest(item);
                  const editablePending = canEditPendingRequest(item);
                  const isPendingFromAnotherUser = item.status === "pending" && !editablePending;
                  return (
                    <article
                      key={item.id}
                      className={`${styles.requestCard} ${selectable ? styles.requestCardEditable : styles.requestCardLocked} ${
                        isSelected ? styles.requestCardEditing : ""
                      }`}
                      role={selectable ? "button" : undefined}
                      tabIndex={selectable ? 0 : undefined}
                      onClick={() => {
                        if (selectable) selectRequest(item);
                      }}
                      onKeyDown={(event) => {
                        if (!selectable) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectRequest(item);
                        }
                      }}
                    >
                      <div className={styles.requestTop}>
                        <div className={styles.requestType}>{requestTypeLabel(item.requestType)}</div>
                        <div className={styles.requestActions}>
                          <span
                            className={`${styles.badge} ${item.status === "pending" ? styles.badgePending : ""} ${
                              item.status === "approved" ? styles.badgeApproved : ""
                            } ${item.status === "rejected" ? styles.badgeRejected : ""}`}
                          >
                            {statusLabel(item.status)}
                          </span>
                          {editablePending ? (
                            <button
                              type="button"
                              className={styles.requestCancelBtn}
                              title="Cancelar solicitud"
                              aria-label="Cancelar solicitud"
                              onClick={(event) => {
                                event.stopPropagation();
                                openCancelModal(item.id);
                              }}
                            >
                              X
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <p className={styles.description}>{item.description}</p>
                      <p className={styles.meta}>
                        <strong>Solicitado por:</strong> {item.requestedBy} - {formatDateTime(item.requestedAt)}
                      </p>
                      {editablePending ? (
                        <p className={styles.pendingHint}>
                          {isSelected
                            ? "Seleccionada. Edita o cancela en el panel de la derecha."
                            : "Haz click para abrir su formulario de edicion a la derecha."}
                        </p>
                      ) : isPendingFromAnotherUser ? (
                        <p className={styles.pendingHint}>Solo lectura: pendiente de otro usuario.</p>
                      ) : (
                        <p className={styles.pendingHint}>No editable: ya fue aprobada o rechazada.</p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className={styles.formCard}>
            <h2 className={styles.cardTitle}>{selectedIsEditable ? "Editar Solicitud Pendiente" : "Nueva Solicitud"}</h2>
            <form className={styles.form} onSubmit={submit}>
              {selectedRequest && !selectedIsEditable ? (
                <p className={styles.pendingHint}>
                  La solicitud seleccionada no es editable. Selecciona una pendiente o usa "+ nueva solicitud".
                </p>
              ) : null}

              <div className={styles.typeButtons}>
                <button
                  type="button"
                  className={`${styles.typeBtn} ${requestType === "merchandise" ? styles.typeBtnActive : ""}`}
                  onClick={() => setRequestType("merchandise")}
                  disabled={!!selectedRequest && !selectedIsEditable}
                >
                  Mercancia
                </button>
                <button
                  type="button"
                  className={`${styles.typeBtn} ${requestType === "permissions" ? styles.typeBtnActive : ""}`}
                  onClick={() => setRequestType("permissions")}
                  disabled={!!selectedRequest && !selectedIsEditable}
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
                  rows={9}
                  placeholder={
                    requestType === "merchandise"
                      ? "Detalle de la mercancia que se necesita"
                      : "Detalle del permiso solicitado"
                  }
                  disabled={!!selectedRequest && !selectedIsEditable}
                />
              </label>

              {error ? <div className={styles.errorBox}>{error}</div> : null}
              {warning ? <div className={styles.warningBox}>{warning}</div> : null}
              {message ? <div className={styles.successBox}>{message}</div> : null}

              <div className={styles.actions}>
                {!selectedIsEditable ? (
                  <button type="button" className={styles.secondaryBtn} onClick={() => resetForm(true)}>
                    Limpiar
                  </button>
                ) : null}
                <button type="submit" className={styles.primaryBtn} disabled={!!selectedRequest && !selectedIsEditable}>
                  {selectedIsEditable ? "Guardar cambios" : "Enviar"}
                </button>
              </div>
            </form>
          </section>
        </div>

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


