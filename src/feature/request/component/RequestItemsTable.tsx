import type { OperationRequestItem } from "../model/request.types";
import styles from "./RequestItemsTable.module.css";

export default function RequestItemsTable({
  items,
  editable = false,
  title = "Productos solicitados",
  helperText,
  emptyMessage = "No hay productos cargados.",
  footer,
  onIncrease,
  onDecrease,
  onQuantityChange,
  onRemove,
}: {
  items: OperationRequestItem[];
  editable?: boolean;
  title?: string;
  helperText?: string;
  emptyMessage?: string;
  footer?: React.ReactNode;
  onIncrease?: (productId: string) => void;
  onDecrease?: (productId: string) => void;
  onQuantityChange?: (productId: string, value: string) => void;
  onRemove?: (productId: string) => void;
}) {
  const totalUnits = items.reduce((acc, item) => acc + Math.max(0, Math.trunc(item.quantity)), 0);

  return (
    <section className={styles.card}>
      <div className={styles.head}>
        <div>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.meta}>
            {items.length} productos | {totalUnits} unidades
          </p>
        </div>
        {helperText ? <span className={styles.helperText}>{helperText}</span> : null}
      </div>

      <div className={styles.tableCard}>
        <div className={`${styles.tableHead} ${editable ? styles.tableHeadEditable : ""}`.trim()}>
          <div>Nombre</div>
          <div>Marca</div>
          <div>Categoria</div>
          <div>Codigo</div>
          <div className={styles.cellCenter}>Cantidad</div>
          {editable ? <div className={styles.cellRight}>Acciones</div> : null}
        </div>

        <div className={styles.tableBody}>
          {items.length === 0 ? (
            <p className={styles.empty}>{emptyMessage}</p>
          ) : (
            items.map((item, index) => (
              <div
                key={item.productId}
                className={`${styles.row} ${editable ? styles.rowEditable : ""} ${index % 2 === 0 ? styles.rowOdd : ""}`.trim()}
              >
                <div className={styles.nameCell}>{item.productName}</div>
                <div className={styles.nameCell}>{item.brand || "-"}</div>
                <div className={styles.categoryCell}>{item.category || "vivere"}</div>
                <div className={styles.codeCell}>{item.barcode || "-"}</div>
                <div className={styles.quantityCell}>
                  {editable ? (
                    <div className={styles.quantityStepper}>
                      <button
                        type="button"
                        className={styles.stepBtn}
                        onClick={() => onDecrease?.(item.productId)}
                        aria-label={`Quitar una unidad de ${item.productName}`}
                      >
                        -
                      </button>
                      <input
                        className={styles.stepInput}
                        type="number"
                        min={1}
                        value={String(item.quantity)}
                        onChange={(event) => onQuantityChange?.(item.productId, event.target.value)}
                        aria-label={`Cantidad solicitada para ${item.productName}`}
                      />
                      <button
                        type="button"
                        className={styles.stepBtn}
                        onClick={() => onIncrease?.(item.productId)}
                        aria-label={`Agregar una unidad de ${item.productName}`}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <span className={styles.quantityBadge}>x{item.quantity}</span>
                  )}
                </div>
                {editable ? (
                  <div className={styles.actionsCell}>
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() => onRemove?.(item.productId)}
                      aria-label={`Eliminar ${item.productName} de la solicitud`}
                    >
                      Quitar
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>

      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </section>
  );
}
