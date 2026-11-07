/**
 * Backup / restore — ported from unique-ops. TFL keeps everything in this
 * browser (localStorage `tfl.*`), so one cleared cache would lose the data.
 * A backup is a single JSON file with every `tfl.*` key except per-device
 * session state.
 */
const APP_TAG = "tfl-crm-backup";
export const BACKUP_LAST_KEY = "tfl.backup.last";
const SKIP = new Set([BACKUP_LAST_KEY, "tfl.session", "tfl.session.v1"]);

const isAppKey = (k: string) => k.startsWith("tfl.") && !SKIP.has(k);

export function collectLocalData(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && isAppKey(k)) out[k] = localStorage.getItem(k) ?? "";
  }
  return out;
}

export function localUsageKb(): number {
  let bytes = 0;
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith("tfl.")) bytes += (localStorage.getItem(k) ?? "").length * 2;
  }
  return Math.round(bytes / 1024);
}

export function hasLocalData(): boolean {
  try {
    return !!localStorage.getItem("tfl.data.v20");
  } catch {
    return false;
  }
}

export function lastBackupAt(): Date | null {
  try {
    const raw = localStorage.getItem(BACKUP_LAST_KEY);
    return raw ? new Date(raw) : null;
  } catch {
    return null;
  }
}

export function backupAgeDays(): number | null {
  const d = lastBackupAt();
  return d ? Math.floor((Date.now() - d.getTime()) / 86400000) : null;
}

export interface BackupResult { filename: string; keys: number; bytes: number }

export function downloadBackup(): BackupResult {
  const data = collectLocalData();
  const payload = { app: APP_TAG, version: 1, exported_at: new Date().toISOString(), data };
  const json = JSON.stringify(payload);
  const stamp = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  const filename = `tfl-crm-backup-${stamp}.json`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  localStorage.setItem(BACKUP_LAST_KEY, new Date().toISOString());
  window.dispatchEvent(new Event("tfl:backup"));
  return { filename, keys: Object.keys(data).length, bytes: json.length };
}

export interface BackupSummary {
  exportedAt: string;
  keys: number;
  customers: number;
  quotations: number;
  orders: number;
  invoices: number;
}
export interface BackupPayload { app: string; data: Record<string, string> }

export async function readBackupFile(file: File): Promise<{ payload: BackupPayload; summary: BackupSummary }> {
  let payload: BackupPayload & { exported_at?: string };
  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new Error("This file is not valid JSON");
  }
  if (payload?.app !== APP_TAG || typeof payload.data !== "object" || payload.data === null) {
    throw new Error("This is not a TFL CRM backup file");
  }
  let store: Record<string, unknown[]> = {};
  try {
    store = JSON.parse(payload.data["tfl.data.v20"] ?? "{}");
  } catch { /* summary only */ }
  const n = (k: string) => (Array.isArray(store[k]) ? store[k].length : 0);
  return {
    payload,
    summary: {
      exportedAt: payload.exported_at ?? "",
      keys: Object.keys(payload.data).length,
      customers: n("customers"), quotations: n("quotations"), orders: n("orders"), invoices: n("invoices"),
    },
  };
}

/** Replaces current data with the backup; the caller reloads the page. */
export function restoreBackup(payload: BackupPayload): void {
  const remove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && isAppKey(k)) remove.push(k);
  }
  remove.forEach((k) => localStorage.removeItem(k));
  for (const [k, v] of Object.entries(payload.data)) if (isAppKey(k)) localStorage.setItem(k, v);
  localStorage.setItem(BACKUP_LAST_KEY, new Date().toISOString());
}

/** Wipes all TFL data from this browser (theme and credentials included). */
export function resetLocalData(): void {
  const remove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("tfl.") && k !== "tfl.web.theme") remove.push(k);
  }
  remove.forEach((k) => localStorage.removeItem(k));
}
