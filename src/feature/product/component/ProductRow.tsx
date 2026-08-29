import type { Product } from "../model/product.types";
import { resolveImageUrl } from "../../../shared/image/image.service";

function formatCategory(value?: string) {
  if (!value) return "-";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

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
  showBarcode = true,
  showImageThumbnail = false,
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
  showBarcode?: boolean;
  showImageThumbnail?: boolean;
  showCategory?: boolean;
  showDateColumn?: boolean;
  existenceAlign?: "left" | "center" | "right";
  dateValue?: string;
}) {
  const columnCount =
    2 +
    (showImageThumbnail ? 1 : 0) +
    (showBarcode ? 1 : 0) +
    (showBrand ? 1 : 0) +
    (showExistence ? 1 : 0) +
    (showCategory ? 1 : 0) +
    (showDateColumn ? 1 : 0);
  const minTableWidth = Math.max(showImageThumbnail ? 520 : 620, columnCount * 140);
  const isEven = rowIndex % 2 === 0;
  const baseBg = isEven ? "#f8fafc" : "white";
  const isOutOfStock = Number(product.existencia || 0) <= 0;
  const imageUrl = resolveImageUrl(product.imageUrl);

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
      {showImageThumbnail ? (
        <div style={imageCellStyle}>
          {imageUrl ? (
            <img src={imageUrl} alt="" style={imageStyle} loading="lazy" />
          ) : (
            <div style={imageFallbackStyle}>{product.name.slice(0, 1).toUpperCase()}</div>
          )}
        </div>
      ) : null}

      {showBarcode ? (
        <div style={{ textAlign: "left", color: "#334155", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {product.barcode || "-"}
        </div>
      ) : null}

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
          {formatCategory(product.category)}
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
  padding: 12,
  borderTop: "1px solid #e2e8f0",
  alignItems: "center",
  cursor: "pointer",
  userSelect: "none",
  WebkitUserSelect: "none",
};

const imageCellStyle: React.CSSProperties = {
  width: 58,
  height: 58,
};

const imageStyle: React.CSSProperties = {
  width: 58,
  height: 58,
  objectFit: "cover",
  border: "1px solid #e2e8f0",
  background: "#ffffff",
  display: "block",
};

const imageFallbackStyle: React.CSSProperties = {
  ...imageStyle,
  display: "grid",
  placeItems: "center",
  color: "#0f172a",
  fontWeight: 900,
};
