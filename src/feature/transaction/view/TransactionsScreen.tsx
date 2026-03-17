import { useEffect, useMemo, useState } from "react";
import Breadcrumbs from "../../../app/component/Breadcrumbs";
import SessionStatusBar from "../../../app/component/SessionStatusBar";
import { useAuth } from "../../../app/provider/useAuth";
import { formatDateTimeAR as formatDateTime, formatMoneyARS } from "../../../shared/format/locale";
import type { FinancialAccount, FinancialDirection, FinancialTransaction, FinancialTransactionType } from "../model/transaction.types";
import { fetchFinancialAccountsApi, fetchFinancialTransactionsApi } from "../service/transaction.api";
import styles from "./TransactionsScreen.module.css";

const DEFAULT_ACCOUNT_ID = "account-cash-local";

function normalizeText(value: string) {
  return String(value || "").trim().toLowerCase();
}

export default function TransactionsScreen() {
  const auth = useAuth();
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState(DEFAULT_ACCOUNT_ID);
  const [directionFilter, setDirectionFilter] = useState<"all" | FinancialDirection>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | FinancialTransactionType>("all");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [accountList, transactionList] = await Promise.all([
          fetchFinancialAccountsApi(),
          fetchFinancialTransactionsApi(),
        ]);
        if (!alive) return;
        setAccounts(accountList);
        setTransactions(transactionList);
      } catch {
        if (!alive) return;
        setError("No se pudieron cargar las transacciones.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (accounts.length === 0) return;
    if (accountFilter === "all" || accounts.some((item) => item.id === accountFilter)) return;
    const fallbackAccount = accounts.find((item) => item.id === DEFAULT_ACCOUNT_ID) || accounts[0];
    setAccountFilter(fallbackAccount?.id || "all");
  }, [accountFilter, accounts]);

  const accountTabs = useMemo(() => {
    const sorted = [...accounts].sort((a, b) => {
      if (a.id === DEFAULT_ACCOUNT_ID) return -1;
      if (b.id === DEFAULT_ACCOUNT_ID) return 1;
      return a.name.localeCompare(b.name);
    });
    return [{ id: "all", name: "Todas" }, ...sorted];
  }, [accounts]);

  const visibleTransactions = useMemo(() => {
    const query = normalizeText(search);
    return transactions.filter((item) => {
      if (accountFilter !== "all" && item.accountId !== accountFilter) return false;
      if (directionFilter !== "all" && item.direction !== directionFilter) return false;
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (!query) return true;
      return normalizeText(
        `${item.title} ${item.description} ${item.referenceId} ${item.referenceModule} ${item.accountName} ${item.actor || ""}`,
      ).includes(query);
    });
  }, [accountFilter, directionFilter, search, transactions, typeFilter]);

  const totalIn = useMemo(
    () => visibleTransactions.filter((item) => item.direction === "in").reduce((acc, item) => acc + item.amount, 0),
    [visibleTransactions],
  );
  const totalOut = useMemo(
    () => visibleTransactions.filter((item) => item.direction === "out").reduce((acc, item) => acc + item.amount, 0),
    [visibleTransactions],
  );

  if (auth.user?.role !== "admin") {
    return (
      <div className={styles.page}>
        <div className={styles.content}>
          <header className={styles.header}>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Transacciones" }]} asTitle />
            <SessionStatusBar />
          </header>
          <p className={styles.empty}>No tienes permisos para ver transacciones.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <Breadcrumbs items={[{ label: "Menu", to: "/operation" }, { label: "Transacciones" }]} asTitle />
            <p className={styles.subtitle}>Listado consolidado de entradas y salidas de dinero del sistema.</p>
          </div>
          <SessionStatusBar />
        </header>

        <section className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Transacciones visibles</span>
            <strong className={styles.summaryValue}>{visibleTransactions.length}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Ingresos</span>
            <strong className={`${styles.summaryValue} ${styles.summaryValueGreen}`}>{formatMoneyARS(totalIn)}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Egresos</span>
            <strong className={`${styles.summaryValue} ${styles.summaryValueRed}`}>{formatMoneyARS(totalOut)}</strong>
          </article>
        </section>

        <section className={styles.accountTabs}>
          {accountTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.accountTabBtn} ${accountFilter === item.id ? styles.accountTabBtnActive : ""}`.trim()}
              onClick={() => setAccountFilter(item.id)}
            >
              {item.name}
            </button>
          ))}
        </section>

        <section className={styles.filters}>
          <input
            className={styles.input}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por titulo, cuenta, modulo o referencia"
          />
          <select
            className={styles.input}
            value={directionFilter}
            onChange={(event) => setDirectionFilter(event.target.value as "all" | FinancialDirection)}
          >
            <option value="all">Entradas y salidas</option>
            <option value="in">Entrada</option>
            <option value="out">Salida</option>
          </select>
          <select
            className={styles.input}
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as "all" | FinancialTransactionType)}
          >
            <option value="all">Todos los tipos</option>
            {[...new Set(transactions.map((item) => item.type))].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </section>

        <section className={styles.listCard}>
          {loading ? (
            <p className={styles.empty}>Cargando transacciones...</p>
          ) : error ? (
            <p className={styles.empty}>{error}</p>
          ) : visibleTransactions.length === 0 ? (
            <p className={styles.empty}>No hay transacciones para mostrar.</p>
          ) : (
            <div className={styles.list}>
              {visibleTransactions.map((item) => (
                <article key={item.id} className={styles.item}>
                  <div className={styles.itemTop}>
                    <div>
                      <strong className={styles.itemTitle}>{item.title}</strong>
                      <p className={styles.itemMeta}>
                        {formatDateTime(item.createdAt)} | {item.accountName} | {item.referenceModule}:{item.referenceId}
                      </p>
                    </div>
                    <strong className={item.direction === "in" ? styles.amountGreen : styles.amountRed}>
                      {item.direction === "in" ? "+" : "-"}
                      {formatMoneyARS(item.amount)}
                    </strong>
                  </div>
                  <p className={styles.itemDescription}>{item.description}</p>
                  <p className={styles.itemMeta}>
                    {item.entryKind.toUpperCase()} | {item.direction === "in" ? "Entrada" : "Salida"} | actor: {item.actor || "-"}{" "}
                    {item.paymentMethod ? `| pago: ${item.paymentMethod}` : ""}
                    {!item.countsInBalance ? " | informativa" : ""}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
