import type React from "react";
import { useEffect, useMemo, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/AuthProvider";
import { resolveImageUrl, uploadImageFromFile } from "../../../shared/image/image.service";
import type { SupplyOrder } from "../model/supply.types";
import { fetchSupplyOrdersApi, receiveSupplyOrderApi } from "../service/supply.api";
import styles from "./SupplyReceivingScreen.module.css";

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

export default function SupplyReceivingScreen() {
  const auth = useAuth();

  const [orders, setOrders] = useState<SupplyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const [isExactAmount, setIsExactAmount] = useState(true);
  const [differentAmount, setDifferentAmount] = useState("");
  const [receiveComment, setReceiveComment] = useState("");
  const [invoiceImageUrl, setInvoiceImageUrl] = useState("");
  const [isUploadingInvoice, setIsUploadingInvoice] = useState(false);
  const [isInvoicePreviewOpen, setIsInvoicePreviewOpen] = useState(false);

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
          setError("No se pudo cargar la lista de pedidos esperados.");
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

  const pendingOrders = useMemo(
    () =>
      orders
        .filter((item) => item.status === "pending")
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [orders],
  );

  useEffect(() => {
    if (!pendingOrders.length) {
      setSelectedOrderId(null);
      return;
    }
    const exists = pendingOrders.some((item) => item.id === selectedOrderId);
    if (!exists) {
      setSelectedOrderId(pendingOrders[0].id);
    }
  }, [pendingOrders, selectedOrderId]);

  const selectedOrder = useMemo(
    () => pendingOrders.find((item) => item.id === selectedOrderId) || null,
    [pendingOrders, selectedOrderId],
  );
  const maxDifferentAmount = selectedOrder ? Math.max(selectedOrder.expectedTotal - 1, 0) : 0;

  const differentAmountDigits = differentAmount.replace(/\D/g, "");
  const hasDifferentAmount = differentAmountDigits.length > 0;
  const differentAmountValue = hasDifferentAmount ? Math.trunc(Number(differentAmountDigits)) : 0;
  const isDifferentAmountValid =
    !!selectedOrder &&
    hasDifferentAmount &&
    Number.isFinite(differentAmountValue) &&
    differentAmountValue > 0 &&
    differentAmountValue < selectedOrder.expectedTotal;

  const paymentTotal = selectedOrder
    ? isExactAmount
      ? selectedOrder.expectedTotal
      : hasDifferentAmount && Number.isFinite(differentAmountValue)
        ? differentAmountValue
        : 0
    : 0;

  const receiveCommentTrimmed = receiveComment.trim();
  const remainingAmount = selectedOrder ? selectedOrder.expectedTotal - paymentTotal : 0;

  const canConfirm =
    !!selectedOrder &&
    !isUploadingInvoice &&
    !!invoiceImageUrl &&
    (isExactAmount || isDifferentAmountValid) &&
    (isExactAmount || !!receiveCommentTrimmed) &&
    paymentTotal > 0;

  function selectOrder(orderId: string) {
    setSelectedOrderId(orderId);
    setIsExactAmount(true);
    setDifferentAmount("");
    setReceiveComment("");
    setInvoiceImageUrl("");
    setIsInvoicePreviewOpen(false);
    setError("");
    setMessage("");
  }

  async function handleInvoiceChange(event: React.ChangeEvent<HTMLInputElement>) {
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
    setIsInvoicePreviewOpen(false);
    try {
      const uploadedPath = await uploadImageFromFile(file);
      setInvoiceImageUrl(uploadedPath);
      setMessage("Factura cargada correctamente.");
    } catch {
      setError("No se pudo cargar la factura.");
    } finally {
      setIsUploadingInvoice(false);
    }
  }

  async function confirmReception() {
    setError("");
    setMessage("");
    if (!selectedOrder) {
      setError("Selecciona un pedido de la lista.");
      return;
    }

    if (!isExactAmount) {
      if (!hasDifferentAmount || !Number.isFinite(differentAmountValue) || differentAmountValue <= 0) {
        setError("Ingresa un monto diferente valido.");
        return;
      }
      if (differentAmountValue >= selectedOrder.expectedTotal) {
        setError("El monto diferente debe ser menor al monto esperado.");
        return;
      }
      if (!receiveCommentTrimmed) {
        setError("Cuando el monto es diferente, debes explicar el motivo en comentarios.");
        return;
      }
    }

    if (!invoiceImageUrl) {
      setError("Carga la foto de la factura para confirmar.");
      return;
    }

    try {
      const updated = await receiveSupplyOrderApi(selectedOrder.id, {
        actualTotal: paymentTotal,
        isExactAmount,
        receivedBy: auth.user?.username || "operator",
        invoiceImageUrl,
        receiveComment: receiveCommentTrimmed || undefined,
      });

      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setIsExactAmount(true);
      setDifferentAmount("");
      setReceiveComment("");
      setInvoiceImageUrl("");
      setIsInvoicePreviewOpen(false);
      setMessage("Recepcion confirmada. Puedes cargar el stock ahora.");
    } catch {
      setError("No se pudo confirmar la recepcion del pedido.");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Recibir mercancia" }]} asTitle />
            <p className={styles.subtitle}>Selecciona el pedido esperado y confirma la recepcion con factura.</p>
          </div>
          <SessionStatusBar />
        </header>

        <div className={styles.layout}>
          <section className={styles.listCard}>
            <div className={styles.listHead}>
              <h2 className={styles.cardTitle}>Pedidos esperados</h2>
            </div>

            {loading ? (
              <p className={styles.empty}>Cargando pedidos...</p>
            ) : pendingOrders.length === 0 ? (
              <p className={styles.empty}>No hay pedidos pendientes de recepcion.</p>
            ) : (
              <div className={styles.orderList}>
                {pendingOrders.map((order) => (
                  <button
                    type="button"
                    key={order.id}
                    className={`${styles.orderBtn} ${selectedOrderId === order.id ? styles.orderBtnActive : ""}`}
                    onClick={() => selectOrder(order.id)}
                  >
                    <div className={styles.orderTop}>
                      <div className={styles.orderSupplier}>{order.supplierName}</div>
                      <div className={styles.orderTotal}>{formatMoneyMask(order.expectedTotal)}</div>
                    </div>
                    <div className={styles.orderDescription}>{order.description}</div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className={styles.detailCard}>
            <h2 className={styles.cardTitle}>Detalle de recepcion</h2>

            {!selectedOrder ? (
              <p className={styles.empty}>Selecciona un pedido pendiente.</p>
            ) : (
              <div className={styles.detailBody}>
                <p>
                  <strong>Proveedor:</strong> {selectedOrder.supplierName}
                </p>
                <p>
                  <strong>Descripcion:</strong>
                </p>
                <p className={styles.descriptionBox}>{selectedOrder.description}</p>
                <p>
                  <strong>Monto total esperado:</strong> {formatMoneyMask(selectedOrder.expectedTotal)}
                </p>
                <p>
                  <strong>Efectivo asignado al operador:</strong> {formatMoneyMask(selectedOrder.expectedTotal)}
                </p>

                <div className={styles.amountChoiceRow}>
                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={isExactAmount}
                      onChange={(event) => {
                        setIsExactAmount(event.target.checked);
                        setError("");
                        setMessage("");
                      }}
                    />
                    <span>Monto exacto</span>
                  </label>

                  <div className={`${styles.differentAmountInline} ${isExactAmount ? styles.differentAmountInlineHidden : ""}`}>
                    <span>Monto diferente</span>
                    <input
                      className={styles.input}
                      type="text"
                      inputMode="numeric"
                      value={formatMoneyMaskFromDigits(differentAmountDigits)}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/\D/g, "");
                        if (!digits) {
                          setDifferentAmount("");
                          setError("");
                          setMessage("");
                          return;
                        }
                        const numericValue = Math.trunc(Number(digits));
                        if (!Number.isFinite(numericValue)) {
                          setDifferentAmount("");
                          setError("");
                          setMessage("");
                          return;
                        }
                        if (!selectedOrder || maxDifferentAmount <= 0) {
                          setDifferentAmount("");
                          setError("");
                          setMessage("");
                          return;
                        }
                        const safeValue = Math.min(numericValue, maxDifferentAmount);
                        setDifferentAmount(String(safeValue));
                        setError("");
                        setMessage("");
                      }}
                      placeholder="$ 0"
                      aria-label="Monto diferente"
                    />
                  </div>
                </div>

                <div className={styles.amountRows}>
                  <div>
                    <span>Total a pagar:</span>
                    <strong>{formatMoneyMask(Math.max(paymentTotal, 0))}</strong>
                  </div>
                  <div>
                    <span>Monto restante:</span>
                    <strong className={remainingAmount > 0 ? styles.remainingPositive : styles.remainingZero}>
                      {formatMoneyMask(Math.max(remainingAmount, 0))}
                    </strong>
                  </div>
                </div>

                <label className={styles.field}>
                  <span>
                    Comentarios
                    {!isExactAmount ? " *" : " (opcional)"}
                  </span>
                  <textarea
                    className={styles.textarea}
                    rows={3}
                    value={receiveComment}
                    onChange={(event) => {
                      setReceiveComment(event.target.value);
                      setError("");
                      setMessage("");
                    }}
                    placeholder={
                      isExactAmount
                        ? "Comentario opcional de la recepcion"
                        : "Explica por que el monto pagado fue menor al asignado"
                    }
                  />
                </label>

                <div className={styles.field}>
                  <span>Cargar factura</span>
                  <label className={styles.uploadBtn} aria-disabled={isUploadingInvoice}>
                    {isUploadingInvoice ? "Subiendo..." : "Seleccionar imagen"}
                    <input
                      type="file"
                      accept="image/*"
                      className={styles.hiddenFileInput}
                      onChange={handleInvoiceChange}
                      disabled={isUploadingInvoice}
                    />
                  </label>
                </div>

                {invoiceImageUrl ? (
                  <div className={styles.invoicePreviewWrap}>
                    <button
                      type="button"
                      className={styles.invoicePreviewBtn}
                      onClick={() => setIsInvoicePreviewOpen(true)}
                      aria-label="Ver factura en tamaño completo"
                    >
                      <img
                        className={styles.invoiceThumb}
                        src={resolveImageUrl(invoiceImageUrl)}
                        alt="Vista previa de factura cargada"
                      />
                    </button>
                    <span className={styles.invoicePreviewHint}>Factura cargada. Haz click para ampliar.</span>
                  </div>
                ) : null}

                {error ? <div className={styles.errorBox}>{error}</div> : null}
                {message ? <div className={styles.successBox}>{message}</div> : null}

                <div className={styles.actions}>
                  <button type="button" className={styles.primaryBtn} onClick={confirmReception} disabled={!canConfirm}>
                    Confirmar recepcion
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {isInvoicePreviewOpen && invoiceImageUrl ? (
        <div className={styles.modalOverlay} onClick={() => setIsInvoicePreviewOpen(false)} role="presentation">
          <section
            className={styles.modalCard}
            role="dialog"
            aria-modal="true"
            aria-label="Factura cargada"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Factura cargada</h3>
              <button type="button" className={styles.modalCloseBtn} onClick={() => setIsInvoicePreviewOpen(false)}>
                Cerrar
              </button>
            </div>
            <img className={styles.modalImage} src={resolveImageUrl(invoiceImageUrl)} alt="Factura cargada completa" />
          </section>
        </div>
      ) : null}
    </div>
  );
}
