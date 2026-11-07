import { useSyncExternalStore } from "react";
import { MODULES, MODULE_ORDER, seed, type TflKey, type TflRecord } from "./model";

const KEY = "tfl.data.v1";
import { resolveSettings, type TflSettings } from "./settings";
type Data = Record<TflKey, TflRecord[]> & { __settings?: Partial<TflSettings> };
const listeners = new Set<() => void>();

/** Legacy records linked by name. Rewrite every link field to the target record's id (idempotent). */
function migrate(d: Data): Data {
  const out = { ...d };
  for (const k of MODULE_ORDER) {
    const refs = MODULES[k].fields.filter((f) => f.ref);
    if (!refs.length) continue;
    out[k] = d[k].map((r) => {
      let next: TflRecord | null = null;
      for (const f of refs) {
        const v = r[f.key];
        if (!v) continue;
        const target = d[f.ref!];
        if (target.some((t) => t.id === v)) continue;
        const hit = target.find((t) => String(t[MODULES[f.ref!].titleKey]) === v);
        if (hit) next = { ...(next ?? r), [f.key]: hit.id };
      }
      return next ?? r;
    });
  }
  return out;
}

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate({ ...seed(), ...JSON.parse(raw) });
  } catch { /* ignore */ }
  return migrate(seed());
}

/** Display name of a linked record. Unmatched legacy text is shown as typed. */
export function refLabel(d: Data, k: TflKey, id: unknown): string {
  if (id === undefined || id === null || id === "") return "";
  const r = d[k].find((x) => x.id === id);
  return r ? String(r[MODULES[k].titleKey] ?? "") : String(id);
}

/** All of a record's text with links resolved to names (for search and sample detection). */
export function textOf(d: Data, k: TflKey, r: TflRecord): string {
  const parts = Object.entries(r).map(([key, v]) => {
    const f = MODULES[k].fields.find((x) => x.key === key);
    return f?.ref ? refLabel(d, f.ref, v) : String(v ?? "");
  });
  return parts.join(" ");
}
let data: Data = load();
const persist = () => {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
  // Tells the server sync that something changed (same event the main store uses).
  try { window.dispatchEvent(new Event("tfl:saved")); } catch { /* ignore */ }
};
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export const tflActions = {
  save(key: TflKey, rec: Partial<TflRecord> & { id?: string }) {
    const list = data[key];
    const id = rec.id ?? `${key[0]}${Date.now().toString(36)}`;
    const next = { ...(list.find((r) => r.id === id) ?? {}), ...rec, id } as TflRecord;
    data = { ...data, [key]: list.some((r) => r.id === id) ? list.map((r) => (r.id === id ? next : r)) : [next, ...list] };
    persist();
  },
  /** Add many records at once (CSV import). Each gets its own unique id, newest batch first. */
  importMany(key: TflKey, recs: Partial<TflRecord>[]) {
    const taken = new Set(data[key].map((r) => r.id));
    const stamp = Date.now().toString(36);
    const added = recs.map((rec, i) => {
      let id = `${key[0]}${stamp}${i.toString(36)}`;
      while (taken.has(id)) id += "x";
      taken.add(id);
      return { ...rec, id } as TflRecord;
    });
    data = { ...data, [key]: [...added, ...data[key]] };
    persist();
    return added.length;
  },
  remove(key: TflKey, id: string) {
    const next = { ...data, [key]: data[key].filter((r) => r.id !== id) };
    // Blank any link that pointed at the removed record so nothing dangles.
    for (const k of MODULE_ORDER) {
      const refs = MODULES[k].fields.filter((f) => f.ref === key);
      if (refs.length) next[k] = next[k].map((r) => (refs.some((f) => r[f.key] === id) ? { ...r, ...Object.fromEntries(refs.filter((f) => r[f.key] === id).map((f) => [f.key, ""])) } : r));
    }
    data = next;
    persist();
  },
  clearSamples() {
    const empty = { __settings: data.__settings } as Data;
    MODULE_ORDER.forEach((k) => { empty[k] = data[k].filter((r) => !/sample/i.test(textOf(data, k, r))); });
    // Links to removed sample records are blanked.
    MODULE_ORDER.forEach((k) => {
      const refs = MODULES[k].fields.filter((f) => f.ref);
      if (refs.length) empty[k] = empty[k].map((r) => {
        const n = { ...r };
        refs.forEach((f) => { if (n[f.key] && !empty[f.ref!].some((t) => t.id === n[f.key])) n[f.key] = ""; });
        return n;
      });
    });
    data = empty; persist();
  },
  /** Change Film Location settings. Stored with the records, so they sync to the server too. */
  setSettings(patch: Partial<TflSettings>) {
    data = { ...data, __settings: resolveSettings({ ...resolveSettings(data.__settings), ...patch }) };
    persist();
  },
  exportJson: () => JSON.stringify(data, null, 2),
};

/** Used by the server sync: read the saved copy, or replace everything with the server's copy. */
export const tflSync = {
  raw(): string | null {
    try { return localStorage.getItem(KEY); } catch { return null; }
  },
  replace(incoming: unknown) {
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return;
    const src = incoming as Record<string, unknown>;
    const clean: Partial<Data> = {};
    for (const k of MODULE_ORDER) if (Array.isArray(src[k])) clean[k] = src[k] as TflRecord[];
    if (src.__settings && typeof src.__settings === "object") clean.__settings = resolveSettings(src.__settings);
    data = migrate({ ...seed(), ...clean });
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
    listeners.forEach((l) => l());
  },
};

/** The current settings, always complete and valid. */
export function useTflSettings(): TflSettings {
  const d = useSyncExternalStore(subscribe, () => data, () => data);
  return resolveSettings(d.__settings);
}
export const readTflSettings = (): TflSettings => resolveSettings(data.__settings);

export function useTfl(): Data {
  return useSyncExternalStore(subscribe, () => data, () => data);
}
export { MODULES };

/** Bookings on the same location whose dates overlap (ignoring cancelled). */
export function bookingClashes(bookings: TflRecord[]) {
  const live = bookings.filter((b) => b.status !== "Cancelled" && b.startDate && b.endDate);
  const out = new Set<string>();
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if (a.location === b.location && a.startDate <= b.endDate && b.startDate <= a.endDate) { out.add(a.id); out.add(b.id); }
    }
  return out;
}

/** Records in other modules that link to this one, grouped by module and field. */
export function relatedTo(d: Data, k: TflKey, id: string) {
  const out: { mod: TflKey; field: string; label: string; recs: TflRecord[] }[] = [];
  for (const mk of MODULE_ORDER)
    for (const f of MODULES[mk].fields.filter((x) => x.ref === k)) {
      const recs = d[mk].filter((r) => r[f.key] === id);
      if (recs.length) out.push({ mod: mk, field: f.key, label: f.label, recs });
    }
  return out;
}

// Which record is open. Shared so a link in one module can open a record in another.
type Focus = { k: TflKey; id: string } | null;
let focus: Focus = null;
const focusListeners = new Set<() => void>();
const setFocus = (f: Focus) => { focus = f; focusListeners.forEach((l) => l()); };
export const tflNav = {
  open(k: TflKey, id: string) {
    setFocus({ k, id });
    window.dispatchEvent(new CustomEvent("tfl:navigate", { detail: `tfl-${k}` }));
  },
  close: () => setFocus(null),
  current: () => focus,
};
export function useTflFocus(): Focus {
  return useSyncExternalStore((l) => { focusListeners.add(l); return () => focusListeners.delete(l); }, () => focus, () => focus);
}
