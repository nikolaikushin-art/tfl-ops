import { readModuleCfg, useModuleCfg } from "@/lib/moduleConfig";

/* ───────────── CSV export («CSV export» in module settings) ───────────── */

const esc = (v: unknown, d: string) => {
  const s = v == null ? "" : String(v);
  return s.includes('"') || s.includes(d) || /[\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Rows → CSV text with the module's delimiter. Without a module id the comma default is used. */
export function rowsToCsv(rows: unknown[][], id?: string): string {
  const d = id ? String(readModuleCfg(id).csvDelimiter ?? ",") : ",";
  return rows.map((r) => r.map((c) => esc(c, d)).join(d)).join("\n");
}

/** Saves CSV text; the BOM and the date in the file name follow the module's settings. */
export function saveCsvText(text: string, fileName: string, id?: string) {
  const cfg = id ? readModuleCfg(id) : null;
  const bom = cfg ? cfg.csvBom !== false : true;
  let name = fileName;
  if (cfg?.csvDateInName) name = name.replace(/(\.csv)?$/i, `-${new Date().toISOString().slice(0, 10)}.csv`);
  const blob = new Blob([bom ? "\uFEFF" + text : text], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** One call for the common case: rows → file. */
export function downloadRows(rows: unknown[][], fileName: string, id: string) {
  saveCsvText(rowsToCsv(rows, id), fileName, id);
}

/* ───────────── «Columns & elements» for parts a module hides in code ───────────── */

export const useElementOn = (id: string, key: string): boolean => useModuleCfg(id)[`el_${key}`] !== false;
export const elementOn = (id: string, key: string): boolean => readModuleCfg(id)[`el_${key}`] !== false;

/* ───────────── browser notifications of a module ───────────── */

export type PermState = "unsupported" | "granted" | "denied" | "default";
export function notificationState(): PermState {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission as PermState;
}
export async function askNotificationPermission(): Promise<PermState> {
  if (typeof Notification === "undefined") return "unsupported";
  try { return (await Notification.requestPermission()) as PermState; } catch { return "denied"; }
}

/** True while "now" is inside the quiet window (which may cross midnight). */
export function isQuietNow(q: { quietOn: boolean; quietFrom: string; quietTo: string }, now = new Date()): boolean {
  if (!q.quietOn) return false;
  const m = (t: string) => { const [h, mm] = t.split(":").map(Number); return (h || 0) * 60 + (mm || 0); };
  const cur = now.getHours() * 60 + now.getMinutes(), from = m(q.quietFrom), to = m(q.quietTo);
  if (from === to) return false;
  return from < to ? cur >= from && cur < to : cur >= from || cur < to;
}

export function playPing() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = 880; g.gain.value = 0.05;
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.18);
    o.onended = () => ctx.close();
  } catch { /* no audio */ }
}

/** Shows a notification for a module, honouring «Show details», sound and quiet hours. `force` = the “Send a test” button. */
export function notifyModule(id: string, title: string, detail: string, force = false): boolean {
  const c = readModuleCfg(id);
  if (!force && (!c.notify || isQuietNow({ quietOn: !!c.quietOn, quietFrom: String(c.quietFrom), quietTo: String(c.quietTo) }))) return false;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  const bare = c.notifyDetails === false && !force;
  try {
    new Notification(bare ? `${title}: needs attention` : title, { body: bare ? "Open the module" : detail, tag: `tfl-mod-${id}` });
    if (c.notifySound) playPing();
    return true;
  } catch { return false; }
}
