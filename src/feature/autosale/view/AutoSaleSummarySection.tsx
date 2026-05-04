import { useState } from "react";
import { formatDateTimeAR, formatMoneyARS } from "../../../shared/format/locale";
import { createSaleReceiptApi } from "../../sale/service/sale.api";
import { formatPaymentMethodLabel } from "../../sale/model/sale.types";
import type { CheckoutSummaryState } from "./autoSale.helpers";
import styles from "./AutoSaleScreen.module.css";

export default function AutoSaleSummarySection({
  summary,
  onRestart,
}: {
  summary: CheckoutSummaryState;
  onRestart: () => void;
}) {
  const [isPrintingReceipt, setIsPrintingReceipt] = useState(false);
  const [receiptMessage, setReceiptMessage] = useState("");
  const [receiptError, setReceiptError] = useState("");

  const computedSubtotal = summary.items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);

  async function handlePrintReceipt() {
    if (summary.status !== "approved" || isPrintingReceipt) return;
    setReceiptMessage("");
    setReceiptError("");
    setIsPrintingReceipt(true);

    try {
      const created = await createSaleReceiptApi({
        orderId: summary.orderId,
        orderCode: summary.orderCode,
        invoiceId: summary.invoiceId,
        createdAt: summary.createdAt,
        operator: summary.operator,
        paymentMethod: summary.paymentMethod,
        items: summary.items,
        total: summary.total,
      });

      const printWindow = window.open("about:blank", "_blank", "width=920,height=720");
      if (!printWindow) {
        throw new Error("El navegador bloqueo la ventana de impresion. Habilita los popups para imprimir.");
      }

      printWindow.document.open();
      printWindow.document.write(created.html);
      printWindow.document.close();
      window.setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 120);

      setReceiptMessage(`Recibo guardado en ${created.filePath}.`);
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "No se pudo generar el recibo.";
      setReceiptError(message);
    } finally {
      setIsPrintingReceipt(false);
    }
  }

  return (
    <section className={styles.summaryShell}>
      <div className={styles.summaryHero}>
        <span className={`${styles.summaryStatus} ${summary.status === "approved" ? styles.statusApproved : styles.statusRejected}`}>
          {summary.status === "approved" ? "Pago aprobado" : "Pago rechazado"}
        </span>
        <h1 className={styles.summaryTitle}>
          {summary.status === "approved" ? "La compra fue confirmada." : "La compra no pudo completarse."}
        </h1>
        <p className={styles.summaryText}>
          {summary.status === "approved"
            ? "El resumen queda listo para imprimir y volver a iniciar otra compra."
            : summary.reason || "La orden fue cancelada y los productos no se descontaron del stock."}
        </p>
      </div>

      <section className={styles.summaryCard}>
        <div className={styles.metaGrid}>
          <p>
            <strong>Orden:</strong> {summary.orderCode}
          </p>
          <p>
            <strong>ID:</strong> {summary.orderId}
          </p>
          <p>
            <strong>Factura:</strong> {summary.invoiceId || "-"}
          </p>
          <p>
            <strong>Fecha:</strong> {formatDateTimeAR(summary.createdAt)}
          </p>
          <p>
            <strong>Operador:</strong> {summary.operator}
          </p>
          <p>
            <strong>Metodo de pago:</strong> {formatPaymentMethodLabel(summary.paymentMethod)}
          </p>
        </div>

        <div className={styles.summaryTable}>
          <div className={styles.summaryTableHead}>
            <div>Producto</div>
            <div className={styles.summaryCellRight}>Cant.</div>
            <div className={styles.summaryCellRight}>Precio</div>
            <div className={styles.summaryCellRight}>Subtotal</div>
          </div>

          {summary.items.map((item) => (
            <div key={item.productId} className={styles.summaryTableRow}>
              <div>{item.productName}</div>
              <div className={styles.summaryCellRight}>{item.quantity}</div>
              <div className={styles.summaryCellRight}>{formatMoneyARS(item.unitPrice)}</div>
              <div className={styles.summaryCellRight}>{formatMoneyARS(item.unitPrice * item.quantity)}</div>
            </div>
          ))}
        </div>

        <div className={styles.summaryTotals}>
          <p>
            <strong>Subtotal:</strong> {formatMoneyARS(computedSubtotal)}
          </p>
          <p>
            <strong>Total:</strong> {formatMoneyARS(summary.total)}
          </p>
        </div>
      </section>

      {summary.status === "approved" ? (
        <section className={styles.receiptCard}>
          <button type="button" className={styles.primaryBtn} onClick={handlePrintReceipt} disabled={isPrintingReceipt}>
            {isPrintingReceipt ? "Generando recibo..." : "Imprimir recibo"}
          </button>
          {receiptMessage ? <p className={styles.receiptMessage}>{receiptMessage}</p> : null}
          {receiptError ? <p className={styles.receiptError}>{receiptError}</p> : null}
        </section>
      ) : null}

      <div className={styles.summaryActions}>
        <button type="button" className={styles.primaryBtn} onClick={onRestart}>
          Iniciar otra compra
        </button>
      </div>
    </section>
  );
}
