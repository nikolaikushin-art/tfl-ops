// Film Location settings: one pure module (no React, no browser) so every rule is unit-tested.
// They are stored inside the TFL data blob (key __settings), so they sync to the server with the records.

export interface TflSettings {
  /** Is TFL VAT registered? When off, new quotations and invoices start at 0% VAT. */
  vatRegistered: boolean;
  vatPct: number;
  currency: string;
  paymentTermsDays: number;
  quoteValidDays: number;
  /** New enquiries get a follow-up date this many days ahead. */
  followUpDays: number;
  /** Permits, insurance and contracts count as "expiring soon" this many days ahead. */
  expiryWarnDays: number;
  /** Bookings and shoots starting within this many days count as "starting soon". */
  bookingSoonDays: number;
  /** Public liability cover below this (GBP) is flagged. 0 turns the check off. */
  minCover: number;
  /** A confirmed booking is flagged until these papers are in. */
  requireInsurance: boolean;
  requireRams: boolean;
  quotePrefix: string;
  invoicePrefix: string;
  paymentPrefix: string;
  /** How far ahead the Calendar looks when opened. */
  calendarDays: number;
}

export const CURRENCIES = ["GBP", "EUR", "USD", "AED"];
export const CALENDAR_RANGES = [7, 14, 30, 60, 90];

export const SETTINGS_DEFAULTS: TflSettings = {
  vatRegistered: true,
  vatPct: 20,
  currency: "GBP",
  paymentTermsDays: 30,
  quoteValidDays: 30,
  followUpDays: 3,
  expiryWarnDays: 30,
  bookingSoonDays: 14,
  minCover: 5_000_000,
  requireInsurance: true,
  requireRams: true,
  quotePrefix: "Q-",
  invoicePrefix: "INV-",
  paymentPrefix: "PAY-",
  calendarDays: 30,
};

const num = (v: unknown, fallback: number, min: number, max: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const str = (v: unknown, fallback: string, max = 12) => (typeof v === "string" ? v.trim().slice(0, max) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

/** Turns anything saved (old, partial, hand-edited, from the server) into valid settings. */
export function resolveSettings(raw: unknown): TflSettings {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const d = SETTINGS_DEFAULTS;
  const currency = typeof r.currency === "string" && CURRENCIES.includes(r.currency) ? r.currency : d.currency;
  return {
    vatRegistered: bool(r.vatRegistered, d.vatRegistered),
    vatPct: num(r.vatPct, d.vatPct, 0, 100),
    currency,
    paymentTermsDays: Math.round(num(r.paymentTermsDays, d.paymentTermsDays, 0, 365)),
    quoteValidDays: Math.round(num(r.quoteValidDays, d.quoteValidDays, 1, 365)),
    followUpDays: Math.round(num(r.followUpDays, d.followUpDays, 0, 60)),
    expiryWarnDays: Math.round(num(r.expiryWarnDays, d.expiryWarnDays, 1, 365)),
    bookingSoonDays: Math.round(num(r.bookingSoonDays, d.bookingSoonDays, 1, 180)),
    minCover: Math.round(num(r.minCover, d.minCover, 0, 1_000_000_000)),
    requireInsurance: bool(r.requireInsurance, d.requireInsurance),
    requireRams: bool(r.requireRams, d.requireRams),
    quotePrefix: str(r.quotePrefix, d.quotePrefix),
    invoicePrefix: str(r.invoicePrefix, d.invoicePrefix),
    paymentPrefix: str(r.paymentPrefix, d.paymentPrefix),
    calendarDays: CALENDAR_RANGES.includes(Number(r.calendarDays)) ? Number(r.calendarDays) : d.calendarDays,
  };
}

/** Today as YYYY-MM-DD in the browser's local day. */
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** A date n days after an ISO date (n may be negative). Returns "" for a bad date. */
export function addDays(iso: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + n * 864e5;
  return new Date(t).toISOString().slice(0, 10);
}

/** Next reference in a series: highest number already used with this prefix, plus one (INV-0007 → INV-0008). */
export function nextRef(prefix: string, existing: unknown[]): string {
  const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${esc}(\\d+)$`);
  let max = 0;
  for (const e of existing) {
    const m = re.exec(String(e ?? "").trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}
