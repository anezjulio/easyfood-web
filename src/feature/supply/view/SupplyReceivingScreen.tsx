import type React from "react";
import { useEffect, useMemo, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import { formatDateTimeAR as formatDateTime, formatMoneyARS } from "../../../shared/format/locale";
import { resolveImageUrl, uploadImageFromFile } from "../../../shared/image/image.service";
import type { SupplyOrder } from "../model/supply.types";
import { fetchSupplyOrdersApi, receiveSupplyOrderApi } from "../service/supply.api";
import styles from "./SupplyReceivingScreen.module.css";

type ReceiptItemDraftState = {
  missingQuantity: string;
  expirationDate: string;
};

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

function buildItemDraftState(order: SupplyOrder | null) {
  const next: Record<string, ReceiptItemDraftState> = {};
  if (!order) return next;

  for (const item of order.items) {
    next[item.productId] = {
      missingQuantity: String(Math.max(0, Math.trunc(Number(item.missingQuantity || 0))) || ""),
      expirationDate: item.expirationDate || "",
    };
  }

  return next;
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
  const [receiptItems, setReceiptItems] = useState<Record<string, ReceiptItemDraftState>>({});

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

  useEffect(() => {
    setReceiptItems(buildItemDraftState(selectedOrder));
  }, [selectedOrder]);

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

  const itemValidationError = useMemo(() => {
    const orderItems = selectedOrder?.items || [];
    if (!selectedOrder || orderItems.length === 0) return "";

    for (const item of orderItems) {
      const draft = receiptItems[item.productId] || { missingQuantity: "", expirationDate: "" };
      const missingQuantity = Math.max(0, Math.trunc(Number(draft.missingQuantity || 0)));
      if (!Number.isFinite(missingQuantity) || missingQuantity > item.quantity) {
        return `La cantidad faltante de ${item.productName} no es valida.`;
      }
      const receivedQuantity = item.quantity - missingQuantity;
      if (receivedQuantity > 0 && !draft.expirationDate) {
        return `Ingresa el vencimiento para ${item.productName}.`;
      }
    }

    return "";
  }, [receiptItems, selectedOrder]);

  const canConfirm =
    !!selectedOrder &&
    !isUploadingInvoice &&
    !!invoiceImageUrl &&
    (isExactAmount || isDifferentAmountValid) &&
    (isExactAmount || !!receiveCommentTrimmed) &&
    paymentTotal > 0 &&
    !itemValidationError;

  function selectOrder(orderId: string) {
    const nextOrder = pendingOrders.find((item) => item.id === orderId) || null;
    setSelectedOrderId(orderId);
    setIsExactAmount(true);
    setDifferentAmount("");
    setReceiveComment("");
    setInvoiceImageUrl("");
    setIsInvoicePreviewOpen(false);
    setReceiptItems(buildItemDraftState(nextOrder));
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

  function handlePrintOrder() {
    if (!selectedOrder || selectedOrder.items.length === 0) return;

    const popup = window.open("", "_blank", "width=900,height=700");
    if (!popup) {
      setError("No se pudo abrir la ventana de impresion.");
      return;
    }

    const rows = selectedOrder.items
      .map(
        (item) =>
          `<tr><td>${escapeHtml(item.productName)}</td><td>${escapeHtml(item.brand || "-")}</td><td>${item.barcode || "-"}</td><td style="text-align:right;">${item.quantity}</td></tr>`,
      )
      .join("");

    popup.document.write(`<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Pedido ${escapeHtml(selectedOrder.id)}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
      h1 { margin-bottom: 8px; }
      p { margin: 4px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
      th { background: #f8fafc; }
    </style>
  </head>
  <body>
    <h1>Listado de pedido ${escapeHtml(selectedOrder.id)}</h1>
    <p><strong>Proveedor:</strong> ${escapeHtml(selectedOrder.supplierName)}</p>
    <p><strong>Fecha:</strong> ${escapeHtml(formatDateTime(selectedOrder.createdAt))}</p>
    <p><strong>Total esperado:</strong> ${escapeHtml(formatMoneyARS(selectedOrder.expectedTotal))}</p>
    <table>
      <thead>
        <tr>
          <th>Producto</th>
          <th>Marca</th>
          <th>Codigo</th>
          <th>Cantidad esperada</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </body>
</html>`);
    popup.document.close();
    popup.focus();
    popup.print();
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

    if (itemValidationError) {
      setError(itemValidationError);
      return;
    }

    try {
      const updated = await receiveSupplyOrderApi(selectedOrder.id, {
        actualTotal: paymentTotal,
        isExactAmount,
        receivedBy: auth.user?.username || "operator",
        invoiceImageUrl,
        receiveComment: receiveCommentTrimmed || undefined,
        items: selectedOrder.items.map((item) => {
          const draft = receiptItems[item.productId] || { missingQuantity: "", expirationDate: "" };
          return {
            productId: item.productId,
            missingQuantity: Math.max(0, Math.trunc(Number(draft.missingQuantity || 0))),
            expirationDate: draft.expirationDate || undefined,
          };
        }),
      });

      setOrders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setIsExactAmount(true);
      setDifferentAmount("");
      setReceiveComment("");
      setInvoiceImageUrl("");
      setIsInvoicePreviewOpen(false);
      setReceiptItems({});
      setMessage(
        updated.items.length > 0
          ? "Recepcion confirmada y stock generado automaticamente."
          : "Recepcion confirmada. Si el pedido no tiene detalle, carga stock manualmente.",
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "No se pudo confirmar la recepcion del pedido.");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Recibir mercancia" }]} asTitle />
            <p className={styles.subtitle}>Confirma el pedido, imprime el listado y registra faltantes y vencimientos.</p>
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
                    className={`${styles.orderBtn} ${selectedOrderId === order.id ? styles.orderBtnActive : ""}`.trim()}
                    onClick={() => selectOrder(order.id)}
                  >
                    <div className={styles.orderTop}>
                      <div className={styles.orderSupplier}>{order.supplierName}</div>
                      <div className={styles.orderTotal}>{formatMoneyMask(order.expectedTotal)}</div>
                    </div>
                    <div className={styles.orderDescription}>
                      {order.items.length > 0 ? `${order.items.length} productos cargados.` : "Pedido sin detalle de productos."}
                    </div>
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
                  <strong>Pedido:</strong> {selectedOrder.id} - {formatDateTime(selectedOrder.createdAt)}
                </p>
                {selectedOrder.description ? (
                  <>
                    <p>
                      <strong>Observaciones:</strong>
                    </p>
                    <p className={styles.descriptionBox}>{selectedOrder.description}</p>
                  </>
                ) : null}
                <p>
                  <strong>Monto total esperado:</strong> {formatMoneyMask(selectedOrder.expectedTotal)}
                </p>
                <p>
                  <strong>Efectivo asignado al operador:</strong> {formatMoneyMask(selectedOrder.expectedTotal)}
                </p>

                {selectedOrder.items.length > 0 ? (
                  <section className={styles.itemsCard}>
                    <div className={styles.itemsHead}>
                      <h3 className={styles.subTitle}>Productos del pedido</h3>
                      <button
                        type="button"
                        className={`${styles.secondaryBtn} ${styles.printBtn}`.trim()}
                        onClick={handlePrintOrder}
                      >
                        Imprimir listado
                      </button>
                    </div>

                    <div className={styles.itemTable}>
                      <div className={styles.itemTableHead}>
                        <div>Producto</div>
                        <div>Marca</div>
                        <div className={styles.cellRight}>Esperado</div>
                        <div className={styles.cellRight}>No llego</div>
                        <div className={styles.cellRight}>Se recibe</div>
                        <div>Vencimiento</div>
                      </div>

                      {selectedOrder.items.map((item) => {
                        const draft = receiptItems[item.productId] || { missingQuantity: "", expirationDate: "" };
                        const missingQuantity = Math.max(0, Math.trunc(Number(draft.missingQuantity || 0)));
                        const safeMissing = Math.min(item.quantity, missingQuantity);
                        const receivedQuantity = Math.max(0, item.quantity - safeMissing);

                        return (
                          <div key={`${selectedOrder.id}-${item.productId}`} className={styles.itemRow}>
                            <div>
                              <strong>{item.productName}</strong>
                              <p className={styles.itemMeta}>{item.barcode || "-"}</p>
                            </div>
                            <div>{item.brand || "-"}</div>
                            <div className={styles.cellRight}>{item.quantity}</div>
                            <div>
                              <input
                                className={styles.input}
                                type="number"
                                min={0}
                                max={item.quantity}
                                value={draft.missingQuantity}
                                onChange={(event) =>
                                  setReceiptItems((current) => ({
                                    ...current,
                                    [item.productId]: {
                                      ...(current[item.productId] || { missingQuantity: "", expirationDate: "" }),
                                      missingQuantity: event.target.value,
                                    },
                                  }))
                                }
                              />
                            </div>
                            <div className={styles.cellRight}>{receivedQuantity}</div>
                            <div>
                              <input
                                className={styles.input}
                                type="date"
                                value={draft.expirationDate}
                                onChange={(event) =>
                                  setReceiptItems((current) => ({
                                    ...current,
                                    [item.productId]: {
                                      ...(current[item.productId] || { missingQuantity: "", expirationDate: "" }),
                                      expirationDate: event.target.value,
                                    },
                                  }))
                                }
                                disabled={receivedQuantity <= 0}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ) : (
                  <p className={styles.emptyInline}>
                    Este pedido no tiene detalle de productos. Si lo confirmas, el stock debera cargarse manualmente despues.
                  </p>
                )}

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

                  <div className={`${styles.differentAmountInline} ${isExactAmount ? styles.differentAmountInlineHidden : ""}`.trim()}>
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
                      aria-label="Ver factura en tamano completo"
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
