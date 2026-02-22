import type { Product, ProductSortKey } from "../model/product.types";
import ProductRow from "./ProductRow";

type ColumnFilters = {
  name: string;
  barcode: string;
  price: string;
  createdAt: string;
  existencia?: string;
  category?: string;
};

function formatPriceMask(input: string): string {
  const digits = (input || "").replace(/\D/g, "");
  if (!digits) return "";
  const amount = Number(digits);
  const formatted = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
  return `$${formatted}`;
}

export default function ProductTable({
  products,
  loading,
  formatMoney,
  formatDate,
  selectedProductId,
  onSelectProduct,
  sortKey,
  sortDir,
  onSortChange,
  onSortClear,
  showSortFeedback = true,
  filters,
  onFilterChange,
  topMargin = 16,
  maxHeight = "min(65vh, 640px)",
  dateLabel = "Creación",
  showExistence = false,
  showDateColumn = true,
  existenceAlign = "left",
  showCategory = false,
}: {
  products: Product[];
  loading: boolean;
  formatMoney: (n: number) => string;
  formatDate: (iso: string) => string;
  selectedProductId: string | null;
  onSelectProduct: (id: string) => void;
  sortKey?: ProductSortKey;
  sortDir?: "asc" | "desc";
  onSortChange?: (key: ProductSortKey) => void;
  onSortClear?: () => void;
  showSortFeedback?: boolean;
  filters?: ColumnFilters;
  onFilterChange?: (key: keyof ColumnFilters, value: string) => void;
  topMargin?: number;
  maxHeight?: string;
  dateLabel?: string;
  showExistence?: boolean;
  showDateColumn?: boolean;
  existenceAlign?: "left" | "center" | "right";
  showCategory?: boolean;
}) {
  const columnCount = 3 + (showExistence ? 1 : 0) + (showCategory ? 1 : 0) + (showDateColumn ? 1 : 0);
  const minTableWidth = Math.max(620, columnCount * 150);
  const categoryOptions = Array.from(
    new Set(
      products
        .map((product) => (product.category || "").trim())
        .filter((category) => category.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b));
  const cardStyle: React.CSSProperties = {
    marginTop: topMargin,
    background: "white",
    borderRadius: 0,
    border: "1px solid #e2e8f0",
    maxHeight,
    overflowY: "auto",
    overflowX: "auto",
  };

  function sortIndicator(key: ProductSortKey) {
    if (!showSortFeedback || sortKey !== key || !sortDir) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  function renderHeaderCell(label: string, key: ProductSortKey, align: "left" | "center" | "right" = "left") {
    const justifySelf = align === "center" ? "center" : "start";
    if (!onSortChange) {
      return (
        <div
          style={{
            textAlign: align,
            justifySelf,
            width: "max-content",
            paddingRight: 0,
          }}
        >
          {label}
        </div>
      );
    }

    const isActive = showSortFeedback && sortKey === key;
    const alignItems = align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start";
    return (
      <div style={{ display: "flex", alignItems: "center", justifySelf, gap: 6 }}>
        <button
          type="button"
          style={{
            ...headerButtonStyle,
            ...(isActive ? headerButtonActiveStyle : null),
            textAlign: align,
            justifySelf,
            paddingRight: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: alignItems,
          }}
          onClick={() => onSortChange(key)}
          aria-label={`Ordenar por ${label}`}
        >
          {label}
          {sortIndicator(key)}
        </button>
        {isActive && onSortClear ? (
          <button
            type="button"
            style={clearSortBtnStyle}
            onClick={(e) => {
              e.stopPropagation();
              onSortClear();
            }}
            aria-label={`Quitar orden por ${label}`}
            title="Quitar orden"
          >
            x
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <section style={cardStyle}>
      <div style={{ ...headerStyle, gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`, minWidth: `${minTableWidth}px` }}>
        <div style={headerCellStyle}>
          <div style={{ textAlign: "left", justifySelf: "start", width: "max-content" }}>Codigo de barra</div>
          {filters && onFilterChange ? (
            <div style={filterInputWrapStyle}>
              <input
                value={filters.barcode}
                onChange={(e) => onFilterChange("barcode", e.target.value)}
                style={headerInputStyle}
                className="table-filter-input"
              />
                {filters.barcode ? (
                  <button
                    type="button"
                    onClick={() => onFilterChange("barcode", "")}
                    style={clearFilterBtnStyle}
                    aria-label="Limpiar filtro de codigo de barra"
                  >
                    x
                  </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div style={headerCellStyle}>
          {renderHeaderCell("Nombre", "name")}
          {filters && onFilterChange ? (
            <div style={filterInputWrapStyle}>
              <input
                value={filters.name}
                onChange={(e) => onFilterChange("name", e.target.value)}
                style={headerInputStyle}
                className="table-filter-input"
              />
              {filters.name ? (
                <button
                  type="button"
                  onClick={() => onFilterChange("name", "")}
                  style={clearFilterBtnStyle}
                  aria-label="Limpiar filtro de nombre"
                >
                  x
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {showCategory ? (
          <div style={headerCellStyle}>
            {renderHeaderCell("Categoria", "category")}
            {filters && onFilterChange ? (
              <div style={filterInputWrapStyle}>
                <select
                  value={filters.category || ""}
                  onChange={(e) => onFilterChange("category", e.target.value)}
                  style={headerSelectStyle}
                  className="table-filter-input"
                >
                  <option value="">Todas</option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                {filters.category ? (
                  <button
                    type="button"
                    onClick={() => onFilterChange("category", "")}
                    style={clearFilterBtnStyle}
                    aria-label="Limpiar filtro de categoria"
                  >
                    x
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {showExistence ? (
          <div style={headerCellStyle}>
            {renderHeaderCell("Existencia", "existencia", existenceAlign)}
            {filters && onFilterChange ? (
              <div style={filterInputWrapStyle}>
                <input
                  value={filters.existencia || ""}
                  onChange={(e) => onFilterChange("existencia", e.target.value)}
                  style={{ ...headerInputStyle, textAlign: existenceAlign }}
                  inputMode="numeric"
                  className="table-filter-input"
                />
                {filters.existencia ? (
                  <button
                    type="button"
                    onClick={() => onFilterChange("existencia", "")}
                    style={clearFilterBtnStyle}
                    aria-label="Limpiar filtro de existencia"
                  >
                    x
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={headerCellStyle}>
          {renderHeaderCell("Precio", "price")}
          {filters && onFilterChange ? (
            <div style={filterInputWrapStyle}>
              <input
                value={filters.price}
                onChange={(e) => onFilterChange("price", formatPriceMask(e.target.value))}
                style={headerInputStyle}
                inputMode="numeric"
                className="table-filter-input"
              />
              {filters.price ? (
                <button
                  type="button"
                  onClick={() => onFilterChange("price", "")}
                  style={clearFilterBtnStyle}
                  aria-label="Limpiar filtro de precio"
                >
                  x
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {showDateColumn ? (
          <div style={headerCellStyle}>
            {renderHeaderCell(dateLabel, "createdAt")}
            {filters && onFilterChange ? (
              <div style={dateFilterWrapStyle}>
                <input
                  type="date"
                  value={filters.createdAt}
                  onChange={(e) => onFilterChange("createdAt", e.target.value)}
                  style={headerDateInputStyle}
                  className="table-filter-input table-date-filter-input"
                />
                {filters.createdAt ? (
                  <button
                    type="button"
                    onClick={() => onFilterChange("createdAt", "")}
                    style={clearDateBtnStyle}
                    aria-label="Limpiar filtro de fecha"
                  >
                    x
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div style={{ padding: 18, color: "#475569" }}>Cargando…</div>
      ) : products.length === 0 ? (
        <div style={{ padding: 18, color: "#475569" }}>No hay productos.</div>
      ) : (
        products.map((p, index) => (
          <ProductRow
            key={p.id}
            product={p}
            formatMoney={formatMoney}
            formatDate={formatDate}
            selected={p.id === selectedProductId}
            onClick={() => onSelectProduct(p.id)}
            rowIndex={index}
            showExistence={showExistence}
            showCategory={showCategory}
            showDateColumn={showDateColumn}
            existenceAlign={existenceAlign}
            dateValue={p.ultimoIngreso || p.createdAt}
          />
        ))
      )}
    </section>
  );
}

const headerStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  padding: 14,
  fontWeight: 900,
  background: "#f1f5f9",
  position: "sticky",
  top: 0,
  zIndex: 1,
};

const headerCellStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  alignItems: "start",
  minWidth: 0,
};

const headerButtonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 0,
  background: "transparent",
  padding: 0,
  width: "max-content",
  fontWeight: 900,
  fontSize: "inherit",
  color: "inherit",
  cursor: "pointer",
  outline: "none",
  boxShadow: "none",
};

const headerInputStyle: React.CSSProperties = {
  height: 32,
  width: "min(160px, 100%)",
  boxSizing: "border-box",
  padding: "0 4px",
  lineHeight: "32px",
  border: "none",
  borderBottom: "1px solid #0f172a",
  borderRadius: 0,
  outline: "none",
  background: "transparent",
  fontSize: 14,
};

const headerDateInputStyle: React.CSSProperties = {
  ...headerInputStyle,
  borderBottom: "none",
  paddingRight: 4,
};

const headerSelectStyle: React.CSSProperties = {
  ...headerInputStyle,
  borderBottom: "none",
  paddingLeft: 0,
  paddingRight: 0,
  margin: 0,
  fontFamily: "inherit",
  fontWeight: 400,
};

const filterInputWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  width: "min(160px, 100%)",
  justifyContent: "flex-start",
};

const dateFilterWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  width: "min(160px, 100%)",
  justifyContent: "flex-start",
};

const clearFilterBtnStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  padding: 0,
  fontSize: 14,
  fontWeight: 900,
  cursor: "pointer",
  color: "#334155",
  lineHeight: 1,
};

const clearDateBtnStyle: React.CSSProperties = clearFilterBtnStyle;
const clearSortBtnStyle: React.CSSProperties = clearFilterBtnStyle;

const headerButtonActiveStyle: React.CSSProperties = {
  textDecoration: "underline",
  textUnderlineOffset: 4,
  color: "#0f172a",
};
