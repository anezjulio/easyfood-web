import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { formatDateAR, formatMoneyARS } from "../../../shared/format/locale";
import { formatPaymentMethodLabel } from "../model/sale.types";
import styles from "./SalesSummaryScreen.module.css";

type SaleSummaryItem = {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
};

type SaleSummaryState = {
  orderId: string;
  orderCode: string;
  createdAt: string;
  operator: string;
  paymentMethod: string;
  items: SaleSummaryItem[];
  total: number;
};

export default function SalesSummaryScreen() {
  const nav = useNavigate();
  const location = useLocation();
  const state = (location.state as SaleSummaryState | null) || null;

  const computedTotal = useMemo(() => {
    if (!state) return 0;
    return state.items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
  }, [state]);

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

            {state.items.map((item) => (
              <div key={item.productId} className={styles.tableRow}>
                <div>{item.productName}</div>
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
