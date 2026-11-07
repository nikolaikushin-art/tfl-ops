// Pure rules for TFL module fields: defaults for new records, validation, VAT totals.
// No React or browser here, so it is unit-tested offline.
import { MODULES, type FieldDef, type TflKey } from "@/tfl/model";
import { addDays, nextRef, resolveSettings, type TflSettings } from "@/tfl/settings";

type Form = Record<string, string | number | undefined>;

const today = () => new Date().toISOString().slice(0, 10);

/** Starting values for a NEW record: every field's `default` ("today" becomes today's date). */
export function newRecordDefaults(
  k: TflKey,
  ctx?: { settings?: Partial<TflSettings>; data?: Partial<Record<TflKey, Record<string, unknown>[]>> },
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const f of MODULES[k].fields) {
    if (f.default === undefined) continue;
    out[f.key] = f.default === "today" && f.type === "date" ? today() : f.default;
  }
  if (!ctx?.settings) return out;
  // Film Location settings: currency, VAT, payment terms, valid-until, follow-up and numbering.
  const s = resolveSettings(ctx.settings);
  const has = (key: string) => MODULES[k].fields.some((f) => f.key === key);
  const t = today();
  if (has("currency")) out.currency = s.currency;
  if (has("vatPct")) out.vatPct = s.vatRegistered ? s.vatPct : 0;
  if (k === "productions" && has("paymentTerms")) out.paymentTerms = s.paymentTermsDays;
  if (k === "quotes") out.validUntil = addDays(t, s.quoteValidDays);
  if (k === "invoices") out.due = addDays(t, s.paymentTermsDays);
  if (k === "enquiries") out.followUp = addDays(t, s.followUpDays);
  const prefix = k === "quotes" ? s.quotePrefix : k === "invoices" ? s.invoicePrefix : k === "payments" ? s.paymentPrefix : "";
  if (prefix) out.ref = nextRef(prefix, (ctx.data?.[k] ?? []).map((r) => r.ref));
  return out;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const blank = (v: unknown) => v === undefined || v === null || v === "";

/** Only http(s) links are accepted (and rendered), never javascript: or data: URLs. */
export function isHttpUrl(v: string): boolean {
  try { const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`); return u.protocol === "http:" || u.protocol === "https:"; }
  catch { return false; }
}
export const toHttpUrl = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://${v}`);

function fieldError(f: FieldDef, v: unknown): string {
  if (blank(v)) return f.required ? `${f.label} is required.` : "";
  if (f.type === "email" && !EMAIL.test(String(v).trim())) return "Enter a valid email address.";
  if (f.type === "url" && !isHttpUrl(String(v).trim())) return "Enter a web address starting with http(s)://.";
  if (f.type === "tel" && !/^[+()\d][\d\s().\-+]{4,}$/.test(String(v).trim())) return "Enter a valid phone number.";
  if (f.type === "number") {
    const n = Number(v);
    if (!Number.isFinite(n)) return "Enter a number.";
    if (n < 0) return "Cannot be negative.";
  }
  return "";
}

/** Date pairs that must be in order: [earlier field, later field, message]. */
const ORDER: Partial<Record<TflKey, [string, string, string][]>> = {
  bookings: [["startDate", "endDate", "The end date cannot be before the start date."]],
  enquiries: [["shootStart", "shootEnd", "The shoot end cannot be before the shoot start."]],
  quotes: [["issued", "validUntil", "A quotation cannot expire before it is issued."]],
  invoices: [["issued", "due", "The due date cannot be before the issue date."]],
  contracts: [["signedOn", "expires", "A contract cannot expire before it is signed."]],
  permits: [["applied", "expires", "A permit cannot expire before it was applied for."]],
};

/** Errors by field key. Empty object = the record can be saved. */
export function validateRecord(k: TflKey, form: Form): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of MODULES[k].fields) {
    const e = fieldError(f, form[f.key]);
    if (e) errors[f.key] = e;
  }
  for (const [a, b, msg] of ORDER[k] ?? []) {
    if (!errors[b] && !blank(form[a]) && !blank(form[b]) && String(form[b]) < String(form[a])) errors[b] = msg;
  }
  if (k === "invoices" && !errors.paid && !errors.amount) {
    if (Number(form.paid || 0) > grossOf(form) + 0.005) errors.paid = "Paid so far is more than the invoice total.";
  }
  return errors;
}

/** VAT amount for a quote or invoice. Records without vatPct count as 0%. */
export const vatOf = (r: Form) => round2((Number(r.amount) || 0) * (Number(r.vatPct) || 0) / 100);
/** Amount including VAT. */
export const grossOf = (r: Form) => round2((Number(r.amount) || 0) + vatOf(r));
/** What is still owed on an invoice (never below zero). */
export const balanceOf = (r: Form) => Math.max(0, round2(grossOf(r) - (Number(r.paid) || 0)));
function round2(n: number) { return Math.round(n * 100) / 100; }

/** Order two cell values: numbers by value, everything else by text (blank last, either direction). */
export function compareCells(a: unknown, b: unknown, numeric: boolean, dir: 1 | -1): number {
  const ea = a === undefined || a === null || a === "", eb = b === undefined || b === null || b === "";
  if (ea || eb) return ea && eb ? 0 : ea ? 1 : -1;
  const r = numeric ? (Number(a) || 0) - (Number(b) || 0) : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  return r * dir;
}

/** "£12,000", "€1,250.50", "AED 800": en-GB formatting, whole numbers without pence. */
export function formatMoney(n: unknown, currency = "GBP"): string {
  const v = Number(n) || 0;
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency || "GBP", minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${currency} ${v.toLocaleString("en-GB")}`;
  }
}

/** YYYY-MM-DD to DD/MM/YYYY (UK). Anything else is returned as typed. */
export function formatUkDate(v: unknown): string {
  const s = String(v ?? "");
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

/** Add up a value per currency, so pounds and euros are never mixed into one number. */
export function sumByCurrency<T extends Record<string, unknown>>(list: T[], value: (r: T) => number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of list) {
    const c = String(r.currency || "GBP");
    out[c] = round2((out[c] ?? 0) + value(r));
  }
  return out;
}

/** Headline figure for a tile: the GBP total, plus a short note when other currencies are involved. */
export function currencyTile(sums: Record<string, number>): { value: string; sub?: string } {
  const gbp = sums.GBP ?? 0;
  const others = Object.entries(sums).filter(([c, v]) => c !== "GBP" && v !== 0).map(([c, v]) => formatMoney(v, c));
  return { value: formatMoney(gbp, "GBP"), sub: others.length ? `+ ${others.join(", ")}` : undefined };
}
