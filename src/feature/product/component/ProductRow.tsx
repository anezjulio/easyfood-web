import type { Product } from "../model/product.types";

export default function ProductRow({
  product,
  formatMoney,
  formatDate,
  selected,
  onClick,
  onDoubleClick,
  rowIndex,
  showExistence = false,
  showBrand = true,
  showCategory = false,
  showDateColumn = true,
  existenceAlign = "left",
  dateValue,
}: {
  product: Product;
  formatMoney: (n: number) => string;
  formatDate: (iso: string) => string;
  selected: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  rowIndex: number;
  showExistence?: boolean;
  showBrand?: boolean;
  showCategory?: boolean;
  showDateColumn?: boolean;
  existenceAlign?: "left" | "center" | "right";
  dateValue?: string;
}) {
  const columnCount = 3 + (showBrand ? 1 : 0) + (showExistence ? 1 : 0) + (showCategory ? 1 : 0) + (showDateColumn ? 1 : 0);
  const minTableWidth = Math.max(620, columnCount * 150);
  const isEven = rowIndex % 2 === 0;
  const baseBg = isEven ? "#f8fafc" : "white";
  const isOutOfStock = Number(product.existencia || 0) <= 0;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onClick}
      onMouseDown={(event) => event.preventDefault()}
      onDoubleClick={onDoubleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      style={{
        ...rowStyle,
        gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
        minWidth: `${minTableWidth}px`,
        background: selected ? "#e2e8f0" : baseBg,
        opacity: isOutOfStock ? 0.5 : 1,
      }}
    >
      <div style={{ textAlign: "left", color: "#334155", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {product.barcode || "-"}
      </div>

      <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {product.name}
      </div>

      {showBrand ? (
        <div style={{ textAlign: "left", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {product.brand || "-"}
        </div>
      ) : null}

      {showCategory ? (
        <div style={{ textAlign: "left", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {product.category || "-"}
        </div>
      ) : null}

      {showExistence ? (
        <div style={{ textAlign: existenceAlign, fontWeight: 900 }}>
          {Math.trunc(Number(product.existencia || 0))}
        </div>
      ) : null}

      <div style={{ textAlign: "left", fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {formatMoney(product.price)}
      </div>

      {showDateColumn ? (
        <div style={{ textAlign: "left", color: "#475569", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {formatDate(dateValue || product.createdAt)}
        </div>
      ) : null}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  padding: 14,
  borderTop: "1px solid #e2e8f0",
  alignItems: "center",
  cursor: "pointer",
  userSelect: "none",
  WebkitUserSelect: "none",
};
