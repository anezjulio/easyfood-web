import { useEffect, useMemo, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import { formatDateTimeAR as formatDateTime } from "../../../shared/format/locale";
import MerchandiseRequestEditor from "../component/MerchandiseRequestEditor";
import RequestItemsTable from "../component/RequestItemsTable";
import type { OperationRequest, OperationRequestItem } from "../model/request.types";
import { fetchOperationRequestsApi, updateOperationRequestStatusApi } from "../service/request.api";
import { createSupplyOrderApi, fetchSupplyOrdersApi } from "../../supply/service/supply.api";
import styles from "./ApproveRequestsScreen.module.css";

type Tab = "pending" | "history";

function requestTypeLabel(value: OperationRequest["requestType"]) {
  return value === "merchandise" ? "Mercancia" : "Permisos";
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

export default function ApproveRequestsScreen() {
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("pending");
  const [requests, setRequests] = useState<OperationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedHistoryRequestId, setSelectedHistoryRequestId] = useState<string | null>(null);

  const [supplierName, setSupplierName] = useState("");
  const [supplierMessage, setSupplierMessage] = useState("");
  const [expectedTotal, setExpectedTotal] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [editableItems, setEditableItems] = useState<OperationRequestItem[]>([]);
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
    if (!pendingRequests.length) {
      setSelectedRequestId(null);
      return;
    }
    const exists = pendingRequests.some((item) => item.id === selectedRequestId);
    if (!exists) {
      setSelectedRequestId(pendingRequests[0].id);
    }
  }, [pendingRequests, selectedRequestId]);

  useEffect(() => {
    if (!selectedHistoryRequestId && historyRequests.length) {
      setSelectedHistoryRequestId(historyRequests[0].id);
      return;
    }
    if (selectedHistoryRequestId && !historyRequests.some((item) => item.id === selectedHistoryRequestId)) {
      setSelectedHistoryRequestId(historyRequests[0]?.id || null);
    }
  }, [historyRequests, selectedHistoryRequestId]);

  const selectedRequest = useMemo(
    () => pendingRequests.find((item) => item.id === selectedRequestId) || null,
    [pendingRequests, selectedRequestId],
  );

  const selectedHistoryRequest = useMemo(
    () => historyRequests.find((item) => item.id === selectedHistoryRequestId) || null,
    [historyRequests, selectedHistoryRequestId],
  );

  useEffect(() => {
    if (!selectedRequest) {
      setSupplierName("");
      setSupplierMessage("");
      setExpectedTotal("");
      setReviewComment("");
      setEditableItems([]);
      return;
    }
    setSupplierName("");
    setSupplierMessage(selectedRequest.supplierMessage || "");
    setExpectedTotal("");
    setReviewComment(selectedRequest.reviewComment || "");
    setEditableItems(selectedRequest.items || []);
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
        {
          reviewComment: trimmedComment || undefined,
          items: selectedRequest.requestType === "merchandise" ? toItemDrafts(editableItems) : undefined,
        },
      );
      setRequests((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setNoticeTone(nextStatus === "approved" ? "success" : "warning");
      setNotice(nextStatus === "approved" ? "Solicitud aprobada." : "Solicitud rechazada.");
      setReviewComment("");
      setEditableItems([]);
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
    if (editableItems.length === 0) {
      setError("Agrega al menos un producto a la solicitud antes de generar el pedido.");
      return;
    }

    try {
      const createdOrder = await createSupplyOrderApi({
        supplierName: trimmedSupplier,
        description: trimmedSupplierMessage,
        expectedTotal: total,
        items: toItemDrafts(editableItems),
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
          items: toItemDrafts(editableItems),
        },
      );

      setRequests((current) => current.map((item) => (item.id === updatedRequest.id ? updatedRequest : item)));
      setNoticeTone("success");
      setNotice("Pedido a proveedor generado y solicitud aprobada.");

      setSupplierName("");
      setSupplierMessage("");
      setExpectedTotal("");
      setReviewComment("");
      setEditableItems([]);

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

        {notice ? (
          <section className={`${styles.noticeRow} ${noticeTone === "warning" ? styles.noticeRowWarning : ""}`.trim()}>
            <span>{notice}</span>
            <button
              type="button"
              className={`${styles.noticeCloseBtn} ${noticeTone === "warning" ? styles.noticeCloseBtnWarning : ""}`.trim()}
              onClick={() => setNotice("")}
            >
              Cerrar
            </button>
          </section>
        ) : null}

        {error ? <div className={styles.errorBox}>{error}</div> : null}

        <section className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "pending" ? styles.tabBtnActive : ""}`.trim()}
            onClick={() => setActiveTab("pending")}
          >
            Pendientes
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "history" ? styles.tabBtnActive : ""}`.trim()}
            onClick={() => setActiveTab("history")}
          >
            Historial
          </button>
        </section>

        {activeTab === "pending" ? (
          <div className={styles.pendingLayout}>
            <section className={`${styles.listCard} ${styles.pendingListCard}`.trim()}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>Solicitudes Pendientes: {pendingRequests.length}</h2>
                  <p className={styles.cardSubtitle}>Selecciona una solicitud para revisarla o convertirla en pedido.</p>
                </div>
              </div>

              {loading ? (
                <p className={styles.empty}>Cargando...</p>
              ) : pendingRequests.length === 0 ? (
                <p className={styles.empty}>No hay solicitudes pendientes.</p>
              ) : (
                <div className={`${styles.requestList} ${styles.pendingRequestList}`.trim()}>
                  {pendingRequests.map((item) => {
                    const totalUnits = (item.items || []).reduce((acc, product) => acc + Math.max(0, Math.trunc(product.quantity)), 0);
                    return (
                      <button
                        type="button"
                        key={item.id}
                        className={`${styles.requestBtn} ${selectedRequestId === item.id ? styles.requestBtnActive : ""}`.trim()}
                        onClick={() => setSelectedRequestId(item.id)}
                      >
                        <div className={styles.requestTop}>
                          <span className={styles.requestTitle}>{requestTypeLabel(item.requestType)}</span>
                          <span className={styles.requestBadge}>Pendiente</span>
                        </div>
                        <div className={styles.requestMeta}>{item.requestedBy} - {formatDateTime(item.requestedAt)}</div>
                        <div className={styles.requestSummary}>{item.description}</div>
                        {item.requestType === "merchandise" ? (
                          <div className={styles.requestInfoRow}>
                            <span>{(item.items || []).length} productos</span>
                            <span>{totalUnits} unidades</span>
                            <span>{summarizeRequestedProducts(item.items || [])}</span>
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className={styles.detailCard}>
              <h2 className={styles.cardTitle}>Detalle</h2>
              {selectedRequest ? (
                selectedRequest.requestType === "merchandise" ? (
                  <div className={styles.detailBody}>
                    <div className={styles.detailIntroGrid}>
                      <div className={styles.infoPanel}>
                        <div className={styles.detailSummary}>
                          <p><strong>Tipo:</strong> Mercancia</p>
                          <p><strong>Solicitado por:</strong> {selectedRequest.requestedBy}</p>
                          <p><strong>Fecha:</strong> {formatDateTime(selectedRequest.requestedAt)}</p>
                          <p><strong>Productos cargados:</strong> {editableItems.length}</p>
                        </div>
                      </div>

                      <div className={styles.field}>
                        <span>Mensaje del operador</span>
                        <p className={styles.description}>{selectedRequest.description}</p>
                      </div>
                    </div>

                    <div className={styles.merchandiseFormCard}>
                      <div className={styles.formGrid}>
                        <label className={styles.field}>
                          <span>Proveedor</span>
                          <input
                            className={styles.input}
                            list="supplier-options"
                            value={supplierName}
                            onChange={(event) => setSupplierName(event.target.value)}
                            placeholder="Nombre proveedor"
                          />
                          <datalist id="supplier-options">
                            {supplierOptions.map((item) => (
                              <option key={item} value={item} />
                            ))}
                          </datalist>
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
                          />
                        </label>
                      </div>

                      <label className={styles.field}>
                        <span>Peticion al proveedor</span>
                        <textarea
                          className={styles.textarea}
                          rows={5}
                          value={supplierMessage}
                          onChange={(event) => setSupplierMessage(event.target.value)}
                          placeholder="Observaciones del pedido a proveedor"
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
                        />
                      </label>
                    </div>

                    <MerchandiseRequestEditor
                      items={editableItems}
                      onChange={(nextItems) => {
                        setEditableItems(nextItems);
                        setError("");
                        setNotice("");
                      }}
                      title="Productos de la solicitud"
                      layoutMode="split"
                    />

                    <div className={styles.actions}>
                      <button type="button" className={styles.rejectBtn} onClick={() => void resolveRequest("rejected")}>
                        Rechazar
                      </button>
                      <button type="button" className={styles.approveBtn} onClick={() => void generateSupplierOrder()}>
                        Generar pedido
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.detailBody}>
                    <div className={styles.detailSummary}>
                      <p><strong>Tipo:</strong> Permisos</p>
                      <p><strong>Solicitado por:</strong> {selectedRequest.requestedBy}</p>
                      <p><strong>Fecha:</strong> {formatDateTime(selectedRequest.requestedAt)}</p>
                    </div>

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
                      />
                    </label>

                    <div className={styles.actions}>
                      <button type="button" className={styles.rejectBtn} onClick={() => void resolveRequest("rejected")}>
                        Rechazar
                      </button>
                      <button type="button" className={styles.approveBtn} onClick={() => void resolveRequest("approved")}>
                        Aprobar
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <p className={styles.empty}>Selecciona una solicitud pendiente.</p>
              )}
            </section>
          </div>
        ) : (
          <div className={styles.layout}>
            <section className={styles.listCard}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>Historial de solicitudes</h2>
                  <p className={styles.cardSubtitle}>Filtra por estado o tipo y revisa el detalle resuelto.</p>
                </div>
              </div>

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
                  <option value="all">Mercancia y permisos</option>
                  <option value="merchandise">Mercancia</option>
                  <option value="permissions">Permisos</option>
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
                      className={`${styles.historyRequestCard} ${selectedHistoryRequestId === item.id ? styles.historyRequestCardActive : ""}`.trim()}
                      onClick={() => setSelectedHistoryRequestId(item.id)}
                    >
                      <div className={styles.requestTop}>
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

            <section className={styles.detailCard}>
              <h2 className={styles.cardTitle}>Detalle de historial</h2>
              {selectedHistoryRequest ? (
                <div className={styles.detailBody}>
                  <div className={styles.detailSummary}>
                    <p><strong>Tipo:</strong> {requestTypeLabel(selectedHistoryRequest.requestType)}</p>
                    <p><strong>Estado:</strong> {selectedHistoryRequest.status === "approved" ? "Aprobada" : "Rechazada"}</p>
                    <p><strong>Solicitado por:</strong> {selectedHistoryRequest.requestedBy}</p>
                    <p><strong>Fecha solicitud:</strong> {formatDateTime(selectedHistoryRequest.requestedAt)}</p>
                    <p><strong>Revisado por:</strong> {selectedHistoryRequest.reviewedBy || "admin"}</p>
                    <p><strong>Fecha revision:</strong> {formatDateTime(selectedHistoryRequest.reviewedAt)}</p>
                  </div>

                  <div className={styles.field}>
                    <span>Mensaje del operador</span>
                    <p className={styles.description}>{selectedHistoryRequest.description}</p>
                  </div>

                  {selectedHistoryRequest.requestType === "merchandise" && (selectedHistoryRequest.items || []).length > 0 ? (
                    <RequestItemsTable
                      items={selectedHistoryRequest.items || []}
                      title="Productos solicitados"
                      helperText="Vista historica de la solicitud resuelta."
                    />
                  ) : null}

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
                    <p className={styles.descriptionMuted}>
                      <strong>ID pedido a proveedor:</strong> {selectedHistoryRequest.supplyOrderId}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className={styles.empty}>Selecciona una solicitud del historial.</p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
