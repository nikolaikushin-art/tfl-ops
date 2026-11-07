// CSV import / export for TFL modules. Pure (no React, no browser), unit-tested offline.
import { MODULES, type FieldDef, type TflKey } from "@/tfl/model";
import { newRecordDefaults, validateRecord } from "@/lib/tflRecords";

export type Rec = Record<string, string | number>;

/** Parse CSV text (comma, semicolon or tab separated; quotes; CRLF; BOM) into rows of cells. */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^\uFEFF/, "");
  const first = t.split(/\r?\n/, 1)[0] ?? "";
  const count = (c: string) => { let n = 0, q = false; for (const ch of first) { if (ch === '"') q = !q; else if (ch === c && !q) n++; } return n; };
  const delim = [",", ";", "\t"].map((c) => [c, count(c)] as const).sort((a, b) => b[1] - a[1])[0];
  const sep = delim[1] > 0 ? delim[0] : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(cell); cell = ""; rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Stops spreadsheet apps from running a cell as a formula. Phone numbers and negatives are left alone. */
const safe = (v: string) => (/^[=@]|^[+\-][^\d\s(]/.test(v) ? `'${v}` : v);
const esc = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Whole module as CSV text. `label(module, id)` turns a link into the linked record's name. */
export function toCsv(k: TflKey, records: Rec[], label: (mod: TflKey, id: unknown) => string): string {
  const fields = MODULES[k].fields;
  const head = fields.map((f) => esc(f.label)).join(",");
  const body = records.map((r) => fields.map((f) => esc(safe(f.ref ? label(f.ref, r[f.key]) : String(r[f.key] ?? "")))).join(","));
  return "\uFEFF" + [head, ...body].join("\r\n") + "\r\n";
}

/** Header-only file to fill in. */
export const csvTemplate = (k: TflKey) => "\uFEFF" + MODULES[k].fields.map((f) => esc(f.label)).join(",") + "\r\n";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Day-first (UK) dates and ISO dates to YYYY-MM-DD, or null. */
export function toIsoDate(v: string): string | null {
  const s = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/.exec(s))) { d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

function toNumber(v: string): number | null {
  const s = v.replace(/(AED|USD|EUR|GBP|[£€$])/gi, "").replace(/[,\s]/g, "").replace(/%$/, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type ImportResult = {
  records: Rec[];                         // ready to save (no ids yet)
  skipped: { line: number; reason: string }[];
  warnings: { line: number; message: string }[];
  unknownColumns: string[];
  fatal?: string;
};

/**
 * Turn parsed CSV rows into records. Columns match a field by its label or key (any case).
 * Links are matched by the linked record's name via `resolve`. Rows with problems are skipped, never guessed.
 * Rows whose title already exists (or repeats inside the file) are skipped as duplicates.
 */
export function mapRows(k: TflKey, rows: string[][], resolve: (mod: TflKey, name: string) => string | null, existingTitles: string[]): ImportResult {
  const out: ImportResult = { records: [], skipped: [], warnings: [], unknownColumns: [] };
  if (rows.length < 2) { out.fatal = "The file has no data rows."; return out; }
  const m = MODULES[k];
  const cols: (FieldDef | null)[] = rows[0].map((h) => m.fields.find((f) => norm(f.label) === norm(h) || norm(f.key) === norm(h)) ?? null);
  rows[0].forEach((h, i) => { if (!cols[i] && h.trim()) out.unknownColumns.push(h.trim()); });
  if (!cols.some((c) => c && c.key === m.titleKey)) { out.fatal = `The file needs a "${m.fields.find((f) => f.key === m.titleKey)!.label}" column.`; return out; }
  const seen = new Set(existingTitles.map((t) => t.trim().toLowerCase()));

  rows.slice(1).forEach((cells, idx) => {
    const line = idx + 2;
    const rec: Rec = {};
    const problems: string[] = [];
    cols.forEach((f, i) => {
      const raw = (cells[i] ?? "").trim().replace(/^'(?=[=@+\-])/, "");
      if (!f || raw === "") return;
      if (f.ref) {
        const id = resolve(f.ref, raw);
        if (id) rec[f.key] = id; else out.warnings.push({ line, message: `${f.label} "${raw}" is not in ${MODULES[f.ref].title}; left blank.` });
      } else if (f.type === "select") {
        const hit = f.options!.find((o) => norm(o) === norm(raw));
        if (hit) rec[f.key] = hit; else problems.push(`${f.label} "${raw}" is not one of: ${f.options!.join(", ")}.`);
      } else if (f.type === "number") {
        const n = toNumber(raw);
        if (n === null) problems.push(`${f.label} "${raw}" is not a number.`); else rec[f.key] = n;
      } else if (f.type === "date") {
        const d = toIsoDate(raw);
        if (!d) problems.push(`${f.label} "${raw}" is not a date (use DD/MM/YYYY or YYYY-MM-DD).`); else rec[f.key] = d;
      } else rec[f.key] = raw;
    });
    const merged: Rec = { ...newRecordDefaults(k), ...rec };
    const errs = validateRecord(k, merged);
    Object.values(errs).forEach((e) => problems.push(e));
    const title = String(merged[m.titleKey] ?? "").trim().toLowerCase();
    if (!problems.length && title && seen.has(title)) problems.push("Already exists (same name); not imported twice.");
    if (problems.length) { out.skipped.push({ line, reason: problems.join(" ") }); return; }
    if (title) seen.add(title);
    out.records.push(merged);
  });
  return out;
}
