/**
 * The Film Location CRM — historical data import (v26).
 *
 * Roni's suggested order: contacts -> supplier offers and prices -> past deals
 * -> documents. Each source (spreadsheet, Xero export, WhatsApp, mailbox
 * extraction) lands in a REVIEW QUEUE first; nothing reaches the live records
 * until it is approved. Duplicates are checked against what is already held AND
 * against other rows waiting in the queue, so the same company arriving from two
 * sources is caught once.
 *
 * Pure functions. The screen reads the file, keeps the queue in storage and
 * calls the store when a row is approved.
 */
import type { Cell } from "@/lib/offerImport";
import { parseDate, parseDutyStatus, parseIncoterm, parseNumber } from "@/lib/offerImport";
import { normaliseCompanyName } from "@/lib/parties";
import type { ContactRole } from "@/lib/domain";

export type ImportKind = "contacts" | "offers" | "deals";
export type ImportSource = "spreadsheet" | "xero" | "whatsapp" | "email" | "folder";

export interface ColumnDef {
  key: string;
  header: string;
  example: string;
  required?: boolean;
  aliases?: string[];
}

export const KIND_ORDER: ImportKind[] = ["contacts", "offers", "deals"];
export const KIND_LABEL: Record<ImportKind, string> = {
  contacts: "1. Contacts (companies and people)",
  offers: "2. Supplier offers and prices",
  deals: "3. Past deals",
};

export const TEMPLATES: Record<ImportKind, ColumnDef[]> = {
  contacts: [
    { key: "company", header: "Company", example: "Maison Dupont SAS", required: true, aliases: ["name", "company name", "customer", "supplier"] },
    { key: "roles", header: "Roles", example: "buyer; trader", aliases: ["role", "type"] },
    { key: "country", header: "Country", example: "France" },
    { key: "city", header: "City", example: "Reims" },
    { key: "email", header: "Email", example: "orders@maison-dupont.fr", aliases: ["e-mail"] },
    { key: "phone", header: "Phone", example: "+33 1 23 45 67 89", aliases: ["telephone", "tel"] },
    { key: "whatsapp", header: "WhatsApp", example: "+33 6 12 34 56 78" },
    { key: "person", header: "Contact person", example: "Marc Dupont", aliases: ["contact", "person", "contact name"] },
    { key: "tags", header: "Tags", example: "champagne; wholesale" },
    { key: "notes", header: "Notes", example: "Met at ProWein" },
  ],
  offers: [
    { key: "supplier", header: "Supplier", example: "Spirits Trading BV", required: true },
    { key: "product", header: "Product", example: "Johnnie Walker Black Label 12x1L", required: true, aliases: ["description", "item"] },
    { key: "quantity", header: "Quantity", example: "500", aliases: ["qty", "cases"] },
    { key: "price", header: "Price", example: "212.50", required: true, aliases: ["unit price", "price per case"] },
    { key: "currency", header: "Currency", example: "EUR", aliases: ["ccy"] },
    { key: "date", header: "Date", example: "2025-11-04", aliases: ["offer date"] },
    { key: "duty", header: "T1/T2", example: "T2", aliases: ["duty status", "duty", "bond"] },
    { key: "incoterm", header: "Incoterm", example: "FCA Rotterdam", aliases: ["delivery"] },
    { key: "location", header: "Goods location", example: "Rotterdam", aliases: ["location of goods", "warehouse"] },
    { key: "validUntil", header: "Valid until", example: "2025-11-14", aliases: ["validity", "price validity"] },
    { key: "paymentTerms", header: "Payment terms", example: "Prepayment" },
    { key: "leadTime", header: "Lead time (days)", example: "5", aliases: ["lead time"] },
    { key: "minQuantity", header: "Minimum quantity", example: "100", aliases: ["moq", "min qty"] },
  ],
  deals: [
    { key: "ref", header: "Deal ref", example: "D-2025-014", required: true, aliases: ["reference", "ref"] },
    { key: "client", header: "Client", example: "Maison Dupont SAS", required: true, aliases: ["buyer", "customer"] },
    { key: "supplier", header: "Supplier", example: "Spirits Trading BV", required: true },
    { key: "warehouse", header: "Warehouse (escrow)", example: "Bonded Warehouse Rotterdam", aliases: ["escrow", "warehouse"] },
    { key: "product", header: "Product", example: "Johnnie Walker Black Label 12x1L", required: true },
    { key: "quantity", header: "Quantity", example: "500" },
    { key: "unit", header: "Unit", example: "cases" },
    { key: "currency", header: "Currency", example: "EUR", required: true },
    { key: "salePrice", header: "Sale price (total)", example: "100000", required: true, aliases: ["client paid", "sale"] },
    { key: "purchasePrice", header: "Purchase price (total)", example: "97000", required: true, aliases: ["supplier received", "purchase"] },
    { key: "escrowFees", header: "Escrow / warehouse fees", example: "400", aliases: ["escrow fees"] },
    { key: "bankCharges", header: "Bank charges", example: "60" },
    { key: "actualMargin", header: "Net margin received", example: "2540", aliases: ["net margin", "margin"] },
    { key: "duty", header: "T1/T2", example: "T2", aliases: ["duty status"] },
    { key: "origin", header: "Origin", example: "Scotland" },
    { key: "goodsLocation", header: "Goods location", example: "Rotterdam" },
    { key: "transit", header: "Transit", example: "" },
    { key: "destination", header: "Destination", example: "France" },
    { key: "depositDate", header: "Deposit date", example: "2025-10-01" },
    { key: "marginDate", header: "Margin received date", example: "2025-10-20" },
    { key: "inXero", header: "Already in Xero (yes/no)", example: "yes", aliases: ["in xero", "booked"] },
    { key: "notes", header: "Notes", example: "" },
  ],
};

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** A downloadable template: header row plus one example row. */
export function templateCsv(kind: ImportKind): string {
  const cols = TEMPLATES[kind];
  return [cols.map((c) => csvCell(c.header)).join(","), cols.map((c) => csvCell(c.example)).join(",")].join("\r\n") + "\r\n";
}

const norm = (h: unknown) => String(h ?? "").toLowerCase().replace(/[^a-z0-9/ ]/g, " ").replace(/\s+/g, " ").trim();

/** Which sheet column feeds which field. Returns the missing required fields too. */
export function mapColumns(kind: ImportKind, header: Cell[]): { map: Record<string, number>; missing: string[] } {
  const map: Record<string, number> = {};
  const cells = header.map(norm);
  for (const col of TEMPLATES[kind]) {
    const names = [col.header, col.key, ...(col.aliases ?? [])].map(norm);
    const idx = cells.findIndex((c) => names.includes(c));
    if (idx >= 0) map[col.key] = idx;
  }
  const missing = TEMPLATES[kind].filter((c) => c.required && map[c.key] === undefined).map((c) => c.header);
  return { map, missing };
}

/* ------------------------------- Queue items ------------------------------ */

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface ReviewItem {
  id: string;
  kind: ImportKind;
  source: ImportSource;
  sourceName: string;
  /** 1-based row in the file, for the person fixing it. */
  row: number;
  batchId: string;
  data: Record<string, string>;
  /** Problems that stop approval until fixed (missing / unreadable fields). */
  errors: string[];
  /** Soft warnings (shown, do not block). */
  warnings: string[];
  duplicateOf?: string;
  status: ReviewStatus;
  createdAt: string;
}

const text = (v: Cell): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").trim());

function validate(kind: ImportKind, d: Record<string, string>): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const c of TEMPLATES[kind]) if (c.required && !d[c.key]) errors.push(`${c.header} is missing`);
  const num = (k: string, label: string, required = false) => {
    if (d[k] === undefined || d[k] === "") return;
    if (parseNumber(d[k]) === undefined) errors.push(`${label} is not a number`);
    else if (required && (parseNumber(d[k]) as number) < 0) errors.push(`${label} cannot be negative`);
  };
  const date = (k: string, label: string) => {
    if (d[k] && !parseDate(d[k])) errors.push(`${label} is not a date`);
  };
  if (kind === "contacts") {
    if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) errors.push("Email does not look valid");
    if (!d.country) warnings.push("No country");
  }
  if (kind === "offers") {
    num("price", "Price", true);
    num("quantity", "Quantity");
    date("date", "Date");
    date("validUntil", "Valid until");
    if (d.duty && !parseDutyStatus(d.duty)) errors.push("T1/T2 must be T1 or T2 (nothing is duty paid)");
    if (!d.currency) warnings.push("No currency: EUR will be assumed");
    if (!d.duty) warnings.push("No T1/T2");
  }
  if (kind === "deals") {
    for (const k of ["salePrice", "purchasePrice", "escrowFees", "bankCharges", "actualMargin", "quantity"]) num(k, TEMPLATES.deals.find((c) => c.key === k)!.header);
    date("depositDate", "Deposit date");
    date("marginDate", "Margin received date");
    if (d.duty && !parseDutyStatus(d.duty)) errors.push("T1/T2 must be T1 or T2 (nothing is duty paid)");
    if (d.currency && !/^[A-Za-z]{3}$/.test(d.currency)) errors.push("Currency should be a 3-letter code");
    const sale = parseNumber(d.salePrice);
    const buy = parseNumber(d.purchasePrice);
    if (sale !== undefined && buy !== undefined && d.actualMargin) {
      const expected = sale - buy - (parseNumber(d.escrowFees) ?? 0) - (parseNumber(d.bankCharges) ?? 0);
      const got = parseNumber(d.actualMargin);
      if (got !== undefined && Math.abs(expected - got) > Math.max(1, Math.abs(expected) * 0.02)) {
        warnings.push(`Margin ${got} does not match sale - purchase - fees (${Math.round(expected * 100) / 100})`);
      }
    }
    if (!d.inXero) warnings.push("Already in Xero not stated: treated as yes, so it will not be posted again");
  }
  return { errors, warnings };
}

export function itemsFromRows(
  kind: ImportKind,
  rows: Cell[][],
  meta: { source: ImportSource; sourceName: string; batchId: string; nowIso: string },
): { items: ReviewItem[]; missingColumns: string[] } {
  if (rows.length < 2) return { items: [], missingColumns: [] };
  const { map, missing } = mapColumns(kind, rows[0]);
  if (missing.length) return { items: [], missingColumns: missing };
  const items: ReviewItem[] = [];
  rows.slice(1).forEach((r, i) => {
    const data: Record<string, string> = {};
    for (const [k, idx] of Object.entries(map)) data[k] = text(r[idx]);
    if (!Object.values(data).some(Boolean)) return;
    const v = validate(kind, data);
    items.push({
      id: `${meta.batchId}_${i + 2}`, kind, source: meta.source, sourceName: meta.sourceName, row: i + 2,
      batchId: meta.batchId, data, errors: v.errors, warnings: v.warnings, status: "pending", createdAt: meta.nowIso,
    });
  });
  return { items, missingColumns: [] };
}

/* ------------------------------- Duplicates ------------------------------- */

export interface Known {
  /** Existing companies in the directory. */
  companies: { name: string; country?: string; email?: string }[];
  offers: { supplierName: string; productName: string; unitPrice: number; currency: string }[];
  dealRefs: string[];
}

const emailKey = (e?: string) => (e ?? "").trim().toLowerCase();
const companyKey = (d: Record<string, string>) => `${normaliseCompanyName(d.company ?? "")}|${(d.country ?? "").trim().toLowerCase()}`;

/** The identity of a row, used to compare it with held records and with other queued rows. */
export function identityKeys(kind: ImportKind, d: Record<string, string>): string[] {
  if (kind === "contacts") {
    const keys: string[] = [];
    if (d.company) keys.push(`c:${companyKey(d)}`);
    if (d.email) keys.push(`e:${emailKey(d.email)}`);
    return keys;
  }
  if (kind === "offers") {
    const p = parseNumber(d.price);
    return [`o:${normaliseCompanyName(d.supplier ?? "")}|${(d.product ?? "").toLowerCase().replace(/\s+/g, " ").trim()}|${p ?? ""}|${(d.currency || "EUR").toUpperCase()}`];
  }
  return d.ref ? [`d:${d.ref.trim().toLowerCase()}`] : [];
}

function knownKeys(kind: ImportKind, known: Known): Map<string, string> {
  const m = new Map<string, string>();
  if (kind === "contacts") {
    for (const c of known.companies) {
      m.set(`c:${normaliseCompanyName(c.name)}|${(c.country ?? "").trim().toLowerCase()}`, `${c.name} in the directory`);
      if (c.email) m.set(`e:${emailKey(c.email)}`, `${c.name} in the directory`);
    }
  } else if (kind === "offers") {
    for (const o of known.offers) {
      m.set(`o:${normaliseCompanyName(o.supplierName)}|${o.productName.toLowerCase().replace(/\s+/g, " ").trim()}|${o.unitPrice}|${o.currency.toUpperCase()}`, "an offer already held");
    }
  } else {
    for (const r of known.dealRefs) m.set(`d:${r.trim().toLowerCase()}`, `deal ${r}`);
  }
  return m;
}

/**
 * Marks rows that duplicate a held record, or an EARLIER row in the queue (from
 * any source). The first row stays clean so exactly one copy can be approved.
 */
export function markDuplicates(items: ReviewItem[], known: Known): ReviewItem[] {
  const seen = new Map<string, { id: string; sourceName: string; row: number }>();
  const heldByKind = new Map<ImportKind, Map<string, string>>();
  return items.map((it) => {
    if (it.status === "rejected") return { ...it, duplicateOf: undefined };
    if (!heldByKind.has(it.kind)) heldByKind.set(it.kind, knownKeys(it.kind, known));
    const held = heldByKind.get(it.kind)!;
    const keys = identityKeys(it.kind, it.data).map((k) => `${it.kind}|${k}`);
    let dup: string | undefined;
    keys.forEach((k, n) => {
      const raw = identityKeys(it.kind, it.data)[n];
      if (held.has(raw)) dup = held.get(raw);
      else {
        const prior = seen.get(k);
        if (prior && prior.id !== it.id) dup = `row ${prior.row} of ${prior.sourceName}`;
      }
    });
    for (const k of keys) if (!seen.has(k)) seen.set(k, { id: it.id, sourceName: it.sourceName, row: it.row });
    return { ...it, duplicateOf: dup };
  });
}

/* ------------------------------ Approving rows ---------------------------- */

const splitList = (v?: string) => (v ?? "").split(/[;,]/).map((x) => x.trim()).filter(Boolean);

const ROLE_WORDS: Record<string, ContactRole> = {
  buyer: "buyer", customer: "buyer", supplier: "supplier", trader: "trader", warehouse: "warehouse", broker: "broker", agent: "broker",
};

export function rolesFrom(v?: string): ContactRole[] {
  const out = new Set<ContactRole>();
  for (const w of splitList(v)) {
    const r = ROLE_WORDS[w.toLowerCase()];
    if (r) out.add(r);
  }
  return out.size ? [...out] : ["buyer"];
}

/** "Marc Dupont" -> first/last; "Dupont, Marc" also works. Empty -> undefined. */
export function splitPersonName(v?: string): { firstName: string; lastName: string } | undefined {
  const t = (v ?? "").trim().replace(/\s+/g, " ");
  if (!t) return undefined;
  if (t.includes(",")) {
    const [last, first] = t.split(",").map((x) => x.trim());
    return { firstName: first || last, lastName: first ? last : "" };
  }
  const parts = t.split(" ");
  return parts.length === 1 ? { firstName: parts[0], lastName: "" } : { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function toPartyInput(d: Record<string, string>) {
  return {
    person: splitPersonName(d.person),
    name: d.company,
    roles: rolesFrom(d.roles),
    country: d.country || undefined,
    city: d.city || undefined,
    email: d.email || undefined,
    phone: d.phone || undefined,
  };
}

export function toOfferFields(d: Record<string, string>) {
  const inc = parseIncoterm(d.incoterm ?? "");
  return {
    supplierName: d.supplier,
    productName: d.product,
    quantity: parseNumber(d.quantity),
    unitPrice: parseNumber(d.price) as number,
    currency: (d.currency || "EUR").toUpperCase(),
    offerDate: parseDate(d.date),
    validUntil: parseDate(d.validUntil),
    dutyStatus: d.duty ? parseDutyStatus(d.duty) : undefined,
    incoterm: inc.incoterm,
    incotermPlace: inc.place,
    goodsLocation: d.location || undefined,
    paymentTerms: d.paymentTerms || undefined,
    leadTimeDays: parseNumber(d.leadTime),
    minQuantity: parseNumber(d.minQuantity),
  };
}

export interface DealLookup {
  clientId?: string;
  supplierId?: string;
  warehouseId?: string;
}

/** Finds a directory record by company name (case and legal-suffix insensitive). */
export function findByName<T extends { id: string; name: string }>(list: T[], name: string): T | undefined {
  const k = normaliseCompanyName(name);
  return k ? list.find((x) => normaliseCompanyName(x.name) === k) : undefined;
}

/** Past deals can only be approved once their client and supplier exist in the directory. */
export function dealBlockers(d: Record<string, string>, look: DealLookup): string[] {
  const out: string[] = [];
  if (!look.clientId) out.push(`Client "${d.client}" is not in the directory yet: approve the contacts first`);
  if (!look.supplierId) out.push(`Supplier "${d.supplier}" is not in the directory yet: approve the contacts first`);
  return out;
}

export function toDealFields(d: Record<string, string>, look: DealLookup) {
  const inXero = !/^(no|n|false|0)$/i.test((d.inXero ?? "").trim());
  const margin = parseNumber(d.actualMargin);
  return {
    clientId: look.clientId ?? "",
    supplierId: look.supplierId ?? "",
    warehouseId: look.warehouseId,
    productDescription: d.product,
    quantity: parseNumber(d.quantity) ?? 0,
    unit: d.unit || "cases",
    currency: (d.currency || "EUR").toUpperCase(),
    salePrice: parseNumber(d.salePrice) ?? 0,
    purchasePrice: parseNumber(d.purchasePrice) ?? 0,
    escrowFees: parseNumber(d.escrowFees) ?? 0,
    bankCharges: parseNumber(d.bankCharges) ?? 0,
    actualMargin: margin,
    dutyStatus: (d.duty ? parseDutyStatus(d.duty) : undefined) ?? ("T2" as const),
    origin: d.origin ?? "",
    goodsLocation: d.goodsLocation ?? "",
    transit: d.transit || undefined,
    destination: d.destination ?? "",
    depositDate: parseDate(d.depositDate),
    marginReceivedDate: parseDate(d.marginDate),
    notes: d.notes || undefined,
    // History is already in the books. Never offer it for posting again.
    stage: inXero ? ("booked" as const) : margin !== undefined ? ("margin_received" as const) : ("released" as const),
    xero: inXero ? { status: "reconciled" as const } : { status: "not_posted" as const },
    historical: true,
  };
}

/** Counts for the queue header. */
export function queueSummary(items: ReviewItem[]) {
  const pending = items.filter((i) => i.status === "pending");
  return {
    pending: pending.length,
    ready: pending.filter((i) => !i.errors.length && !i.duplicateOf).length,
    errors: pending.filter((i) => i.errors.length).length,
    duplicates: pending.filter((i) => i.duplicateOf && !i.errors.length).length,
    approved: items.filter((i) => i.status === "approved").length,
    rejected: items.filter((i) => i.status === "rejected").length,
  };
}
