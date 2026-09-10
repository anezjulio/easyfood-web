import type { Product } from "../model/product.types";
import { resolveImageUrl } from "../../../shared/image/image.service";

function formatCategory(value?: string) {
  if (!value) return "-";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type ComboItemPreview = {
  type?: "product" | "category";
  menuProductName?: string;
  categoryName?: string;
  category?: string;
  quantity?: number;
  allowedMenuProductIds?: string[];
};

type SalesProductExtras = Product & {
  description?: string;
  menuProduct?: {
    kind?: string;
    comboItems?: ComboItemPreview[];
  };
};

function formatComboPreviewItem(item: ComboItemPreview) {
  const quantity = Math.max(1, Math.trunc(Number(item.quantity || 1)));
  if (item.type === "category") {
    const name = item.categoryName || item.category || "Categoria";
    const options = (item.allowedMenuProductIds || []).length;
    const optionsText = options ? ` (${options})` : "";
    return `${quantity}x ${formatCategory(name)} a eleccion${optionsText}`;
  }
  return `${quantity}x ${item.menuProductName || "Producto"}`;
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
  salesCompactLayout = false,
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
  salesCompactLayout?: boolean;
  existenceAlign?: "left" | "center" | "right";
  dateValue?: string;
}) {
  const salesColumnTemplate = "minmax(280px, 1fr) 120px 120px";
  const columnCount =
    2 +
    (showImageThumbnail ? 1 : 0) +
    (showBarcode ? 1 : 0) +
    (showBrand ? 1 : 0) +
    (showExistence ? 1 : 0) +
    (showCategory ? 1 : 0) +
    (showDateColumn ? 1 : 0);
  const minTableWidth = salesCompactLayout ? 560 : Math.max(showImageThumbnail ? 520 : 620, columnCount * 140);
  const isEven = rowIndex % 2 === 0;
  const baseBg = isEven ? "#f8fafc" : "white";
  const isOutOfStock = Number(product.existencia || 0) <= 0;
  const imageUrl = resolveImageUrl(product.imageUrl);
  const salesExtras = product as SalesProductExtras;
  const comboPreviewItems = salesExtras.menuProduct?.kind === "combo" ? salesExtras.menuProduct.comboItems || [] : [];

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
        gridTemplateColumns: salesCompactLayout ? salesColumnTemplate : `repeat(${columnCount}, minmax(0, 1fr))`,
        minWidth: `${minTableWidth}px`,
        background: selected ? "#e2e8f0" : baseBg,
        opacity: isOutOfStock ? 0.5 : 1,
      }}
    >
      {showImageThumbnail && !salesCompactLayout ? (
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

      {salesCompactLayout ? (
        <div style={salesProductCellStyle}>
          {imageUrl ? (
            <img src={imageUrl} alt="" style={salesImageStyle} loading="lazy" />
          ) : (
            <div style={salesImageFallbackStyle}>{product.name.slice(0, 1).toUpperCase()}</div>
          )}
          <div style={salesProductTextStyle}>
            <span style={salesProductNameStyle}>{product.name}</span>
            {salesExtras.description ? <span style={salesProductDescriptionStyle}>{salesExtras.description}</span> : null}
            {comboPreviewItems.length > 0 ? (
              <span style={salesComboItemsStyle}>{comboPreviewItems.map(formatComboPreviewItem).join(" + ")}</span>
            ) : null}
          </div>
        </div>
      ) : (
        <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {product.name}
        </div>
      )}

      {showBrand ? (
        <div style={{ textAlign: "left", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {product.brand || "-"}
        </div>
      ) : null}

      {showCategory ? (
        <div style={{ textAlign: salesCompactLayout ? "right" : "left", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {formatCategory(product.category)}
        </div>
      ) : null}

      {showExistence ? (
        <div style={{ textAlign: existenceAlign, fontWeight: 900 }}>
          {Math.trunc(Number(product.existencia || 0))}
        </div>
      ) : null}

      <div style={{ textAlign: salesCompactLayout ? "right" : "left", fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
  padding: 10,
  borderTop: "1px solid #e2e8f0",
  alignItems: "start",
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

const salesProductCellStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
};

const salesImageStyle: React.CSSProperties = {
  width: 46,
  height: 46,
  objectFit: "cover",
  border: "1px solid #e2e8f0",
  background: "#ffffff",
  display: "block",
  flex: "0 0 auto",
};

const salesImageFallbackStyle: React.CSSProperties = {
  ...salesImageStyle,
  display: "grid",
  placeItems: "center",
  color: "#0f172a",
  fontWeight: 900,
};

const salesProductTextStyle: React.CSSProperties = {
  display: "grid",
  gap: 2,
  minWidth: 0,
};

const salesProductNameStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 15,
  fontWeight: 950,
};

const salesProductDescriptionStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "#64748b",
  fontSize: 11,
  fontWeight: 700,
};

const salesComboItemsStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "#334155",
  fontSize: 11,
  fontWeight: 850,
};
