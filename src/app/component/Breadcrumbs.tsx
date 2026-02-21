import { useNavigate } from "react-router-dom";
import styles from "./Breadcrumbs.module.css";

export type BreadcrumbItem = {
  label: string;
  to?: string;
};

export default function Breadcrumbs({
  items,
  asTitle = false,
}: {
  items: BreadcrumbItem[];
  asTitle?: boolean;
}) {
  const nav = useNavigate();

  return (
    <nav className={`${styles.nav} ${asTitle ? styles.navInline : ""}`} aria-label="Migas de pan">
      <ol className={`${styles.list} ${asTitle ? styles.listTitle : ""}`}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className={styles.item}>
              {!isLast && item.to ? (
                <button
                  type="button"
                  className={`${styles.link} ${asTitle ? styles.linkTitle : ""}`}
                  onClick={() => nav(item.to!)}
                >
                  {item.label}
                </button>
              ) : (
                <span className={styles.current}>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
