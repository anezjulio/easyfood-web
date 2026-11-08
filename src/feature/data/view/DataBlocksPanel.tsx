import { useState } from "react";
import { composeDataBlocksApi, exportDataBlocksApi, type DataBlock, type BlockSource, type ComposeDraft, type DataStoreSummary } from "../service/data.api";
import styles from "./DataScreen.module.css";

const BLOCKS: Array<{ id: DataBlock; title: string; description: string }> = [
  { id: "catalog", title: "Productos", description: "Productos, ingredientes, categorias, recetas, combos, precios e imagenes. Sin existencias ni operaciones." },
  { id: "operations", title: "Operaciones", description: "Ventas, compras, facturas, recibos, jornadas, caja y movimientos financieros. Requiere un catalogo compatible." },
  { id: "stock", title: "Stock", description: "Movimientos, saldos de ingredientes, minimos y vencimientos. Requiere los mismos identificadores de productos e ingredientes." },
];

export default function DataBlocksPanel({ stores, activeStoreId, username, onSaved }: {
  stores: DataStoreSummary[]; activeStoreId: string; username: string; onSaved: () => Promise<void>;
}) {
  const [origin, setOrigin] = useState(activeStoreId);
  const [target, setTarget] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [sources, setSources] = useState<Partial<Record<DataBlock, { origin: string; content?: string; filename?: string }>>>({});
  const [preview, setPreview] = useState<{ draft: ComposeDraft; summary: Record<string, number> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const update = () => { setPreview(null); setMessage(""); setError(""); };

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo completar la accion."); }
    finally { setBusy(false); }
  }

  async function download(block: DataBlock) {
    await run(async () => {
      if (!password) throw new Error("Ingresa la clave admin.");
      const result = await exportDataBlocksApi({ requestedBy: username, adminPassword: password, storeId: origin, blocks: [block] });
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a"); link.href = url; link.download = result.filename; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Respaldo descargado.");
    });
  }

  async function inspect() {
    await run(async () => {
      if (!password) throw new Error("Ingresa la clave admin.");
      const selected: BlockSource[] = [];
      for (const block of BLOCKS) {
        const source = sources[block.id];
        if (!source) continue;
        if (source.origin === "file" && !source.content) throw new Error(`Carga un respaldo para ${block.title}.`);
        selected.push({ block: block.id, ...(source.origin === "file" ? { content: source.content } : { storeId: source.origin }) });
      }
      const draft = { requestedBy: username, adminPassword: password, targetStoreId: target || undefined, name, sources: selected };
      const result = await composeDataBlocksApi(draft, "preview");
      setPreview({ draft, summary: result.summary });
    });
  }

  return <>
    <section className={styles.panel}>
      <h2 className={styles.title}>Respaldos por bloques</h2>
      <label className={styles.field}>Base de origen<select className={styles.input} value={origin} disabled={busy} onChange={(e) => setOrigin(e.target.value)}>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      <label className={styles.field}>Clave admin<input className={styles.input} type="password" autoComplete="current-password" value={password} disabled={busy} onChange={(e) => { update(); setPassword(e.target.value); }} /></label>
      <div className={styles.storeList}>{BLOCKS.map((block) => <article className={styles.storeCard} key={block.id}>
        <h3>{block.title}</h3><p className={styles.hint}>{block.description}</p>
        <button className={styles.secondaryButton} disabled={busy} onClick={() => void download(block.id)}>Descargar {block.title.toLowerCase()}</button>
      </article>)}</div>
    </section>
    <section className={styles.panel}>
      <h2 className={styles.title}>Combinar o copiar bloques</h2>
      <p className={styles.hint}>Elige un origen por bloque: una base disponible o un respaldo completo/parcial. Se conservan los identificadores. No se suman existencias ni se mezclan registros dentro de un bloque. Los respaldos antiguos .js solo recuperan los datos y archivos que contienen; los nuevos incluyen imagenes y recibos.</p>
      <label className={styles.field}>Destino<select className={styles.input} value={target} disabled={busy} onChange={(e) => { update(); setTarget(e.target.value); }}><option value="">Crear nueva base</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      {!target && <label className={styles.field}>Nombre de la nueva base<input className={styles.input} value={name} disabled={busy} onChange={(e) => { update(); setName(e.target.value); }} /></label>}
      {BLOCKS.map((block) => <article className={styles.storeCard} key={block.id}>
        <label className={styles.field}>{block.title}<select className={styles.input} value={sources[block.id]?.origin || ""} disabled={busy} onChange={(e) => {
          update(); const value = e.target.value;
          setSources((previous) => ({ ...previous, [block.id]: value ? { origin: value } : undefined }));
        }}><option value="">{target ? "Conservar destino" : "Sin datos"}</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}<option value="file">Cargar respaldo...</option></select></label>
        {sources[block.id]?.origin === "file" && <label className={styles.field}>Archivo de {block.title.toLowerCase()}<input type="file" accept=".js,.json" disabled={busy} onChange={(e) => {
          update(); const file = e.target.files?.[0];
          setSources((previous) => ({ ...previous, [block.id]: { origin: "file" } }));
          if (file) void run(async () => { const content = await file.text(); setSources((previous) => ({ ...previous, [block.id]: { origin: "file", content, filename: file.name } })); });
        }} /></label>}
      </article>)}
      <p className={styles.hint}>Los bloques elegidos reemplazan los del destino. Los demas se conservan. Se guarda un respaldo previo al modificar una base existente. La nueva base conserva los usuarios y ajustes generales actuales y no se activa automaticamente.</p>
      <button className={styles.secondaryButton} disabled={busy} onClick={() => void inspect()}>Revisar combinacion</button>
      {preview && <div className={styles.storeCard}>
        <h3>Vista previa: {target ? stores.find((store) => store.id === target)?.name : name}</h3>
        <div className={styles.summaryGrid}>{Object.entries(preview.summary).map(([key, count]) => <span key={key}>{key}: <strong>{count}</strong></span>)}</div>
        <button className={styles.primaryButton} disabled={busy} onClick={() => void run(async () => {
          const result = await composeDataBlocksApi(preview.draft, "apply"); setPreview(null); setPassword("");
          setMessage(result.message + (result.recoveryPath ? ` Respaldo previo: ${result.recoveryPath}` : "")); await onSaved();
        })}>{target ? "Confirmar reemplazo de bloques" : "Crear base con estos bloques"}</button>
      </div>}
    </section>
    {message && <p className={styles.success} role="status">{message}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </>;
}
