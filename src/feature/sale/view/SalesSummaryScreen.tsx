import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { formatDateAR, formatMoneyARS } from "../../../shared/format/locale";
import type { PaymentMethod } from "../model/sale.types";
import { formatPaymentMethodLabel } from "../model/sale.types";
import { createSaleReceiptApi } from "../service/sale.api";
import styles from "./SalesSummaryScreen.module.css";

type SaleSummaryItem = {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  comboItems?: Array<{ menuProductId: string; menuProductName: string; quantity: number }>;
};

type SaleSummaryState = {
  orderId: string;
  orderCode: string;
  invoiceId?: string;
  createdAt: string;
  operator: string;
  paymentMethod: string;
  items: SaleSummaryItem[];
  total: number;
};

function normalizePaymentMethod(rawValue: string): PaymentMethod {
  const value = String(rawValue || "").trim().toLowerCase();
  if (value === "efectivo") return "efectivo";
  if (value === "tarjeta debito") return "tarjeta debito";
  if (value === "tarjeta credito") return "tarjeta credito";
  if (value === "mercadopago") return "mercadopago";
  return "efectivo";
}

export default function SalesSummaryScreen() {
  const nav = useNavigate();
  const location = useLocation();
  const state = (location.state as SaleSummaryState | null) || null;
  const [isPrintingReceipt, setIsPrintingReceipt] = useState(false);
  const [receiptMessage, setReceiptMessage] = useState("");
  const [receiptError, setReceiptError] = useState("");

  const computedTotal = useMemo(() => {
    if (!state) return 0;
    return state.items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
  }, [state]);

  async function handlePrintReceipt() {
    if (!state || isPrintingReceipt) return;
    setReceiptMessage("");
    setReceiptError("");
    setIsPrintingReceipt(true);

    try {
      const created = await createSaleReceiptApi({
        orderId: state.orderId,
        orderCode: state.orderCode,
        invoiceId: state.invoiceId,
        createdAt: state.createdAt,
        operator: state.operator,
        paymentMethod: normalizePaymentMethod(state.paymentMethod),
        items: state.items,
        total: state.total,
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

  if (!state) {
    return (
      <div className={styles.page}>
        <div className={styles.content}>
          <header className={styles.header}>
            <div>
              <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Ventas", to: "/sales" }, { label: "Resumen" }]} asTitle />
              <p className={styles.subtitle}>No hay datos de venta para mostrar.</p>
            </div>
            <SessionStatusBar showSalesShortcut={false} />
          </header>
          <div className={styles.actions}>
            <button type="button" className={styles.secondaryBtn} onClick={() => nav("/sales")}>
              Volver a ventas
            </button>
            <button type="button" className={styles.primaryBtn} onClick={() => nav("/operation")}>
              Ir al menu principal
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Ventas", to: "/sales" }, { label: "Resumen" }]} asTitle />
            <p className={styles.subtitle}>Resumen de la venta realizada.</p>
          </div>
          <SessionStatusBar showSalesShortcut={false} />
        </header>

        <section className={styles.summaryCard}>
          <div className={styles.metaGrid}>
            <p><strong>Orden:</strong> {state.orderCode}</p>
            <p><strong>ID:</strong> {state.orderId}</p>
            <p><strong>Factura:</strong> {state.invoiceId || "-"}</p>
            <p><strong>Fecha:</strong> {formatDateAR(state.createdAt)}</p>
            <p><strong>Operador:</strong> {state.operator}</p>
            <p><strong>Metodo de pago:</strong> {formatPaymentMethodLabel(state.paymentMethod)}</p>
          </div>

          <div className={styles.tableWrap}>
            <div className={styles.tableHead}>
              <div>Producto</div>
              <div className={styles.cellRight}>Cant.</div>
              <div className={styles.cellRight}>Precio</div>
              <div className={styles.cellRight}>Subtotal</div>
            </div>

            {state.items.map((item, index) => (
              <div key={`${item.productId}-${index}`} className={styles.tableRow}>
                <div className={styles.productCell}>
                  <span>{item.productName}</span>
                  {item.comboItems?.length ? (
                    <div className={styles.comboItems}>
                      {item.comboItems.map((comboItem) => (
                        <span key={comboItem.menuProductId}>
                          + {comboItem.quantity > 1 ? `${comboItem.quantity} x ` : ""}{comboItem.menuProductName}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className={styles.cellRight}>{item.quantity}</div>
                <div className={styles.cellRight}>{formatMoneyARS(item.unitPrice)}</div>
                <div className={styles.cellRight}>{formatMoneyARS(item.unitPrice * item.quantity)}</div>
              </div>
            ))}
          </div>

          <div className={styles.totals}>
            <p><strong>Subtotal:</strong> {formatMoneyARS(computedTotal)}</p>
            <p><strong>Total:</strong> {formatMoneyARS(state.total)}</p>
          </div>
        </section>

        <section className={styles.receiptCard}>
          <div className={styles.receiptActions}>
            <button type="button" className={styles.primaryBtn} onClick={handlePrintReceipt} disabled={isPrintingReceipt}>
              {isPrintingReceipt ? "Generando recibo..." : "Quiere imprimir recibo"}
            </button>
            {receiptMessage ? <p className={styles.receiptMessage}>{receiptMessage}</p> : null}
            {receiptError ? <p className={styles.receiptError}>{receiptError}</p> : null}
          </div>
        </section>

        <div className={styles.actions}>
          <button type="button" className={styles.secondaryBtn} onClick={() => nav("/sales")}>
            Volver a ventas
          </button>
          <button type="button" className={styles.primaryBtn} onClick={() => nav("/operation")}>
            Ir al menu principal
          </button>
        </div>
      </div>
    </div>
  );
}
