import type { InputHTMLAttributes } from "react";
import styles from "./ExpirationInput.module.css";

export function expirationDays(value: string): string {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  const today = new Date();
  return String(Math.round((Date.UTC(year, month - 1, day) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000));
}

export default function ExpirationInput({ value, onChange, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & { value: string; onChange: (value: string) => void }) {
  return <span className={styles.row}>
    <input {...props} type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    <input className={props.className} aria-label={`Dias hasta ${props["aria-label"] || "vencimiento"}`} type="number" step="1" placeholder="Dias" value={expirationDays(value)} disabled={props.disabled} onChange={(event) => {
      if (!event.target.value) { onChange(""); return; }
      const days = Number(event.target.value);
      if (!Number.isSafeInteger(days)) return;
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() + days);
      if (!Number.isFinite(date.getTime()) || date.getFullYear() < 1 || date.getFullYear() > 9999) return;
      onChange(`${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`);
    }} />
  </span>;
}
