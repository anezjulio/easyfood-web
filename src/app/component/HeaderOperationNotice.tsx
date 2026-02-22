import styles from "./HeaderOperationNotice.module.css";

type HeaderOperationNoticeProps = {
  message?: string | null;
  error?: string | null;
  onClose: () => void;
  className?: string;
};

export default function HeaderOperationNotice({ message, error, onClose, className = "" }: HeaderOperationNoticeProps) {
  const normalizedError = String(error || "").trim();
  const normalizedMessage = String(message || "").trim();
  const text = normalizedError || normalizedMessage;
  const hasText = text.length > 0;

  return (
    <div className={`${styles.wrap} ${className}`.trim()} aria-live="polite" aria-atomic="true">
      <div
        className={`${styles.notice} ${
          normalizedError ? styles.noticeError : normalizedMessage ? styles.noticeSuccess : styles.noticeEmpty
        }`}
      >
        <span className={styles.text}>{hasText ? text : "\u00a0"}</span>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Cerrar mensaje"
          disabled={!hasText}
        >
          x
        </button>
      </div>
    </div>
  );
}

