import { useEffect, useMemo, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/AuthProvider";
import { formatMoneyARS } from "../../product/viewmodel/useProductListViewModel";
import type { SupplyOrder } from "../model/supply.types";
import {
  cancelSupplyOrderApi,
  createSupplyOrderApi,
  fetchSupplyOrdersApi,
  updateSupplyOrderApi,
} from "../service/supply.api";
import styles from "./SupplyOrdersScreen.module.css";

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

function normalize(text: string) {
  return (text || "").toLowerCase().trim();
}

export default function SupplyOrdersScreen() {
  const auth = useAuth();
  const isAdmin = auth.user?.role === "admin";
  const currentUsername = normalize(auth.user?.username || "");
  const [orders, setOrders] = useState<SupplyOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const [supplierName, setSupplierName] = useState("");
  const [description, setDescription] = useState("");
  const [expectedTotal, setExpectedTotal] = useState("");
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const list = await fetchSupplyOrdersApi();
        if (alive) {
          setOrders(list);
        }
      } catch {
        if (alive) {
          setError("No se pudo cargar la lista de pedidos a proveedores.");
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

  const sortedOrders = useMemo(() => {
    const pending = orders
      .filter((item) => item.status === "pending")
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const processed = orders
      .filter((item) => item.status !== "pending")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return [...pending, ...processed];
  }, [orders]);

  const visibleOrders = useMemo(() => {
    if (isAdmin) return sortedOrders;
    return sortedOrders.filter((item) => normalize(item.createdBy) === currentUsername);
  }, [currentUsername, isAdmin, sortedOrders]);

  function canEditPendingOrder(order: SupplyOrder) {
    return isAdmin && order.status === "pending" && normalize(order.createdBy) === currentUsername;
  }

  const pendingCount = useMemo(() => visibleOrders.filter((item) => item.status === "pending").length, [visibleOrders]);
  const editingOrder = useMemo(
    () => visibleOrders.find((item) => item.id === editingOrderId && canEditPendingOrder(item)) || null,
    [editingOrderId, visibleOrders],
  );
  const supplierOptions = useMemo(() => {
    const uniqueByKey = new Map<string, string>();
    for (const item of orders) {
      const supplier = item.supplierName.trim();
      if (!supplier) continue;
      const key = supplier.toLowerCase();
      if (!uniqueByKey.has(key)) {
        uniqueByKey.set(key, supplier);
      }
    }
    return [...uniqueByKey.values()].sort((a, b) => a.localeCompare(b));
  }, [orders]);

  useEffect(() => {
    if (!editingOrderId) return;
    if (!editingOrder) {
      setEditingOrderId(null);
      setSupplierName("");
      setDescription("");
      setExpectedTotal("");
    }
  }, [editingOrder, editingOrderId]);

  function resetForm() {
    setSupplierName("");
    setDescription("");
    setExpectedTotal("");
    setEditingOrderId(null);
    setError("");
    setMessage("");
  }

  function loadPendingInForm(order: SupplyOrder) {
    if (!canEditPendingOrder(order)) return;
    setEditingOrderId(order.id);
    setSupplierName(order.supplierName);
    setDescription(order.description);
    setExpectedTotal(String(order.expectedTotal));
    setError("");
    setMessage("");
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!isAdmin) {
      setError("Solo los administradores pueden crear pedido de mercancia.");
      return;
    }

    const supplier = supplierName.trim();
    const detail = description.trim();
    const total = Math.trunc(Number(expectedTotal));

    if (!supplier) {
      setError("Ingresa el nombre del proveedor.");
      return;
    }
    if (!detail) {
      setError("Ingresa la descripcion del pedido esperado.");
      return;
    }
    if (!Number.isFinite(total) || total <= 0) {
      setError("Ingresa un monto total esperado valido.");
      return;
    }

    try {
      if (editingOrder) {
        const updated = await updateSupplyOrderApi(editingOrder.id, {
          supplierName: supplier,
          description: detail,
          expectedTotal: total,
        });
        setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setMessage("Pedido pendiente actualizado.");
        setEditingOrderId(null);
      } else {
        const created = await createSupplyOrderApi({
          supplierName: supplier,
          description: detail,
          expectedTotal: total,
          createdBy: auth.user?.username || "operator",
        });
        setOrders((current) => [created, ...current]);
        setMessage("Pedido esperado registrado.");
      }
      setSupplierName("");
      setDescription("");
      setExpectedTotal("");
    } catch {
      setError(editingOrder ? "No se pudo actualizar el pedido pendiente." : "No se pudo registrar el pedido esperado.");
    }
  }

  async function cancelPendingOrder(order: SupplyOrder) {
    if (!canEditPendingOrder(order)) return;
    setError("");
    setMessage("");
    const confirmed = window.confirm("¿Seguro que quieres cancelar este pedido pendiente?");
    if (!confirmed) return;
    try {
      await cancelSupplyOrderApi(order.id);
      setOrders((current) => current.filter((item) => item.id !== order.id));
      if (editingOrderId === order.id) {
        setEditingOrderId(null);
        setSupplierName("");
        setDescription("");
        setExpectedTotal("");
      }
      setMessage("Pedido pendiente cancelado.");
    } catch {
      setError("No se pudo cancelar el pedido pendiente.");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Pedido mercancia" }]} asTitle />
            <p className={styles.subtitle}>Carga previa de pedidos que se esperan recibir.</p>
          </div>
          <SessionStatusBar />
        </header>

        <div className={styles.layout}>
          <section className={styles.formCard}>
            <h2 className={styles.cardTitle}>{editingOrder ? "Editar pedido pendiente" : "Nuevo pedido esperado"}</h2>

            {isAdmin ? (
              <form className={styles.form} onSubmit={onSubmit}>
                {editingOrder ? (
                  <p className={styles.editingHint}>Editando pedido pendiente de {editingOrder.supplierName}.</p>
                ) : null}
                <label className={styles.field}>
                  <span>
                    Proveedor <span className={styles.requiredMark}>*</span>
                  </span>
                  <input
                    className={styles.input}
                    list="supplier-options"
                    value={supplierName}
                    onChange={(event) => setSupplierName(event.target.value)}
                    placeholder="Nombre del proveedor o empresa"
                  />
                  <datalist id="supplier-options">
                    {supplierOptions.map((supplier) => (
                      <option key={supplier} value={supplier} />
                    ))}
                  </datalist>
                </label>

                <label className={styles.field}>
                  <span>
                    Descripcion <span className={styles.requiredMark}>*</span>
                  </span>
                  <textarea
                    className={styles.textarea}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={8}
                    placeholder="Detalle de lo esperado: productos, cantidades, observaciones"
                  />
                </label>

                <label className={styles.field}>
                  <span>
                    Monto total esperado <span className={styles.requiredMark}>*</span>
                  </span>
                  <input
                    className={styles.input}
                    type="number"
                    min={1}
                    value={expectedTotal}
                    onChange={(event) => setExpectedTotal(event.target.value)}
                    placeholder="0"
                  />
                </label>

                {error ? <div className={styles.errorBox}>{error}</div> : null}
                {message ? <div className={styles.successBox}>{message}</div> : null}

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={resetForm}
                  >
                    {editingOrder ? "Salir edicion" : "Limpiar"}
                  </button>
                  <button type="submit" className={styles.primaryBtn}>
                    {editingOrder ? "Guardar cambios" : "Guardar pedido"}
                  </button>
                </div>
              </form>
            ) : (
              <p className={styles.empty}>Solo los administradores pueden crear pedido de mercancia.</p>
            )}
          </section>

          <section className={styles.listCard}>
            <div className={styles.listHead}>
              <h2 className={styles.cardTitle}>Pedidos cargados</h2>
              <div className={styles.pendingHint}>Pendientes: {pendingCount}</div>
            </div>

            {loading ? (
              <p className={styles.empty}>Cargando pedidos...</p>
            ) : visibleOrders.length === 0 ? (
              <p className={styles.empty}>Aun no hay pedidos cargados.</p>
            ) : (
              <div className={styles.orderList}>
                {visibleOrders.map((order) => {
                  const editablePending = canEditPendingOrder(order);
                  return (
                    <article
                      key={order.id}
                      className={`${styles.orderCard} ${
                        editablePending ? styles.orderCardPendingEditable : ""
                      } ${editingOrderId === order.id ? styles.orderCardEditing : ""}`}
                      role={editablePending ? "button" : undefined}
                      tabIndex={editablePending ? 0 : undefined}
                      onClick={() => loadPendingInForm(order)}
                      onKeyDown={(event) => {
                        if (!editablePending) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          loadPendingInForm(order);
                        }
                      }}
                    >
                      <div className={styles.orderTop}>
                        <h3 className={styles.orderTitle}>{order.supplierName}</h3>
                        <div className={styles.orderActions}>
                          <span className={`${styles.badge} ${order.status === "pending" ? styles.badgePending : styles.badgeReceived}`}>
                            {order.status === "pending" ? "Pendiente" : "Recibido"}
                          </span>
                          {editablePending ? (
                            <button
                              type="button"
                              className={styles.cancelXBtn}
                              title="Cancelar pedido pendiente"
                              aria-label="Cancelar pedido pendiente"
                              onClick={(event) => {
                                event.stopPropagation();
                                void cancelPendingOrder(order);
                              }}
                            >
                              x
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <p className={styles.orderDescription}>{order.description}</p>
                      <p className={styles.orderMeta}>
                        <strong>Total esperado:</strong> {formatMoneyARS(order.expectedTotal)}
                      </p>

                      {order.status === "received" ? (
                        <>
                          <p className={styles.orderMeta}>
                            <strong>Total recibido:</strong>{" "}
                            <span className={styles.receivedAmount}>{formatMoneyARS(order.actualTotal || 0)}</span>
                          </p>
                          {(order.remainingAmount || 0) > 0 ? (
                            <p className={styles.orderMeta}>
                              <strong>Monto restante:</strong>{" "}
                              <span className={styles.remainingWarnAmount}>{formatMoneyARS(order.remainingAmount || 0)}</span>
                            </p>
                          ) : null}
                          {order.receiveComment ? (
                            <p className={styles.orderMeta}>
                              <strong>Comentarios recepcion:</strong> {order.receiveComment}
                            </p>
                          ) : null}
                        </>
                      ) : null}

                      <p className={styles.orderFoot}>
                        Cargado por {order.createdBy || "operator"} el {formatDateTime(order.createdAt)}
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
