import { useEffect, useMemo, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import { formatDateTimeAR as formatDateTime } from "../../../shared/format/locale";
import type { OperationRequest } from "../model/request.types";
import { fetchOperationRequestsApi, updateOperationRequestStatusApi } from "../service/request.api";
import { createSupplyOrderApi, fetchSupplyOrdersApi } from "../../supply/service/supply.api";
import styles from "./ApproveRequestsScreen.module.css";

function requestTypeLabel(value: OperationRequest["requestType"]) {
  return value === "merchandise" ? "Mercancia" : "Solicitud";
}

export default function ApproveRequestsScreen() {
  const auth = useAuth();
  const [requests, setRequests] = useState<OperationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedHistoryRequestId, setSelectedHistoryRequestId] = useState<string | null>(null);

  const [supplierName, setSupplierName] = useState("");
  const [supplierMessage, setSupplierMessage] = useState("");
  const [expectedTotal, setExpectedTotal] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [supplierOptions, setSupplierOptions] = useState<string[]>([]);
  const [historyStatusFilter, setHistoryStatusFilter] = useState<"all" | "approved" | "rejected">("all");
  const [historyTypeFilter, setHistoryTypeFilter] = useState<"all" | OperationRequest["requestType"]>("all");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "warning">("success");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [requestList, supplyOrders] = await Promise.all([fetchOperationRequestsApi(), fetchSupplyOrdersApi()]);
        if (!alive) return;
        setRequests(requestList);
        const unique = new Map<string, string>();
        for (const item of supplyOrders) {
          const supplier = String(item.supplierName || "").trim();
          if (!supplier) continue;
          const key = supplier.toLowerCase();
          if (!unique.has(key)) unique.set(key, supplier);
        }
        setSupplierOptions([...unique.values()].sort((a, b) => a.localeCompare(b)));
      } catch {
        if (!alive) return;
        setError("No se pudo cargar solicitudes.");
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

  const pendingRequests = useMemo(
    () =>
      [...requests]
        .filter((item) => item.status === "pending")
        .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()),
    [requests],
  );

  const historyRequests = useMemo(() => {
    let list = requests.filter((item) => item.status !== "pending");
    if (historyStatusFilter !== "all") {
      list = list.filter((item) => item.status === historyStatusFilter);
    }
    if (historyTypeFilter !== "all") {
      list = list.filter((item) => item.requestType === historyTypeFilter);
    }
    return [...list].sort(
      (a, b) => new Date(b.reviewedAt || b.requestedAt).getTime() - new Date(a.reviewedAt || a.requestedAt).getTime(),
    );
  }, [historyStatusFilter, historyTypeFilter, requests]);

  useEffect(() => {
    if (selectedHistoryRequestId) return;
    if (!pendingRequests.length) {
      setSelectedRequestId(null);
      return;
    }
    const exists = pendingRequests.some((item) => item.id === selectedRequestId);
    if (!exists) {
      setSelectedRequestId(pendingRequests[0].id);
    }
  }, [pendingRequests, selectedRequestId, selectedHistoryRequestId]);

  const selectedRequest = useMemo(
    () => pendingRequests.find((item) => item.id === selectedRequestId) || null,
    [pendingRequests, selectedRequestId],
  );
  const selectedRequestCanManage = !!selectedRequest;

  const selectedHistoryRequest = useMemo(
    () => historyRequests.find((item) => item.id === selectedHistoryRequestId) || null,
    [historyRequests, selectedHistoryRequestId],
  );

  useEffect(() => {
    if (!selectedHistoryRequestId) return;
    if (!selectedHistoryRequest) {
      setSelectedHistoryRequestId(null);
    }
  }, [selectedHistoryRequest, selectedHistoryRequestId]);

  useEffect(() => {
    if (!selectedRequest) {
      setSupplierName("");
      setSupplierMessage("");
      setExpectedTotal("");
      setReviewComment("");
      return;
    }
    setSupplierName("");
    setSupplierMessage(selectedRequest.supplierMessage || "");
    setExpectedTotal("");
    setReviewComment(selectedRequest.reviewComment || "");
  }, [selectedRequest]);

  async function resolveRequest(nextStatus: "approved" | "rejected") {
    if (!selectedRequest) return;
    setError("");
    setNotice("");
    setNoticeTone("success");
    const trimmedComment = reviewComment.trim();
    if (selectedRequest.requestType === "permissions" && !trimmedComment) {
      setError("Ingresa una respuesta para justificar la aprobacion o el rechazo.");
      return;
    }
    try {
      const updated = await updateOperationRequestStatusApi(
        selectedRequest.id,
        nextStatus,
        auth.user?.username || "admin",
        { reviewComment: trimmedComment || undefined },
      );
      setRequests((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setNoticeTone(nextStatus === "approved" ? "success" : "warning");
      setNotice(nextStatus === "approved" ? "Solicitud aprobada." : "Solicitud rechazada.");
      setReviewComment("");
    } catch {
      setError("No se pudo actualizar la solicitud.");
    }
  }

  async function generateSupplierOrder() {
    if (!selectedRequest || selectedRequest.requestType !== "merchandise") return;
    setError("");
    setNotice("");
    setNoticeTone("success");

    const trimmedSupplier = supplierName.trim();
    const trimmedSupplierMessage = supplierMessage.trim();
    const trimmedComment = reviewComment.trim();
    const total = Math.trunc(Number(expectedTotal));

    if (!trimmedSupplier) {
      setError("Ingresa el nombre del proveedor.");
      return;
    }
    if (!trimmedSupplierMessage) {
      setError("Ingresa la peticion para el proveedor.");
      return;
    }
    if (!Number.isFinite(total) || total <= 0) {
      setError("Ingresa un monto valido.");
      return;
    }

    try {
      const createdOrder = await createSupplyOrderApi({
        supplierName: trimmedSupplier,
        description: trimmedSupplierMessage,
        expectedTotal: total,
        createdBy: auth.user?.username || "admin",
      });
      const updatedRequest = await updateOperationRequestStatusApi(
        selectedRequest.id,
        "approved",
        auth.user?.username || "admin",
        {
          supplyOrderId: createdOrder.id,
          supplierMessage: trimmedSupplierMessage,
          reviewComment: trimmedComment || undefined,
        },
      );

      setRequests((current) => current.map((item) => (item.id === updatedRequest.id ? updatedRequest : item)));
      setNoticeTone("success");
      setNotice("Pedido a proveedor generado y solicitud aprobada.");

      setSupplierName("");
      setSupplierMessage("");
      setExpectedTotal("");
      setReviewComment("");

      setSupplierOptions((current) => {
        const exists = current.some((item) => item.toLowerCase() === trimmedSupplier.toLowerCase());
        if (exists) return current;
        return [...current, trimmedSupplier].sort((a, b) => a.localeCompare(b));
      });
    } catch {
      setError("No se pudo generar el pedido a proveedor.");
    }
  }

  if (auth.user?.role !== "admin") {
    return (
      <div className={styles.page}>
        <div className={styles.content}>
          <header className={styles.header}>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Aprobar Solicitudes" }]} asTitle />
            <SessionStatusBar />
          </header>
          <p className={styles.empty}>No tienes permisos para aprobar solicitudes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Aprobar Solicitudes" }]} asTitle />
            <p className={styles.subtitle}>Revision administrativa de solicitudes cargadas por operadores.</p>
          </div>
          <SessionStatusBar />
        </header>

        <section className={styles.summary}>
          <p><strong>Pendientes:</strong> {pendingRequests.length}</p>
          <p><strong>Aprobadas:</strong> {requests.filter((item) => item.status === "approved").length}</p>
          <p><strong>Rechazadas:</strong> {requests.filter((item) => item.status === "rejected").length}</p>
        </section>

        {notice ? (
          <section className={`${styles.noticeRow} ${noticeTone === "warning" ? styles.noticeRowWarning : ""}`}>
            <span>{notice}</span>
            <button
              type="button"
              className={`${styles.noticeCloseBtn} ${noticeTone === "warning" ? styles.noticeCloseBtnWarning : ""}`}
              onClick={() => setNotice("")}
            >
              Cerrar
            </button>
          </section>
        ) : null}

        <div className={styles.layout}>
          <div className={styles.listColumn}>
            <section className={styles.listCard}>
              <h2 className={styles.cardTitle}>Solicitudes Pendientes</h2>
              {loading ? (
                <p className={styles.empty}>Cargando...</p>
              ) : pendingRequests.length === 0 ? (
                <p className={styles.empty}>No hay solicitudes pendientes.</p>
              ) : (
                <div className={styles.requestList}>
                  {pendingRequests.map((item) => {
                    return (
                      <button
                        type="button"
                        key={item.id}
                        className={`${styles.requestBtn} ${selectedRequestId === item.id ? styles.requestBtnActive : ""}`}
                        onClick={() => {
                          setSelectedRequestId(item.id);
                          setSelectedHistoryRequestId(null);
                        }}
                      >
                        <div className={styles.requestTitle}>{requestTypeLabel(item.requestType)}</div>
                        <div className={styles.requestMeta}>{item.requestedBy} - {formatDateTime(item.requestedAt)}</div>
                        <div className={styles.requestSummary}>{item.description}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className={styles.listCard}>
              <h2 className={styles.cardTitle}>Historial de Solicitudes</h2>
              <div className={styles.historyFilters}>
                <select
                  className={styles.filterSelect}
                  value={historyStatusFilter}
                  onChange={(event) => setHistoryStatusFilter(event.target.value as "all" | "approved" | "rejected")}
                >
                  <option value="all">Aprobadas y rechazadas</option>
                  <option value="approved">Solo aprobadas</option>
                  <option value="rejected">Solo rechazadas</option>
                </select>
                <select
                  className={styles.filterSelect}
                  value={historyTypeFilter}
                  onChange={(event) => setHistoryTypeFilter(event.target.value as "all" | OperationRequest["requestType"])}
                >
                  <option value="all">Mercancia y solicitud</option>
                  <option value="merchandise">Mercancia</option>
                  <option value="permissions">Solicitud</option>
                </select>
              </div>

              {loading ? (
                <p className={styles.empty}>Cargando...</p>
              ) : historyRequests.length === 0 ? (
                <p className={styles.empty}>No hay historial para ese filtro.</p>
              ) : (
                <div className={styles.historyRequestList}>
                  {historyRequests.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`${styles.historyRequestCard} ${selectedHistoryRequestId === item.id ? styles.historyRequestCardActive : ""}`}
                      onClick={() => {
                        setSelectedHistoryRequestId(item.id);
                        setSelectedRequestId(null);
                      }}
                    >
                      <div className={styles.historyRequestTop}>
                        <span className={styles.requestTitle}>{requestTypeLabel(item.requestType)}</span>
                        <span className={item.status === "approved" ? styles.statusApproved : styles.statusRejected}>
                          {item.status === "approved" ? "Aprobada" : "Rechazada"}
                        </span>
                      </div>
                      <div className={styles.requestMeta}>{item.requestedBy} - {formatDateTime(item.reviewedAt || item.requestedAt)}</div>
                      <div className={styles.requestSummary}>{item.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className={styles.detailCard}>
            <h2 className={styles.cardTitle}>Detalle</h2>
            {selectedRequest ? (
              selectedRequest.requestType === "merchandise" ? (
              <div className={styles.detailBody}>
                <p><strong>Tipo:</strong> Mercancia</p>
                <p><strong>Solicitado por:</strong> {selectedRequest.requestedBy}</p>
                <p><strong>Fecha:</strong> {formatDateTime(selectedRequest.requestedAt)}</p>

                <div className={styles.field}>
                  <span>Mensaje del operador</span>
                  <p className={styles.description}>{selectedRequest.description}</p>
                </div>

                <label className={styles.field}>
                  <span>Proveedor</span>
                  <input
                    className={styles.input}
                    list="supplier-options"
                    value={supplierName}
                    onChange={(event) => setSupplierName(event.target.value)}
                    placeholder="Nombre proveedor"
                    disabled={!selectedRequestCanManage}
                  />
                  <datalist id="supplier-options">
                    {supplierOptions.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                </label>

                <label className={styles.field}>
                  <span>Peticion al proveedor</span>
                  <textarea
                    className={styles.textarea}
                    rows={8}
                    value={supplierMessage}
                    onChange={(event) => setSupplierMessage(event.target.value)}
                    placeholder="Detalle de productos a solicitar"
                    disabled={!selectedRequestCanManage}
                  />
                </label>

                <label className={styles.field}>
                  <span>Monto total esperado</span>
                  <input
                    className={styles.input}
                    type="number"
                    min={1}
                    value={expectedTotal}
                    onChange={(event) => setExpectedTotal(event.target.value)}
                    placeholder="0"
                    disabled={!selectedRequestCanManage}
                  />
                </label>

                <label className={styles.field}>
                  <span>Justificacion administrativa (opcional)</span>
                  <textarea
                    className={styles.textarea}
                    rows={4}
                    value={reviewComment}
                    onChange={(event) => setReviewComment(event.target.value)}
                    placeholder="Observaciones al aprobar o rechazar"
                    disabled={!selectedRequestCanManage}
                  />
                </label>

                {selectedRequestCanManage ? (
                  <div className={styles.actions}>
                    <button type="button" className={styles.rejectBtn} onClick={() => resolveRequest("rejected")}>
                      Rechazar
                    </button>
                    <button type="button" className={styles.approveBtn} onClick={generateSupplierOrder}>
                      Generar
                    </button>
                  </div>
                ) : (
                  <p className={styles.readOnlyHint}>Solo lectura: solicitud pendiente de otro usuario.</p>
                )}
              </div>
              ) : (
              <div className={styles.detailBody}>
                <p><strong>Tipo:</strong> Permisos</p>
                <p><strong>Solicitado por:</strong> {selectedRequest.requestedBy}</p>
                <p><strong>Fecha:</strong> {formatDateTime(selectedRequest.requestedAt)}</p>

                <div className={styles.field}>
                  <span>Mensaje del operador</span>
                  <p className={styles.description}>{selectedRequest.description}</p>
                </div>

                <label className={styles.field}>
                  <span>Tu respuesta / justificacion</span>
                  <textarea
                    className={styles.textarea}
                    rows={6}
                    value={reviewComment}
                    onChange={(event) => setReviewComment(event.target.value)}
                    placeholder="Escribe la justificacion para aprobar o rechazar"
                    disabled={!selectedRequestCanManage}
                  />
                </label>

                {selectedRequestCanManage ? (
                  <div className={styles.actions}>
                    <button type="button" className={styles.rejectBtn} onClick={() => resolveRequest("rejected")}>
                      Rechazar
                    </button>
                    <button type="button" className={styles.approveBtn} onClick={() => resolveRequest("approved")}>
                      Aprobar
                    </button>
                  </div>
                ) : (
                  <p className={styles.readOnlyHint}>Solo lectura: solicitud pendiente de otro usuario.</p>
                )}
              </div>
              )
            ) : selectedHistoryRequest ? (
              <div className={styles.detailBody}>
                <p><strong>Tipo:</strong> {requestTypeLabel(selectedHistoryRequest.requestType)}</p>
                <p><strong>Estado:</strong> {selectedHistoryRequest.status === "approved" ? "Aprobada" : "Rechazada"}</p>
                <p><strong>Solicitado por:</strong> {selectedHistoryRequest.requestedBy}</p>
                <p><strong>Fecha solicitud:</strong> {formatDateTime(selectedHistoryRequest.requestedAt)}</p>
                <p><strong>Revisado por:</strong> {selectedHistoryRequest.reviewedBy || "admin"}</p>
                <p><strong>Fecha revision:</strong> {formatDateTime(selectedHistoryRequest.reviewedAt)}</p>

                <div className={styles.field}>
                  <span>Mensaje del operador</span>
                  <p className={styles.description}>{selectedHistoryRequest.description}</p>
                </div>

                {selectedHistoryRequest.reviewComment ? (
                  <div className={styles.field}>
                    <span>Respuesta administrativa</span>
                    <p className={styles.description}>{selectedHistoryRequest.reviewComment}</p>
                  </div>
                ) : null}

                {selectedHistoryRequest.requestType === "merchandise" && selectedHistoryRequest.supplierMessage ? (
                  <div className={styles.field}>
                    <span>Peticion enviada al proveedor</span>
                    <p className={styles.description}>{selectedHistoryRequest.supplierMessage}</p>
                  </div>
                ) : null}

                {selectedHistoryRequest.supplyOrderId ? (
                  <p><strong>ID pedido a proveedor:</strong> {selectedHistoryRequest.supplyOrderId}</p>
                ) : null}
              </div>
            ) : (
              <p className={styles.empty}>Selecciona una solicitud pendiente o una del historial.</p>
            )}

            {error ? <div className={styles.errorBox}>{error}</div> : null}
          </section>
        </div>
      </div>
    </div>
  );
}

