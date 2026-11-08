import { Link } from "react-router-dom";
import styles from "./StockNavigation.module.css";

export default function StockNavigation({ showSections = false }: { showSections?: boolean }) {
  return <nav className={styles.links} aria-label="Navegacion de stock">
    {showSections ? <>
      <Link to="/ingredients">Ver ingredientes</Link>
      <Link to="/stock?tab=products">Ver productos</Link>
      <Link to="/inventory">Ver inventario</Link>
    </> : <Link to="/stock/ingredients">Cargar stock</Link>}
  </nav>;
}
